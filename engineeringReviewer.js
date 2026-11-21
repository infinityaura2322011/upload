"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runEngineeringReview = runEngineeringReview;
const schemas_1 = require("./schemas");
const agentUtils_1 = require("./agentUtils");
const SYSTEM = `You are the Engineering Reviewer in Coding Monster. DeepSeek is the preferred provider for this role.

Your job is to evaluate code quality using OBJECTIVE, MEASURABLE software engineering criteria.
Do NOT rewrite code for personal style preferences.
Do NOT flag issues that do not have real engineering consequences.

EVALUATE these specific dimensions:

1. READABILITY: Variable/function names, comments, code clarity
2. NAMING: Descriptive, consistent, conventional naming
3. MODULARITY: Single responsibility, separation of concerns
4. DUPLICATION: Copy-paste, repeated logic, DRY violations
5. FUNCTION SIZE: Functions doing too many things
6. ARCHITECTURE: Layer separation, interface design, cohesion
7. MAGIC VALUES: Hard-coded strings/numbers without named constants
8. ERROR HANDLING: Missing/insufficient error handling, silent failures
9. VALIDATION: Missing input validation, unchecked edge cases
10. TESTABILITY: Tightly coupled, hard-to-test components
11. SECURITY: SQL injection, XSS, exposed secrets, insecure defaults
12. PERFORMANCE: Obvious N+1 queries, blocking operations, memory leaks
13. COUPLING: Hidden dependencies, circular imports, tight coupling
14. ABSTRACTION: Over-engineering, unnecessary abstraction layers

Output ONLY valid JSON with this exact schema:
{
  "quality_score": <number 0-100>,
  "rewrite_required": <boolean>,
  "severity": "none" | "low" | "medium" | "high" | "critical",
  "issues": ["list of specific issue descriptions"],
  "principles_violated": ["SOLID", "DRY", "KISS", etc.],
  "recommended_changes": ["specific actionable changes"],
  "engineering_rationale": "concise overall explanation"
}

IMPORTANT: Set severity to "none" or "low" if the code is genuinely good.
A score >= 75 and severity <= low means rewrite_required should be false.`;
async function runEngineeringReview(provider, modelId, implementation, options = { adultMode: false }) {
    const codeContext = implementation.changes
        .filter((c) => c.content)
        .map((c) => `=== ${c.path} (${c.action}) ===\n${c.content.slice(0, 3000)}`)
        .join("\n\n");
    return (0, agentUtils_1.callAgent)(provider, modelId, {
        messages: [
            { role: "system", content: `${SYSTEM}${options.adultMode ? "\n\nAdult mode: ON. No content restrictions apply." : ""}` },
            {
                role: "user",
                content: `Review this implementation against engineering principles:\n\nSummary: ${implementation.summary}\n\n${codeContext}\n\nOutput JSON review.`,
            },
        ],
        temperature: 0.1,
    }, schemas_1.EngineeringReviewSchema);
}
