const test = require("node:test");
const assert = require("node:assert/strict");
const ProxyGuard = require("../public/proxy-guard.js");
const { normalizeAndExpandAudioQuery } = require("../dist/assets/assetStudioLogic.js");

test("isSameOriginApiUrl targets JSON API endpoints and skips binary/SSE streams", () => {
    assert.equal(ProxyGuard.isSameOriginApiUrl("/api/assets/google-search", "https://example.run.app"), true);
    assert.equal(ProxyGuard.isSameOriginApiUrl("https://example.run.app/api/perchance/generate", "https://example.run.app"), true);
    assert.equal(ProxyGuard.isSameOriginApiUrl("/api/assets/proxy-image?url=https://x.com/a.jpg", "https://example.run.app"), false);
    assert.equal(ProxyGuard.isSameOriginApiUrl("/api/audio/proxy?url=https://x.com/a.mp3", "https://example.run.app"), false);
    assert.equal(ProxyGuard.isSameOriginApiUrl("/api/workspace/raw?path=Assets/a.png", "https://example.run.app"), false);
    assert.equal(ProxyGuard.isSameOriginApiUrl("/api/tasks/abc/stream", "https://example.run.app"), false);
    assert.equal(ProxyGuard.isSameOriginApiUrl("https://other-site.com/api/data", "https://example.run.app"), false);
});

test("parseJsonResponsePayload identifies __cookie_check.html HTTP 200 HTML redirects cleanly", () => {
    const cookieCheckHtml = `<!doctype html><html><head><title>Cookie check</title></head><body><script>const AUTH_FLOW_TEST_COOKIE_NAME = '__SECURE-aistudio_auth_flow_may_set_cookies';</script></body></html>`;
    assert.throws(
        () =>
            ProxyGuard.parseJsonResponsePayload({
                url: "https://ais-dev.run.app/__cookie_check.html?return_url=%2Fapi%2Fhealth",
                status: 200,
                ok: true,
                contentType: "text/html",
                text: cookieCheckHtml,
            }),
        (err) => err.isCookieCheck === true && err.isHtml === true && /Proxy session cookie/i.test(err.message)
    );
});

test("parseJsonResponsePayload identifies non-cookie HTML error pages with diagnostic details", () => {
    assert.throws(
        () =>
            ProxyGuard.parseJsonResponsePayload({
                url: "https://ais-dev.run.app/api/perchance/generate",
                status: 504,
                ok: false,
                contentType: "text/html",
                text: "<!doctype html><html><body>504 Gateway Timeout</body></html>",
            }),
        (err) => err.isHtml === true && err.status === 504 && /HTTP 504/.test(err.message)
    );
});

test("installApiFetchInterceptor recovers transparently from HTTP 200 __cookie_check redirect", async () => {
    let callCount = 0;
    let rehydrated = 0;
    const dispatched = [];
    const fakeWindow = {
        location: { origin: "https://ais-dev.run.app", href: "https://ais-dev.run.app/" },
        fetch: async (url) => {
            callCount++;
            if (callCount === 1) {
                return {
                    ok: true,
                    status: 200,
                    url: "https://ais-dev.run.app/__cookie_check.html?return_url=%2Fapi%2Fassets%2Fgoogle-search",
                    headers: { get: (k) => (k.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : "") },
                    clone() {
                        return { text: async () => "<!doctype html><title>Cookie check</title>" };
                    },
                    text: async () => "<!doctype html><title>Cookie check</title>",
                };
            }
            return {
                ok: true,
                status: 200,
                url: "https://ais-dev.run.app" + url,
                headers: { get: (k) => (k.toLowerCase() === "content-type" ? "application/json" : "") },
                text: async () => JSON.stringify({ results: [{ score: 99 }] }),
            };
        },
        dispatchEvent(ev) {
            dispatched.push(ev.type);
        },
    };
    const origWindow = global.window;
    const origCustomEvent = global.CustomEvent;
    global.window = fakeWindow;
    global.CustomEvent = function (type, opts) {
        this.type = type;
        this.detail = opts && opts.detail;
    };
    try {
        ProxyGuard.installApiFetchInterceptor({
            rehydrateFn: async () => {
                rehydrated++;
                return true;
            },
        });
        const res = await fakeWindow.fetch("/api/assets/google-search", { method: "POST" });
        const payload = ProxyGuard.parseJsonResponsePayload({
            url: res.url,
            status: res.status,
            ok: res.ok,
            contentType: res.headers.get("content-type"),
            text: await res.text(),
        });
        assert.equal(callCount, 2);
        assert.equal(rehydrated, 1);
        assert.equal(dispatched.length, 0);
        assert.equal(payload.results[0].score, 99);
    } finally {
        global.window = origWindow;
        global.CustomEvent = origCustomEvent;
    }
});

test("normalizeAndExpandAudioQuery matches woman laughing and anime girl giggling accurately", () => {
    const laugh = normalizeAndExpandAudioQuery("woman laughing");
    assert.equal(laugh.searchQueries[0], "female laugh");
    const giggle = normalizeAndExpandAudioQuery("anime girl giggling");
    assert.ok(giggle.searchQueries.includes("anime girl giggle"));
});

test("installApiFetchInterceptor does not throw when window.fetch is a getter-only property", async () => {
    let calls = 0;
    const nativeFetch = async (url) => {
        calls++;
        return {
            ok: true,
            status: 200,
            url: "https://ais-dev.run.app" + url,
            headers: { get: () => "application/json" },
            text: async () => JSON.stringify({ ok: true }),
        };
    };
    const fakeWindow = { location: { origin: "https://ais-dev.run.app", href: "https://ais-dev.run.app/" } };
    Object.defineProperty(fakeWindow, "fetch", {
        configurable: false,
        get: () => nativeFetch,
    });
    const origWindow = global.window;
    global.window = fakeWindow;
    try {
        const guarded = ProxyGuard.installApiFetchInterceptor({ rehydrateFn: async () => false });
        assert.equal(typeof guarded, "function");
        const res = await guarded("/api/health");
        assert.equal(calls, 1);
        assert.equal(res.ok, true);
    } finally {
        global.window = origWindow;
    }
});
