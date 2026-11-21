"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quotaEngine = exports.QuotaEngine = void 0;
const types_1 = require("./types");
/**
 * QuotaEngine — central in-memory store for provider quota data.
 * Data comes from:
 *  - Groq: real HTTP response headers (exact)
 *  - Gemini: documented limits (estimated, no real-time from API)
 *  - Others: unavailable until provider exposes data
 */
class QuotaEngine {
    store = new Map();
    /** Update quotas for a provider from captured Groq-style response headers */
    updateFromHeaders(providerId, modelId, headers) {
        const quotas = (0, types_1.quotaFromGroqHeaders)(providerId, modelId, headers);
        if (quotas.length === 0)
            return;
        const existing = this.store.get(providerId);
        const merged = existing ? this.mergeQuotas(existing.quotas, quotas) : quotas;
        this.store.set(providerId, {
            providerId,
            quotas: merged,
            lastUpdatedAt: Date.now(),
            providerOnline: true,
        });
    }
    /** Merge new quota entries over existing ones by metric key */
    mergeQuotas(existing, incoming) {
        const map = new Map();
        for (const q of existing)
            map.set(`${q.metric}:${q.modelId ?? ""}`, q);
        for (const q of incoming)
            map.set(`${q.metric}:${q.modelId ?? ""}`, q);
        return [...map.values()];
    }
    /** Mark a provider as online */
    markOnline(providerId) {
        const entry = this.store.get(providerId);
        if (entry) {
            entry.providerOnline = true;
        }
        else {
            this.store.set(providerId, {
                providerId,
                quotas: [],
                lastUpdatedAt: Date.now(),
                providerOnline: true,
            });
        }
    }
    /** Mark a provider as offline */
    markOffline(providerId) {
        const entry = this.store.get(providerId);
        if (entry)
            entry.providerOnline = false;
    }
    getProviderQuotaSet(providerId) {
        return this.store.get(providerId);
    }
    getAllProviderSets() {
        return [...this.store.values()];
    }
    /** Serialize all quota data for API response */
    toApiResponse() {
        return [...this.store.values()].map((set) => ({
            providerId: set.providerId,
            providerOnline: set.providerOnline,
            lastUpdatedAt: set.lastUpdatedAt,
            quotas: set.quotas.map((q) => ({
                metric: q.metric,
                unit: q.unit,
                period: q.period,
                limit: q.limit,
                used: q.used,
                remaining: q.remaining,
                resetAt: q.resetAt,
                source: q.source,
                confidence: q.confidence,
                fetchedAt: q.fetchedAt,
                modelId: q.modelId,
            })),
        }));
    }
}
exports.QuotaEngine = QuotaEngine;
// Singleton
exports.quotaEngine = new QuotaEngine();
