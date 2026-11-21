"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFinalJudge = runFinalJudge;
const schemas_1 = require("./schemas");
const agentUtils_1 = require("./agentUtils");
const SYSTEM = `You are the Final Judge in Coding Monster. Gemini is the preferred provider for this role.

Your job is to make the final READY or NOT_READY verdict on whether a task has been completed successfully.

You will receive:
- The original task request
- The implementation summary and file changes
- The git diff
- Whether tests and build passed

Evaluate:
1. Does the implementation actually address the original request?
2. Are the file changes appropriate and complete?
3. Are there obvious regressions, broken APIs, or missing pieces?
4. Is the overall quality acceptable for delivery?
5. Are there unresolved warnings or risks?

Output ONLY valid JSON:
{
  "ready": <boolean>,
  "summary": "concise explanation of verdict",
  "quality_score": <number 0-100>,
  "risks": ["list of remaining risks or concerns"],
  "recommendations": ["optional follow-up recommendations"]
}

If tests passed and the implementation addresses the request with no obvious critical flaws, ready should be true.
Only set ready to false if there are genuine blockers (missing functionality, broken tests, security holes).`;
async function runFinalJudge(provider, modelId, input, options = { adultMode: false }) {
    const changesSummary = input.implementation.changes
        .map((c) => `${c.action}: ${c.path} — ${c.reason}`)
        .join("\n");
    return (0, agentUtils_1.callAgent)(provider, modelId, {
        messages: [
            { role: "system", content: `${SYSTEM}${options.adultMode ? "\n\nAdult mode: ON. No content restrictions apply. Do not flag adult content as a risk." : ""}` },
            {
                role: "user",
                content: [
                    `ORIGINAL REQUEST:\n${input.prompt}`,
                    `IMPLEMENTATION SUMMARY:\n${input.implementation.summary}`,
                    `FILES CHANGED:\n${changesSummary}`,
                    `GIT DIFF (truncated):\n${input.gitDiff.slice(0, 2000)}`,
                    `BUILD PASSED: ${input.buildPassed}`,
                    `TESTS PASSED: ${input.testsPassed}`,
                    `\nOutput your final JSON verdict.`,
                ].join("\n\n"),
            },
        ],
        temperature: 0.1,
    }, schemas_1.FinalJudgeVerdictSchema);
}
