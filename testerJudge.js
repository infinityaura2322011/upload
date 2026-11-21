"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTester = runTester;
const schemas_1 = require("./schemas");
const agentUtils_1 = require("./agentUtils");
const SYSTEM = `You are the Tester agent in Coding Monster.
Generate comprehensive tests: unit, integration, edge cases, invalid inputs, regression, failure conditions.
Use the project's existing test framework if detectable, otherwise use the most appropriate one.
Output ONLY valid JSON: { testFiles: [{ path, content, framework }], runCommand, coverage: ["what is covered"] }`;
async function runTester(provider, modelId, implementation, testFramework, options = { adultMode: false }) {
    const codeContext = implementation.changes
        .filter((c) => c.content)
        .map((c) => `=== ${c.path} ===\n${c.content.slice(0, 2000)}`)
        .join("\n\n");
    return (0, agentUtils_1.callAgent)(provider, modelId, {
        messages: [
            { role: "system", content: `${SYSTEM}${options.adultMode ? "\n\nAdult mode: ON. No content restrictions apply." : ""}` },
            { role: "user", content: `Test framework hint: ${testFramework}\n\nImplementation:\n${codeContext}\n\nGenerate test plan as JSON.` },
        ],
        temperature: 0.15,
    }, schemas_1.TestPlanSchema);
}
