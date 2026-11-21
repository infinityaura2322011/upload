"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ROUTING = exports.SAFETY_FILTERED_PROVIDERS = void 0;
exports.isQwenModel = isQwenModel;
exports.satisfiesRequirements = satisfiesRequirements;
exports.rankModelsForRole = rankModelsForRole;
exports.resolveCandidate = resolveCandidate;
/**
 * Providers known to have hard safety filters that refuse adult/uncensored content.
 * When adultMode=true these are excluded from ALL roles automatically.
 */
exports.SAFETY_FILTERED_PROVIDERS = new Set(["gemini", "google"]);
/** Model ID patterns that identify Qwen models (uncensored, preferred planner). */
const QWEN_PATTERNS = [/qwen/i, /qwq/i];
function isQwenModel(modelId) {
    return QWEN_PATTERNS.some((p) => p.test(modelId));
}
exports.DEFAULT_ROUTING = {
    planner: [],
    designer: [],
    uiDesigner: [],
    systemArchitect: [],
    architect: [],
    frontendCoder: [],
    backendCoder: [],
    altCoder: [],
    dbEngineer: [],
    algorithmEngineer: [],
    securityEngineer: [],
    engineeringReviewer: [],
    codeReviewer: [],
    refactorer: [],
    debugger: [],
    tester: [],
    performanceEngineer: [],
    docEngineer: [],
    finalJudge: [],
    releaseEngineer: [],
    assetEngineer: [],
    unityCoder: [],
    unrealCoder: [],
    gameplayCoder: [],
    uiEngineer: [],
    animationEngineer: [],
    audioEngineer: [],
    securityReviewer: [],
    licenseReviewer: [],
    gameDesigner: [],
};
const scoringEngine_1 = require("../models/scoringEngine");
function satisfiesRequirements(model, role) {
    return scoringEngine_1.RoleScoringEngine.satisfiesRequirements(model, role);
}
function rankModelsForRole(role, models) {
    return scoringEngine_1.RoleScoringEngine.rankModels(role, models);
}
/**
 * Resolves a role to the best available model.
 * When adultMode=true, SAFETY_FILTERED_PROVIDERS are excluded from all roles.
 * For the planner role, Qwen models are tried first across all providers.
 */
function resolveCandidate(role, routing, registry, autoMode, excludedProviders = new Set(), excludedModels = new Set(), adultMode = false) {
    // Build effective excluded set — add safety-filtered providers when adult mode is on
    const effectiveExcluded = new Set(excludedProviders);
    if (adultMode) {
        for (const p of exports.SAFETY_FILTERED_PROVIDERS)
            effectiveExcluded.add(p);
    }
    const candidates = routing[role] ?? [];
    for (const candidate of candidates) {
        if (effectiveExcluded.has(candidate.providerId))
            continue;
        const modelKey = `${candidate.providerId}:${candidate.modelId}`;
        if (candidate.modelId !== "auto" && (excludedModels.has(modelKey) || registry.isModelTemporarilyBlocked(candidate.providerId, candidate.modelId)))
            continue;
        if (!registry.isHealthy(candidate.providerId))
            continue;
        if (candidate.modelId === "auto") {
            const models = registry.getCachedModels(candidate.providerId)
                .filter((m) => !excludedModels.has(`${m.providerId}:${m.modelId}`))
                .filter((m) => !registry.isModelTemporarilyBlocked(m.providerId, m.modelId))
                .filter((m) => !registry.isModelBlacklisted(m.providerId, m.modelId));
            const ranked = rankModelsForRole(role, models);
            if (ranked[0])
                return { providerId: candidate.providerId, modelId: ranked[0].model.modelId };
            continue;
        }
        if (registry.isModelBlacklisted(candidate.providerId, candidate.modelId))
            continue;
        if (registry.isModelTemporarilyBlocked(candidate.providerId, candidate.modelId))
            continue;
        const modelInfo = registry.getCachedModels(candidate.providerId)
            .find((m) => m.modelId === candidate.modelId);
        if (modelInfo && !satisfiesRequirements(modelInfo, role))
            continue;
        return candidate;
    }
    if (!autoMode)
        return null;
    // AUTO across all healthy, non-excluded providers
    const allModels = registry.list()
        .filter((p) => registry.isHealthy(p.id) && !effectiveExcluded.has(p.id))
        .flatMap((p) => registry.getCachedModels(p.id))
        .filter((m) => !excludedModels.has(`${m.providerId}:${m.modelId}`))
        .filter((m) => !registry.isModelTemporarilyBlocked(m.providerId, m.modelId))
        .filter((m) => !registry.isModelBlacklisted(m.providerId, m.modelId));
    // For planner role: prefer Qwen models first (uncensored, strong reasoning)
    if (role === "planner") {
        const qwenModels = allModels.filter((m) => isQwenModel(m.modelId));
        if (qwenModels.length > 0) {
            const ranked = rankModelsForRole(role, qwenModels);
            if (ranked[0])
                return { providerId: ranked[0].model.providerId, modelId: ranked[0].model.modelId };
        }
    }
    const ranked = rankModelsForRole(role, allModels);
    return ranked[0] ? { providerId: ranked[0].model.providerId, modelId: ranked[0].model.modelId } : null;
}
