"use strict";
/**
 * TelemetryService — single pipeline for all provider telemetry.
 *
 * Flow:
 *   Provider adapter → TelemetryService.record() → DB + in-memory cache + SSE broadcast
 *
 * Rules:
 *   - null means "unavailable", never coerce to 0
 *   - EXACT = from provider response/header
 *   - ESTIMATED = derived from documented limits + observed usage
 *   - N/A = provider does not expose this
 *   - LOCAL = Ollama / local provider, no cloud quota
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelemetryService = exports.PROVIDER_TELEMETRY_CAPS = void 0;
exports.getTelemetryService = getTelemetryService;
exports.initTelemetryService = initTelemetryService;
/** Per-provider metadata about what data is actually available */
exports.PROVIDER_TELEMETRY_CAPS = {
    groq: {
        hasExactQuota: true,
        hasResetTime: true,
        hasTokenUsage: true,
        isLocal: false,
        quotaSource: "provider_header",
        quotaNote: "Exact quota from x-ratelimit-* response headers",
    },
    gemini: {
        hasExactQuota: false,
        hasResetTime: false,
        hasTokenUsage: true,
        isLocal: false,
        quotaSource: "provider_endpoint",
        quotaNote: "Exact remaining quota unavailable from Gemini API. Token usage available per response.",
    },
    mistral: {
        hasExactQuota: false,
        hasResetTime: false,
        hasTokenUsage: true,
        isLocal: false,
        quotaSource: "unknown",
        quotaNote: "Mistral does not expose rate-limit headers. Token usage available per response.",
    },
    deepseek: {
        hasExactQuota: false,
        hasResetTime: false,
        hasTokenUsage: true,
        isLocal: false,
        quotaSource: "unknown",
        quotaNote: "DeepSeek does not expose rate-limit headers. Token usage available per response.",
    },
    ollama: {
        hasExactQuota: false,
        hasResetTime: false,
        hasTokenUsage: true,
        isLocal: true,
        quotaSource: "local_provider",
        quotaNote: "Local provider — no cloud quota or provider reset.",
    },
};
class TelemetryService {
    listeners = new Set();
    telemetryRepo;
    quotaRepo;
    constructor(telemetryRepo, quotaRepo) {
        this.telemetryRepo = telemetryRepo;
        this.quotaRepo = quotaRepo;
    }
    subscribe(fn) { this.listeners.add(fn); }
    unsubscribe(fn) { this.listeners.delete(fn); }
    broadcast(event) {
        for (const fn of this.listeners) {
            try {
                fn(event);
            }
            catch { /* non-fatal */ }
        }
    }
    /** Record a completed provider API call */
    recordUsage(event) {
        this.telemetryRepo.record(event);
        this.broadcast({
            type: "usage",
            provider: event.provider,
            model: event.model,
            data: {
                inputTokens: event.inputTokens ?? null,
                outputTokens: event.outputTokens ?? null,
                totalTokens: event.totalTokens ?? null,
                latencyMs: event.latencyMs ?? null,
                success: event.success,
                errorCode: event.errorCode ?? null,
            },
            at: Date.now(),
        });
    }
    /** Record Groq-style rate-limit headers (EXACT data) */
    recordGroqHeaders(provider, model, headers) {
        const now = Date.now();
        if (headers.limitRequests !== undefined || headers.remainingRequests !== undefined) {
            const snap = {
                provider, model,
                metric: "requests_per_minute",
                scope: "provider",
                limitVal: headers.limitRequests ?? null,
                remaining: headers.remainingRequests ?? null,
                resetAt: headers.resetRequestsAt ?? null,
                source: "provider_header",
                confidence: "exact",
            };
            this.quotaRepo.upsert(snap);
            this.broadcast({ type: "quota", provider, model, data: { ...snap, fetchedAt: now }, at: now });
        }
        if (headers.limitTokens !== undefined || headers.remainingTokens !== undefined) {
            const snap = {
                provider, model,
                metric: "tokens_per_minute",
                scope: "provider",
                limitVal: headers.limitTokens ?? null,
                remaining: headers.remainingTokens ?? null,
                resetAt: headers.resetTokensAt ?? null,
                source: "provider_header",
                confidence: "exact",
            };
            this.quotaRepo.upsert(snap);
            this.broadcast({ type: "quota", provider, model, data: { ...snap, fetchedAt: now }, at: now });
        }
    }
    /** Record a 429 rate-limit event */
    recordRateLimit(provider, model, retryAfterMs) {
        const snap = {
            provider, model,
            metric: "rate_limited",
            scope: "provider",
            limitVal: null,
            remaining: 0,
            resetAt: retryAfterMs != null ? Date.now() + retryAfterMs : null,
            source: "provider_header",
            confidence: retryAfterMs != null ? "exact" : "unavailable",
        };
        this.quotaRepo.upsert(snap);
        this.broadcast({ type: "quota", provider, model, data: { ...snap, fetchedAt: Date.now() }, at: Date.now() });
    }
    getCapabilities(providerId) {
        return exports.PROVIDER_TELEMETRY_CAPS[providerId] ?? {
            hasExactQuota: false, hasResetTime: false, hasTokenUsage: false,
            isLocal: false, quotaSource: "unknown", quotaNote: "No telemetry capability information available.",
        };
    }
}
exports.TelemetryService = TelemetryService;
// Singleton — initialised in server.ts after DB is ready
let _instance = null;
function getTelemetryService() {
    if (!_instance)
        throw new Error("TelemetryService not initialised");
    return _instance;
}
function initTelemetryService(t, q) {
    _instance = new TelemetryService(t, q);
    return _instance;
}
