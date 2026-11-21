"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleScoringEngine = void 0;
const types_1 = require("../providers/types");
class RoleScoringEngine {
    /**
     * Computes weighting profile for an agent role.
     */
    static getRoleWeights(role) {
        const base = {
            coding: 3,
            reasoning: 1,
            toolUse: 1,
            structuredOutput: 1,
            vision: 0,
            context: 0.5,
            reliability: 2,
            userScore: 2,
            latencyPenalty: 0.5,
        };
        if (role === "architect" ||
            role === "systemArchitect" ||
            role === "planner" ||
            role === "engineeringReviewer" ||
            role === "codeReviewer" ||
            role === "finalJudge") {
            return { ...base, reasoning: 4, coding: 2 };
        }
        if (role === "designer" || role === "uiDesigner") {
            return { ...base, reasoning: 2, coding: 2, vision: 3 };
        }
        if (role === "debugger") {
            return { ...base, reasoning: 3, toolUse: 2, structuredOutput: 2 };
        }
        if (role === "refactorer" || role === "altCoder") {
            return { ...base, latencyPenalty: 1 };
        }
        if (role === "securityEngineer" || role === "securityReviewer") {
            return { ...base, reasoning: 3, coding: 2 };
        }
        if (role === "licenseReviewer") {
            return { ...base, reasoning: 4, coding: 1 };
        }
        if (role === "algorithmEngineer") {
            return { ...base, reasoning: 4, coding: 3 };
        }
        if (role === "performanceEngineer") {
            return { ...base, reasoning: 2, coding: 3 };
        }
        if (role === "assetEngineer" || role === "audioEngineer") {
            return { ...base, vision: 3, reasoning: 2, coding: 1 };
        }
        if (role === "animationEngineer") {
            return { ...base, vision: 3, reasoning: 2 };
        }
        if (role === "unityCoder" || role === "unrealCoder" || role === "gameplayCoder") {
            return { ...base, coding: 4, reasoning: 2 };
        }
        if (role === "uiEngineer") {
            return { ...base, coding: 3, vision: 2 };
        }
        if (role === "gameDesigner") {
            return { ...base, reasoning: 3, vision: 2, coding: 1 };
        }
        return base;
    }
    /**
     * Evaluates if a model satisfies the required capabilities for a role.
     */
    static satisfiesRequirements(model, role) {
        const required = types_1.ROLE_REQUIRED_CAPS[role] ?? ["chat", "textGeneration"];
        const caps = model.capabilities;
        if (!caps)
            return false;
        for (const cap of required) {
            if (!caps[cap])
                return false;
        }
        return true;
    }
    /**
     * Calculates numerical score for a model for a specific role.
     */
    static scoreModel(model, role) {
        const w = this.getRoleWeights(role);
        const caps = model.capabilities;
        let score = 0;
        if (caps?.coding)
            score += w.coding;
        if (caps?.reasoning)
            score += w.reasoning;
        if (caps?.toolUse)
            score += w.toolUse;
        if (caps?.structuredOutput)
            score += w.structuredOutput;
        if (caps?.vision)
            score += w.vision;
        const healthScore = model.health?.healthScore ?? 100;
        score += (healthScore / 100) * w.reliability;
        if (model.contextLength) {
            score += Math.min(model.contextLength / 50_000, 3) * w.context;
        }
        score += (model.reliability ?? 1) * w.reliability;
        score += (model.userScore ?? 0) * w.userScore;
        if (model.avgLatencyMs) {
            score -= (model.avgLatencyMs / 1000) * w.latencyPenalty;
        }
        return score;
    }
    /**
     * Ranks all eligible models for a role, filtered by capability gate and health.
     */
    static rankModels(role, models) {
        return models
            .filter((m) => m.enabled)
            .filter((m) => !m.health?.blacklisted)
            .filter((m) => this.satisfiesRequirements(m, role))
            .map((m) => ({
            model: m,
            score: this.scoreModel(m, role),
        }))
            .sort((a, b) => b.score - a.score);
    }
}
exports.RoleScoringEngine = RoleScoringEngine;
