"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRegistry = void 0;
const types_1 = require("./types");
class ProviderRegistry {
    providers = new Map();
    modelCache = new Map();
    health = new Map();
    /** Per-model health tracked across tasks (keyed "providerId:modelId") */
    modelHealth = new Map();
    /** Latest real quota headers from responses, keyed by providerId */
    latestQuota = new Map();
    register(provider) { this.providers.set(provider.id, provider); }
    unregister(id) {
        this.providers.delete(id);
        this.modelCache.delete(id);
        this.health.delete(id);
        // Clean model health entries for this provider
        for (const k of this.modelHealth.keys()) {
            if (k.startsWith(id + ":"))
                this.modelHealth.delete(k);
        }
    }
    list() { return [...this.providers.values()]; }
    get(id) { return this.providers.get(id); }
    async refreshAll() {
        const results = new Map();
        await Promise.all(this.list().map(async (p) => {
            try {
                const models = await p.listModels();
                this.modelCache.set(p.id, models);
                this.recordSuccess(p.id);
                results.set(p.id, models);
            }
            catch (err) {
                this.recordFailure(p.id, err);
                results.set(p.id, err instanceof types_1.ProviderError ? err : new types_1.ProviderError("unknown", String(err), p.id, true));
            }
        }));
        return results;
    }
    getCachedModels(providerId) {
        return this.modelCache.get(providerId) ?? [];
    }
    isHealthy(providerId) {
        const h = this.health.get(providerId);
        if (h?.cooldownUntil && h.cooldownUntil > Date.now())
            return false;
        return h?.reachable ?? true;
    }
    recordSuccess(providerId) {
        const now = Date.now();
        const previous = this.health.get(providerId);
        if (previous?.cooldownUntil && previous.cooldownUntil > now) {
            this.health.set(providerId, { ...previous, lastCheckedAt: now, reachable: false });
            return;
        }
        this.health.set(providerId, { lastCheckedAt: now, reachable: true, consecutiveFailures: 0, cooldownUntil: undefined });
    }
    recordFailure(providerId, err) {
        const prev = this.health.get(providerId);
        const pe = err instanceof types_1.ProviderError ? err : null;
        const isTransient = pe && (pe.kind === "rate_limited" || pe.kind === "quota_exceeded");
        const cooldownMs = pe?.kind === "rate_limited" ? 60_000 : pe?.kind === "quota_exceeded" ? 5 * 60_000 : 0;
        const next = {
            lastCheckedAt: Date.now(),
            reachable: !(pe && (pe.kind === "invalid_api_key" || pe.kind === "missing_api_key")),
            lastErrorKind: pe?.kind ?? "unknown",
            consecutiveFailures: (prev?.consecutiveFailures ?? 0) + 1,
            cooldownUntil: isTransient && cooldownMs > 0 ? Date.now() + cooldownMs : undefined,
        };
        this.health.set(providerId, next);
    }
    /** Record that a specific model call succeeded — improve health score */
    recordModelSuccess(providerId, modelId) {
        const key = `${providerId}:${modelId}`;
        const prev = this.modelHealth.get(key);
        const score = Math.min(100, (prev?.healthScore ?? 100) + 5);
        this.modelHealth.set(key, {
            failureCount: prev?.failureCount ?? 0,
            lastSuccessAt: Date.now(),
            lastErrorKind: prev?.lastErrorKind,
            healthScore: score,
            blacklisted: false,
            cooldownUntil: undefined,
        });
    }
    /** Permanently invalidate and blacklist an unavailable/retired/incompatible model */
    invalidateModel(providerId, modelId, reason) {
        const key = `${providerId}:${modelId}`;
        this.modelHealth.set(key, {
            failureCount: 99,
            lastFailedAt: Date.now(),
            lastErrorKind: reason,
            healthScore: 0,
            blacklisted: true,
        });
        const cached = this.modelCache.get(providerId);
        if (cached) {
            const model = cached.find((m) => m.modelId === modelId);
            if (model) {
                model.enabled = false;
                model.health = {
                    failureCount: 99,
                    lastFailedAt: Date.now(),
                    lastErrorKind: reason,
                    healthScore: 0,
                    blacklisted: true,
                };
            }
        }
    }
    /** Record that a specific model call failed — decrease health score and invalidate if unavailable */
    recordModelFailure(providerId, modelId, errorKind) {
        const key = `${providerId}:${modelId}`;
        const prev = this.modelHealth.get(key);
        const failures = (prev?.failureCount ?? 0) + 1;
        const score = Math.max(0, (prev?.healthScore ?? 100) - 20);
        const blacklisted = errorKind === "capability_mismatch" || errorKind === "model_unavailable" || failures >= 5;
        if (blacklisted) {
            this.invalidateModel(providerId, modelId, errorKind);
            return;
        }
        const cooldownMs = errorKind === "rate_limited" ? 60_000 : errorKind === "quota_exceeded" ? 5 * 60_000 : 0;
        this.modelHealth.set(key, {
            failureCount: failures,
            lastFailedAt: Date.now(),
            lastErrorKind: errorKind,
            lastSuccessAt: prev?.lastSuccessAt,
            healthScore: score,
            blacklisted: false,
            cooldownUntil: cooldownMs > 0 ? Date.now() + cooldownMs : undefined,
        });
    }
    isModelTemporarilyBlocked(providerId, modelId) {
        const h = this.modelHealth.get(`${providerId}:${modelId}`);
        return Boolean(h?.cooldownUntil && h.cooldownUntil > Date.now());
    }
    getModelHealth(providerId, modelId) {
        return this.modelHealth.get(`${providerId}:${modelId}`) ?? {
            failureCount: 0,
            healthScore: 100,
            blacklisted: false,
        };
    }
    isModelBlacklisted(providerId, modelId) {
        return this.modelHealth.get(`${providerId}:${modelId}`)?.blacklisted ?? false;
    }
    /** Store latest quota headers for a provider (captured from response) */
    setQuotaHeaders(providerId, headers) {
        this.latestQuota.set(providerId, headers);
    }
    getQuotaHeaders(providerId) {
        return this.latestQuota.get(providerId);
    }
    allCachedModels() {
        return this.list().flatMap((p) => this.getCachedModels(p.id).map((m) => ({
            ...m,
            health: this.getModelHealth(p.id, m.modelId),
        })));
    }
    getHealthSummary() {
        return this.list().map((p) => {
            const h = this.health.get(p.id);
            return {
                providerId: p.id,
                healthy: h?.reachable ?? true,
                consecutiveFailures: h?.consecutiveFailures ?? 0,
                lastErrorKind: h?.lastErrorKind,
            };
        });
    }
}
exports.ProviderRegistry = ProviderRegistry;
