"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelEligibilityService = void 0;
class ModelEligibilityService {
    /**
     * Default capability requirements for roles in Coding Monster.
     */
    static getRoleRequirements(role) {
        const r = role.toLowerCase();
        // Coding roles
        if (r.includes("coder") || r.includes("implementer") || r.includes("refactorer") || r.includes("fixer")) {
            return {
                required: ["chat", "textGeneration"],
                preferred: ["coding", "reasoning", "toolUse", "structuredOutput"],
            };
        }
        // Architect / Planner / Reviewer
        if (r.includes("architect") || r.includes("planner") || r.includes("reviewer") || r.includes("judge")) {
            return {
                required: ["chat", "textGeneration"],
                preferred: ["reasoning", "coding", "structuredOutput"],
            };
        }
        // Debugger / Tester
        if (r.includes("debugger") || r.includes("tester")) {
            return {
                required: ["chat", "textGeneration"],
                preferred: ["reasoning", "coding", "toolUse", "structuredOutput"],
            };
        }
        // Vision / Designer
        if (r.includes("designer") || r.includes("ui")) {
            return {
                required: ["chat", "textGeneration"],
                preferred: ["vision", "coding", "structuredOutput"],
            };
        }
        // Default conversational agent requirement
        return {
            required: ["chat", "textGeneration"],
            preferred: ["coding", "reasoning"],
        };
    }
    /**
     * Evaluates if a model satisfies required capabilities.
     */
    static checkEligibility(model, required) {
        const missing = [];
        const caps = model.capabilities;
        for (const cap of required) {
            if (!caps || !caps[cap]) {
                missing.push(cap);
            }
        }
        return {
            eligible: missing.length === 0,
            missing,
        };
    }
    /**
     * Filters a list of models, keeping only those that meet the role's required capabilities.
     */
    static filterEligible(models, role) {
        const reqs = this.getRoleRequirements(role);
        return models.filter((m) => {
            if (!m.enabled)
                return false;
            const { eligible } = this.checkEligibility(m, reqs.required);
            return eligible;
        });
    }
}
exports.ModelEligibilityService = ModelEligibilityService;
