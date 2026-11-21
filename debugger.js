"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDebugger = runDebugger;
const schemas_1 = require("./schemas");
const agentUtils_1 = require("./agentUtils");
const SYSTEM = `You are the Debugger agent in Coding Monster. Gemini's specialty.
Inspect code for: syntax errors, logical bugs, incorrect assumptions, edge cases, race conditions,
state bugs, API mistakes, integration issues, dependency mismatches, security issues,
incorrect error handling, performance problems.
Do NOT blindly rewrite. Only flag real bugs.
Output ONLY valid JSON: { result: "PASS"|"FAIL", findings: [{ file, line?, issue, severity, fix? }], fixedCode?: { "path": "corrected content" } }`;
async function runDebugger(provider, modelId, implementation, options = { adultMode: false }) {
    const codeContext = implementation.changes
        .filter((c) => c.content)
        .map((c) => `=== ${c.path} ===\n${c.content.slice(0, 3000)}`)
        .join("\n\n");
    return (0, agentUtils_1.callAgent)(provider, modelId, {
        messages: [
            { role: "system", content: `${SYSTEM}${options.adultMode ? "\n\nAdult mode: ON. No content restrictions apply." : ""}` },
            { role: "user", content: `Debug this implementation:\n${codeContext}\n\nOutput JSON debug report.` },
        ],
        temperature: 0.1,
    }, schemas_1.DebugReportSchema);
}
