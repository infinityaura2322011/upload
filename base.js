"use strict";
// Shared utilities: retry, timeout, HTTP error classification.
// Every provider adapter imports from here — no duplication.
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyHttpError = classifyHttpError;
exports.parseRateLimitHeaders = parseRateLimitHeaders;
exports.withTimeout = withTimeout;
exports.withRetry = withRetry;
const types_1 = require("./types");
function classifyHttpError(status, body, providerId, modelId) {
    const msg = body.slice(0, 400);
    // Detect capability mismatch (Groq / other OpenAI-compatible APIs)
    const isCap = status === 400 &&
        (/does not support chat/i.test(body) ||
            /capability/i.test(body) ||
            /unsupported.*model/i.test(body) ||
            /not supported.*operation/i.test(body));
    const isModelUnavailable = status === 400 &&
        (/non[- ]serverless/i.test(body) ||
            /model.*not available/i.test(body) ||
            /model.*access/i.test(body));
    const isQuotaExhausted = status === 429 && /quota|exceeded|billing/i.test(body);
    const isModelMissing = status === 404;
    const table = {
        400: isCap ? ["capability_mismatch", false] : isModelUnavailable ? ["model_unavailable", false] : ["invalid_response", false],
        401: ["invalid_api_key", false],
        402: ["quota_exceeded", false],
        403: ["invalid_api_key", false],
        404: ["model_unavailable", false],
        429: isQuotaExhausted ? ["quota_exceeded", false] : ["rate_limited", true],
    };
    const [kind, retryable] = table[status] ?? ["unknown", status >= 500];
    return new types_1.ProviderError(kind, `HTTP ${status}: ${msg}`, providerId, retryable, modelId);
}
/**
 * Parse Groq (and compatible) rate-limit response headers into structured quota info.
 */
function parseRateLimitHeaders(headers) {
    const h = (name) => headers.get(name) ?? "";
    const n = (s) => {
        const v = parseFloat(s);
        return isNaN(v) ? undefined : v;
    };
    // Parse reset values — may be seconds remaining (e.g. "2m59s", "179s") or ISO timestamps
    const parseReset = (raw) => {
        if (!raw)
            return undefined;
        // Try as ISO 8601
        const ts = Date.parse(raw);
        if (!isNaN(ts))
            return ts;
        // Try as duration string: "2m59s", "179.4s", "120s" etc.
        const sMatch = raw.match(/^(\d+(?:\.\d+)?)s$/);
        if (sMatch)
            return Date.now() + Math.ceil(parseFloat(sMatch[1])) * 1000;
        const mMatch = raw.match(/^(\d+)m(\d+(?:\.\d+)?)s$/);
        if (mMatch)
            return Date.now() + (parseInt(mMatch[1]) * 60 + parseFloat(mMatch[2])) * 1000;
        // Try plain number (seconds)
        const plain = parseFloat(raw);
        if (!isNaN(plain))
            return Date.now() + Math.ceil(plain) * 1000;
        return undefined;
    };
    return {
        limitRequests: n(h("x-ratelimit-limit-requests")),
        remainingRequests: n(h("x-ratelimit-remaining-requests")),
        resetRequestsAt: parseReset(h("x-ratelimit-reset-requests")),
        limitTokens: n(h("x-ratelimit-limit-tokens")),
        remainingTokens: n(h("x-ratelimit-remaining-tokens")),
        resetTokensAt: parseReset(h("x-ratelimit-reset-tokens")),
        retryAfterMs: n(h("retry-after")) != null ? n(h("retry-after")) * 1000 : undefined,
    };
}
async function withTimeout(promise, ms, providerId) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new types_1.ProviderError("timeout", `Request timed out after ${ms}ms`, providerId, true)), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    }
    finally {
        clearTimeout(timer);
    }
}
async function withRetry(fn, maxAttempts = 2) {
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            if (err instanceof types_1.ProviderError && !err.retryable)
                throw err;
            if (attempt < maxAttempts - 1)
                await sleep(500 * (attempt + 1));
        }
    }
    throw lastErr;
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
