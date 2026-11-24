(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProxyGuard = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var AUTH_PATH_RE = /\/__cookie_check\.html|accounts\.google\.com|\/ServiceLogin|\/v3\/signin/i;
  var NON_JSON_API_RE = /\/api\/(workspace\/raw|assets\/proxy-image|audio\/proxy|audio\/tts|audio\/synthesize|perchance\/screenshot|.*\/stream)(\?|$)/i;

  function isCookieCheckUrl(url) {
    return AUTH_PATH_RE.test(String(url || ''));
  }

  function isSameOriginApiUrl(input, origin) {
    try {
      var raw = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!raw) return false;
      if (NON_JSON_API_RE.test(raw)) return false;
      if (raw.startsWith('/api/')) return true;
      var base = origin || (typeof window !== 'undefined' && window.location ? window.location.origin : 'http://127.0.0.1:3000');
      var parsed = new URL(raw, base === 'null' || base === 'file://' ? 'http://127.0.0.1:3000' : base);
      if (!parsed.pathname.startsWith('/api/')) return false;
      if (NON_JSON_API_RE.test(parsed.pathname)) return false;
      if (base && base !== 'null' && base !== 'file://') {
        return parsed.origin === base;
      }
      return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    } catch {
      return false;
    }
  }

  function isHtmlOrCookieCheckResponse(info) {
    var url = String((info && info.url) || '');
    var ct = String((info && info.contentType) || '').toLowerCase();
    var text = String((info && info.text) || '');
    var trimmed = text.trim();
    var looksCookieUrl = isCookieCheckUrl(url);
    var looksHtmlText = /^\s*</.test(trimmed) || /<html|<!doctype/i.test(trimmed.slice(0, 180));
    var looksCookieHtml = /Cookie check|AUTH_FLOW_TEST_COOKIE_NAME|__cookie_check|__SECURE-aistudio_auth_flow/i.test(text);
    var looksHtmlType = ct.includes('text/html') || ct.includes('application/xhtml');
    return {
      isCookieCheck: looksCookieUrl || looksCookieHtml,
      isHtml: looksCookieUrl || looksCookieHtml || looksHtmlType || looksHtmlText,
      url: url,
      contentType: ct,
    };
  }

  function parseJsonResponsePayload(info) {
    var status = Number((info && info.status) || 0);
    var ok = Boolean(info && info.ok);
    var text = String((info && info.text) || '');
    if (!text || !text.trim()) {
      if (!ok) {
        var emptyErr = new Error('HTTP ' + status + ' (empty server response)');
        emptyErr.status = status;
        throw emptyErr;
      }
      return {};
    }
    try {
      return JSON.parse(text);
    } catch {
      var check = isHtmlOrCookieCheckResponse(info);
      if (check.isCookieCheck) {
        var authErr = new Error(
          'Proxy session cookie expired or blocked by browser (HTTP ' + (status || 200) + '). Click "Unlock Proxy Session" or reload the preview.'
        );
        authErr.status = status;
        authErr.isCookieCheck = true;
        authErr.isHtml = true;
        throw authErr;
      }
      if (check.isHtml) {
        var htmlErr = new Error(
          'Server returned HTTP ' + (status || 'error') + ' (HTML page instead of JSON — request timed out or proxy blocked)'
        );
        htmlErr.status = status;
        htmlErr.isHtml = true;
        throw htmlErr;
      }
      var parseErr = new Error('Invalid JSON from server (HTTP ' + status + '): ' + text.slice(0, 80));
      parseErr.status = status;
      throw parseErr;
    }
  }

  var _rehydrateInFlight = null;

  function rehydrateProxySessionInIframe(nativeFetch, timeoutMs) {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return Promise.resolve(false);
    }
    if (window.location && window.location.protocol === 'file:') {
      return Promise.resolve(false);
    }
    if (_rehydrateInFlight) return _rehydrateInFlight;

    var limitMs = Number(timeoutMs || 3800);
    _rehydrateInFlight = new Promise(function (resolve) {
      var done = false;
      var iframe = null;
      var timer = null;

      function finish(ok) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (iframe && iframe.parentNode) {
          try { iframe.parentNode.removeChild(iframe); } catch {}
        }
        resolve(ok);
      }

      async function verifyHealthJson() {
        try {
          var r = await nativeFetch('/api/health?_reauth=' + Date.now(), {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          });
          var ct = String(r.headers.get('content-type') || '').toLowerCase();
          if (r.ok && !isCookieCheckUrl(r.url) && ct.includes('application/json')) {
            return true;
          }
        } catch {}
        return false;
      }

      try {
        iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        iframe.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;left:-9999px;top:-9999px;';
        var loadHits = 0;
        iframe.addEventListener('load', function () {
          loadHits++;
          verifyHealthJson().then(function (ok) {
            if (ok) {
              finish(true);
            } else if (loadHits >= 2) {
              finish(false);
            }
          });
        });
        iframe.addEventListener('error', function () { finish(false); });
        timer = setTimeout(function () {
          verifyHealthJson().then(finish);
        }, limitMs);
        iframe.src = '/api/health?_cookie_refresh=' + Date.now();
        (document.body || document.documentElement).appendChild(iframe);
      } catch {
        finish(false);
      }
    }).finally(function () {
      _rehydrateInFlight = null;
    });

    return _rehydrateInFlight;
  }

  var _defaultGuardedFetch = null;

  function createGuardedFetch(options) {
    var opts = options || {};
    var nativeFetch = opts.fetchFn || (typeof window !== 'undefined' && typeof window.fetch === 'function' ? window.fetch.bind(window) : null);
    if (!nativeFetch) return null;

    var rehydrateFn = opts.rehydrateFn || function () {
      return rehydrateProxySessionInIframe(nativeFetch, opts.timeoutMs || 3800);
    };

    function emitAuthRequired() {
      try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('cm-proxy-auth-required', {
            detail: {
              checkUrl: '/__cookie_check.html?return_url=' + encodeURIComponent(window.location.href),
            },
          }));
        }
      } catch {}
    }

    async function shouldRecoverResponse(res) {
      if (!res) return false;
      if (isCookieCheckUrl(res.url)) return true;
      var ct = String(res.headers && res.headers.get ? (res.headers.get('content-type') || '') : '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/xhtml')) {
        try {
          var sample = await res.clone().text();
          var check = isHtmlOrCookieCheckResponse({ url: res.url, contentType: ct, text: sample });
          return check.isHtml;
        } catch {
          return true;
        }
      }
      return false;
    }

    return async function guardedFetch(input, init) {
      var targetUrl = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      var origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
      if (!isSameOriginApiUrl(targetUrl, origin)) {
        return nativeFetch(input, init);
      }

      var mergedInit = Object.assign({}, init || {});
      if (!mergedInit.credentials) mergedInit.credentials = 'same-origin';
      if (!mergedInit.cache) mergedInit.cache = 'no-store';

      var res = await nativeFetch(input, mergedInit);
      if (await shouldRecoverResponse(res)) {
        var recovered = await rehydrateFn();
        if (recovered) {
          var retryRes = await nativeFetch(input, mergedInit);
          if (await shouldRecoverResponse(retryRes)) {
            emitAuthRequired();
          }
          return retryRes;
        }
        emitAuthRequired();
      }
      return res;
    };
  }

  function apiFetch(input, init) {
    if (!_defaultGuardedFetch) {
      _defaultGuardedFetch = createGuardedFetch();
    }
    if (_defaultGuardedFetch) return _defaultGuardedFetch(input, init);
    return window.fetch(input, init);
  }

  function installApiFetchInterceptor(options) {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return null;
    if (window.__cmProxyGuardInstalled && _defaultGuardedFetch) return _defaultGuardedFetch;

    var nativeFetch = window.__cmNativeFetch || window.fetch.bind(window);
    var guarded = createGuardedFetch(Object.assign({ fetchFn: nativeFetch }, options || {}));
    _defaultGuardedFetch = guarded;
    window.__cmNativeFetch = nativeFetch;
    window.cmFetch = guarded;
    window.__cmProxyGuardInstalled = true;

    try {
      var desc = Object.getOwnPropertyDescriptor(window, 'fetch') ||
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window) || {}, 'fetch');
      if (!desc || desc.writable === true || typeof desc.set === 'function') {
        window.fetch = guarded;
      } else if (desc.configurable) {
        Object.defineProperty(window, 'fetch', {
          value: guarded,
          configurable: true,
          writable: true,
        });
      }
    } catch {
      // Read-only getter window.fetch in sandboxed iframes — explicit apiFetch() still handles recovery safely.
    }

    return guarded;
  }

  return {
    isCookieCheckUrl: isCookieCheckUrl,
    isSameOriginApiUrl: isSameOriginApiUrl,
    isHtmlOrCookieCheckResponse: isHtmlOrCookieCheckResponse,
    parseJsonResponsePayload: parseJsonResponsePayload,
    rehydrateProxySessionInIframe: rehydrateProxySessionInIframe,
    createGuardedFetch: createGuardedFetch,
    apiFetch: apiFetch,
    installApiFetchInterceptor: installApiFetchInterceptor,
  };
}));
