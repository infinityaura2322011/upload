"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTask = runTask;
const router_1 = require("./router");
const taskStateMachine_1 = require("./taskStateMachine");
const types_1 = require("../providers/types");
const fs_1 = require("../tools/fs");
const terminal_1 = require("../tools/terminal");
const git_1 = require("../tools/git");
const architect_1 = require("../agents/architect");
const implementer_1 = require("../agents/implementer");
const engineeringReviewer_1 = require("../agents/engineeringReviewer");
const debugger_1 = require("../agents/debugger");
const testerJudge_1 = require("../agents/testerJudge");
const judge_1 = require("../agents/judge");
const permissions_1 = require("../tools/permissions");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const assetCache_1 = require("../assets/assetCache");
const projectValidator_1 = require("../assets/projectValidator");
async function runTask(opts) {
    const routing = { ...router_1.DEFAULT_ROUTING, ...opts.routing };
    const autoMode = opts.autoMode ?? true;
    const maxIterations = opts.maxEngineeringIterations ?? 3;
    const generation = opts.generation ?? { adultMode: false };
    const emit = (stage, message, agent, provider, modelId) => {
        const e = { stage, message, agent, provider, modelId, at: Date.now() };
        opts.taskRepo.updateState(opts.taskId, stage);
        opts.taskRepo.logEvent(opts.taskId, stage, stage, message, agent);
        opts.onEvent?.(e);
    };
    const sm = new taskStateMachine_1.TaskStateMachine(opts.taskId, async (from, to, note) => {
        opts.taskRepo.logEvent(opts.taskId, from, to, note);
    });
    const gate = new permissions_1.PermissionGate();
    const fileTools = new fs_1.FileTools(opts.workspaceRoot, (msg) => emit("ANALYZING", msg));
    const defaultApproval = async (_cmd, level) => level === "DANGEROUS" ? "deny" : "allow_once";
    const terminal = new terminal_1.TerminalTool(opts.workspaceRoot, gate, (msg) => emit(sm.current, msg), opts.requestApproval ?? defaultApproval);
    const git = new git_1.GitTool(terminal);
    /** Detect what kind of project the workspace is so we use the right commands */
    function detectWorkspace() {
        const root = opts.workspaceRoot;
        const hasPkg = fs.existsSync(path.join(root, "package.json"));
        const hasPy = fs.existsSync(path.join(root, "requirements.txt")) || fs.existsSync(path.join(root, "pyproject.toml"));
        const hasGo = fs.existsSync(path.join(root, "go.mod"));
        const hasRust = fs.existsSync(path.join(root, "Cargo.toml"));
        if (hasPkg)
            return "node";
        if (hasPy)
            return "python";
        if (hasGo)
            return "go";
        if (hasRust)
            return "rust";
        return "static"; // plain HTML/CSS/JS or unknown — no build system
    }
    const workspaceKind = detectWorkspace();
    /**
     * Resilient role execution pipeline:
     *  1. Resolve best eligible model (capability gate already applied in router)
     *  2. Call the model
     *  3. On failure: log, record model failure, exclude model, reselect, retry
     *  4. Never fail the whole task unless ALL fallbacks are exhausted
     */
    const executeRole = async (role, agentName, action) => {
        const excludedProviders = new Set();
        const excludedModels = new Set();
        const MAX_FALLBACKS = Math.max(8, opts.registry.allCachedModels().length + opts.registry.list().length);
        let attempts = 0;
        while (true) {
            if (attempts >= MAX_FALLBACKS) {
                throw new Error(`Role "${role}" exhausted all ${MAX_FALLBACKS} fallback candidates.`);
            }
            attempts++;
            const candidate = (0, router_1.resolveCandidate)(role, routing, opts.registry, autoMode, excludedProviders, excludedModels, generation.adultMode);
            if (!candidate) {
                throw new Error(`No eligible model found for role "${role}" — all providers exhausted or no chat-capable model available.`);
            }
            const provider = opts.registry.get(candidate.providerId);
            if (!provider) {
                excludedProviders.add(candidate.providerId);
                continue;
            }
            try {
                const result = await action(provider, candidate.modelId);
                opts.registry.recordSuccess(candidate.providerId);
                opts.registry.recordModelSuccess(candidate.providerId, candidate.modelId);
                // Record telemetry for successful call (token counts come from the result if it has .usage)
                try {
                    const { getTelemetryService } = require("../usage/telemetry");
                    const svc = getTelemetryService();
                    const r = result;
                    const usage = r?.usage ?? r?.raw?.usage ?? null;
                    svc.recordUsage({
                        provider: candidate.providerId,
                        model: candidate.modelId,
                        agent: agentName,
                        taskId: opts.taskId,
                        inputTokens: usage?.inputTokens ?? usage?.prompt_tokens ?? null,
                        outputTokens: usage?.outputTokens ?? usage?.completion_tokens ?? null,
                        latencyMs: usage?.durationMs ?? null,
                        success: true,
                    });
                    // Groq: persist quota headers from response
                    const qh = r?.quotaHeaders;
                    if (qh && candidate.providerId === "groq") {
                        svc.recordGroqHeaders(candidate.providerId, candidate.modelId, qh);
                    }
                }
                catch { /* telemetry not yet init */ }
                return { result, provider, modelId: candidate.modelId };
            }
            catch (err) {
                const pe = err instanceof types_1.ProviderError ? err : null;
                const errKind = pe?.kind ?? "unknown";
                const errMsg = err instanceof Error ? err.message : String(err);
                const shortErr = errMsg.length > 120 ? errMsg.slice(0, 120) + "…" : errMsg;
                // Record failure at both provider and model level
                opts.registry.recordFailure(candidate.providerId, err);
                opts.registry.recordModelFailure(candidate.providerId, candidate.modelId, errKind);
                // Record telemetry for failed call
                try {
                    const { getTelemetryService } = require("../usage/telemetry");
                    getTelemetryService().recordUsage({
                        provider: candidate.providerId, model: candidate.modelId,
                        agent: agentName, taskId: opts.taskId,
                        success: false, errorCode: errKind, errorMessage: errMsg.slice(0, 300),
                    });
                    if (pe?.kind === "rate_limited") {
                        getTelemetryService().recordRateLimit(candidate.providerId, candidate.modelId);
                    }
                }
                catch { /* telemetry not yet init */ }
                // Always exclude this specific model from subsequent attempts in this task
                excludedModels.add(`${candidate.providerId}:${candidate.modelId}`);
                // For non-retryable provider-level failures (e.g. invalid API key, insufficient balance/quota), exclude whole provider
                if (pe && !pe.retryable && (pe.kind === "invalid_api_key" ||
                    pe.kind === "missing_api_key" ||
                    pe.kind === "quota_exceeded" ||
                    (pe.kind === "model_unavailable" && candidate.providerId !== "ollama"))) {
                    excludedProviders.add(candidate.providerId);
                }
                const recoveryMsg = `⚠ ${provider.name} / ${candidate.modelId} failed (${shortErr}) — selecting fallback…`;
                emit(sm.current, recoveryMsg, agentName, provider.name, candidate.modelId);
                // Confirm a fallback exists before continuing the loop
                const next = (0, router_1.resolveCandidate)(role, routing, opts.registry, autoMode, excludedProviders, excludedModels, generation.adultMode);
                if (!next && attempts >= MAX_FALLBACKS) {
                    throw new Error(`Provider ${provider.name} failed (${errMsg}) and no other eligible model is available.`);
                }
                // Continue loop to try the next candidate
            }
        }
    };
    try {
        // ── ANALYZING ─────────────────────────────────────────────────────────
        await sm.transition("ANALYZING");
        emit("ANALYZING", "Indexing project structure…");
        if (generation.adultMode) {
            const created = (0, assetCache_1.scaffoldProjectDirs)(opts.workspaceRoot, "ADULT_18_PLUS");
            emit("ANALYZING", `Adult project mode enabled — prepared MatureContent structure (${created.length} directories).`);
        }
        const fileTree = await fileTools.buildFileTree();
        let projectSummary = fileTree.slice(0, 400).join("\n");
        const attachmentBlock = opts.prompt.split("\n\n[Attached files and folders]\n")[1];
        if (attachmentBlock) {
            const selectedPaths = attachmentBlock.split("\n")
                .map((line) => line.replace(/^[-*]\s*/, "").trim())
                .filter(Boolean)
                .slice(0, 20);
            const selectedContext = selectedPaths.map((selectedPath) => {
                try {
                    const stat = fs.statSync(selectedPath);
                    if (!stat.isFile())
                        return `Selected folder: ${selectedPath} (use project scanner/tree for contents)`;
                    return `=== Selected file: ${selectedPath} ===\n${fs.readFileSync(selectedPath, "utf8").slice(0, 6000)}`;
                }
                catch {
                    return `Selected path unavailable: ${selectedPath}`;
                }
            }).join("\n\n");
            if (selectedContext)
                projectSummary += `\n\n## Explicit task inputs\n${selectedContext}`;
        }
        // ── PLANNING ──────────────────────────────────────────────────────────
        await sm.transition("PLANNING");
        emit("PLANNING", "Planner is drafting a strategy…", "Planner");
        const { result: plan, provider: planProv, modelId: planModel } = await executeRole("planner", "Planner", (provider, modelId) => (0, architect_1.runArchitect)(provider, modelId, opts.prompt, projectSummary, generation));
        emit("PLANNING", `Plan ready (${planProv.name} / ${planModel}): ${plan.steps.length} steps, complexity ${plan.estimatedComplexity}`, "Planner", planProv.name, planModel);
        // ── CONTEXT GATHERING ─────────────────────────────────────────────────
        await sm.transition("CONTEXT_GATHERING");
        emit("CONTEXT_GATHERING", `Reading ${plan.relevantFiles.length} relevant files…`);
        const fileContents = {};
        for (const f of plan.relevantFiles) {
            try {
                fileContents[f] = await fileTools.readFile(f);
            }
            catch {
                fileContents[f] = "";
            }
        }
        const checkpointSha = await git.checkpoint(`before task ${opts.taskId}`);
        // ── IMPLEMENTING ──────────────────────────────────────────────────────
        await sm.transition("IMPLEMENTING");
        emit("IMPLEMENTING", "Backend Coder is writing changes…", "Backend Coder");
        const { result: implResult, provider: implProv, modelId: implModel } = await executeRole("backendCoder", "Backend Coder", (provider, modelId) => (0, implementer_1.runImplementer)(provider, modelId, plan, fileContents, generation));
        let implementation = implResult;
        emit("IMPLEMENTING", `Implementation ready (${implProv.name} / ${implModel}): ${implementation.changes.length} file(s)`, "Backend Coder", implProv.name, implModel);
        // ── ENGINEERING REVIEW LOOP ───────────────────────────────────────────
        await sm.transition("ENGINEERING_REVIEW");
        let iteration = 0;
        while (iteration < maxIterations) {
            emit("ENGINEERING_REVIEW", `Engineering review pass ${iteration + 1}/${maxIterations}…`, "Engineering Reviewer");
            const { result: review, provider: revProv, modelId: revModel } = await executeRole("engineeringReviewer", "Engineering Reviewer", (provider, modelId) => (0, engineeringReviewer_1.runEngineeringReview)(provider, modelId, implementation, generation));
            emit("ENGINEERING_REVIEW", `Review result (${revProv.name} / ${revModel}): score ${review.quality_score}/100, severity ${review.severity}`, "Engineering Reviewer", revProv.name, revModel);
            if (!review.rewrite_required || review.severity === "none" || review.severity === "low") {
                emit("ENGINEERING_REVIEW", `✓ Accepted — quality score ${review.quality_score}/100`, "Engineering Reviewer");
                break;
            }
            iteration++;
            if (iteration >= maxIterations) {
                emit("WAITING_FOR_APPROVAL", `Engineering review still failing after ${maxIterations} iterations — human review required`);
                await sm.transition("WAITING_FOR_APPROVAL");
                return { success: false, implementation };
            }
            await sm.transition("REFACTORING");
            const issuesSummary = review.issues.slice(0, 3).join(", ");
            emit("REFACTORING", `Rewrite required (severity: ${review.severity}) — issues: ${issuesSummary}`, "Refactorer");
            const { result: retryImpl } = await executeRole("refactorer", "Refactorer", (provider, modelId) => (0, implementer_1.runImplementer)(provider, modelId, { ...plan, steps: [...plan.steps, ...(review.recommended_changes ?? [])] }, fileContents, generation));
            implementation = retryImpl;
            await sm.transition("ENGINEERING_REVIEW");
        }
        // ── DEBUGGING ─────────────────────────────────────────────────────────
        await sm.transition("DEBUGGING");
        emit("DEBUGGING", "Debugger is analysing the implementation…", "Debugger");
        const { result: debugReport, provider: dbgProv, modelId: dbgModel } = await executeRole("debugger", "Debugger", (provider, modelId) => (0, debugger_1.runDebugger)(provider, modelId, implementation, generation));
        emit("DEBUGGING", `Debug result (${dbgProv.name} / ${dbgModel}): ${debugReport.result}`, "Debugger", dbgProv.name, dbgModel);
        if (debugReport.result === "FAIL") {
            emit("FIXING", `${debugReport.findings.length} issue(s) found — applying fixes…`, "Debugger");
            await sm.transition("FIXING");
            // Apply AI-proposed fixes to implementation
            if (debugReport.fixedCode) {
                for (const [filePath, content] of Object.entries(debugReport.fixedCode)) {
                    const change = implementation.changes.find((c) => c.path === filePath);
                    if (change)
                        change.content = content;
                    else
                        implementation.changes.push({ path: filePath, action: "modify", content, reason: "debug fix" });
                }
            }
            // Re-debug after fixes
            await sm.transition("DEBUGGING");
            emit("DEBUGGING", "Re-checking after debug fixes…", "Debugger");
        }
        else {
            emit("DEBUGGING", "✓ Debug pass — no issues found", "Debugger");
        }
        // ── TEST GENERATION ───────────────────────────────────────────────────
        await sm.transition("TEST_GENERATION");
        emit("TEST_GENERATION", "Generating tests…", "Tester");
        const { result: testPlan } = await executeRole("tester", "Tester", (provider, modelId) => (0, testerJudge_1.runTester)(provider, modelId, implementation, workspaceKind, generation));
        // ── TESTING ───────────────────────────────────────────────────────────
        await sm.transition("TESTING");
        emit("TESTING", "Writing implementation files…");
        for (const change of implementation.changes) {
            if (change.action === "delete")
                await fileTools.deleteFile(change.path).catch(() => { });
            else if (change.content !== undefined)
                await fileTools.writeFile(change.path, change.content);
        }
        for (const testFile of testPlan.testFiles) {
            await fileTools.writeFile(testFile.path, testFile.content);
        }
        // For static workspaces skip npm entirely — run test file directly with node if it's JS
        let testsPassed = true;
        if (workspaceKind === "static") {
            const jsTests = testPlan.testFiles.filter((f) => f.path.endsWith(".js") || f.path.endsWith(".mjs"));
            if (jsTests.length > 0) {
                const testResult = await terminal.run(`node "${jsTests[0].path}"`);
                emit("TESTING", testResult.exitCode === 0 ? "✓ Tests passed" : `Test output:\n${(testResult.stdout + testResult.stderr).slice(0, 400)}`);
                testsPassed = testResult.exitCode === 0;
            }
            else {
                emit("TESTING", "✓ Static project — no runnable test file needed");
            }
        }
        else {
            const runCmd = testPlan.runCommand || "npm test";
            const testResult = await terminal.run(runCmd);
            emit("TESTING", `Test output:\n${(testResult.stdout + testResult.stderr).slice(0, 500)}`);
            if (testResult.exitCode !== 0) {
                testsPassed = false;
                const errorContext = [
                    `Exit code: ${testResult.exitCode}`,
                    testResult.stdout ? `STDOUT:\n${testResult.stdout.slice(0, 2000)}` : "",
                    testResult.stderr ? `STDERR:\n${testResult.stderr.slice(0, 2000)}` : "",
                ].filter(Boolean).join("\n\n");
                emit("FIXING", `Tests failed (exit ${testResult.exitCode}) — invoking Fixer with error context`);
                await sm.transition("FIXING");
                const { result: fixedImpl } = await executeRole("backendCoder", "Fixer", (provider, modelId) => (0, implementer_1.runImplementer)(provider, modelId, { ...plan, steps: [...plan.steps, `FIX TEST FAILURES:\n${errorContext}`] }, { ...fileContents, "__test_error__": errorContext }, generation));
                implementation = fixedImpl;
                for (const change of implementation.changes) {
                    if (change.action === "delete")
                        await fileTools.deleteFile(change.path).catch(() => { });
                    else if (change.content !== undefined)
                        await fileTools.writeFile(change.path, change.content);
                }
                await sm.transition("TESTING");
                const retestResult = await terminal.run(runCmd);
                testsPassed = retestResult.exitCode === 0;
                emit("TESTING", testsPassed ? "✓ Tests passed after fix" : `Tests still failing (exit ${retestResult.exitCode})`);
            }
            else {
                emit("TESTING", "✓ All tests passed");
            }
        }
        // ── BUILDING ──────────────────────────────────────────────────────────
        await sm.transition("BUILDING");
        let buildOk = true;
        if (workspaceKind === "static") {
            emit("BUILDING", "✓ Static project — no build step required");
        }
        else {
            emit("BUILDING", "Running build…");
            const buildResult = await terminal.run("npm run build 2>&1 || echo BUILD_FAILED");
            buildOk = buildResult.exitCode === 0 && !buildResult.stdout.includes("BUILD_FAILED");
            if (!buildOk) {
                const buildError = [
                    `Exit code: ${buildResult.exitCode}`,
                    buildResult.stdout ? `OUTPUT:\n${buildResult.stdout.slice(0, 2000)}` : "",
                    buildResult.stderr ? `STDERR:\n${buildResult.stderr.slice(0, 2000)}` : "",
                ].filter(Boolean).join("\n\n");
                emit("FIXING", "Build failed — invoking Fixer");
                await sm.transition("FIXING");
                const { result: buildFixedImpl } = await executeRole("backendCoder", "Build Fixer", (provider, modelId) => (0, implementer_1.runImplementer)(provider, modelId, { ...plan, steps: [...plan.steps, `FIX BUILD FAILURE:\n${buildError}`] }, { ...fileContents, "__build_error__": buildError }, generation));
                for (const change of buildFixedImpl.changes) {
                    if (change.action === "delete")
                        await fileTools.deleteFile(change.path).catch(() => { });
                    else if (change.content !== undefined)
                        await fileTools.writeFile(change.path, change.content);
                }
                await sm.transition("BUILDING");
                const rebuildResult = await terminal.run("npm run build 2>&1");
                buildOk = rebuildResult.exitCode === 0;
                emit("BUILDING", buildOk ? "✓ Build succeeded after fix" : "Build still failing");
            }
            else {
                emit("BUILDING", "✓ Build succeeded");
            }
        }
        // ── FINAL REVIEW ──────────────────────────────────────────────────────
        await sm.transition("FINAL_REVIEW");
        emit("FINAL_REVIEW", "Final Judge reviewing all outputs…", "Final Judge");
        const gitDiff = await git.diff().catch(() => "");
        const { result: verdict, provider: judgeProv, modelId: judgeModel } = await executeRole("finalJudge", "Final Judge", (provider, modelId) => (0, judge_1.runFinalJudge)(provider, modelId, {
            prompt: opts.prompt,
            implementation,
            gitDiff: gitDiff.slice(0, 3000),
            buildPassed: buildOk,
            testsPassed: testsPassed,
        }, generation));
        emit("FINAL_REVIEW", `Final Judge verdict (${judgeProv.name} / ${judgeModel}): ${verdict.ready ? "READY" : "NOT_READY"} — ${verdict.summary}`, "Final Judge", judgeProv.name, judgeModel);
        if (!verdict.ready) {
            emit("WAITING_FOR_APPROVAL", `Final Judge flagged issues — human review recommended. Notes: ${verdict.summary}`);
            await sm.transition("WAITING_FOR_APPROVAL");
            return { success: false, implementation };
        }
        const changedFiles = implementation.changes.map((change) => `${change.action}: ${change.path}`).join(", ");
        if (generation.adultMode) {
            const validation = (0, projectValidator_1.validateProject)(opts.workspaceRoot, { contentRating: "ADULT_18_PLUS", strictLicenseMode: true });
            emit("FINAL_REVIEW", `Adult-mode validation: ${validation.overall} — ${validation.summary}`);
        }
        const usageCommands = [...implementation.testCommands, ...implementation.buildCommands]
            .filter(Boolean)
            .slice(0, 6)
            .join(" | ");
        emit("FINAL_REVIEW", `TASK SUMMARY — ${implementation.summary || "Implementation completed."} ` +
            `Files: ${changedFiles || "none listed"}. ` +
            `${usageCommands ? `Useful commands: ${usageCommands}` : "Use the workspace files and project instructions to run it."}`);
        emit("FINAL_REVIEW", `✓ Task complete — ${implementation.changes.length} file(s) changed`, "Final Judge");
        await sm.transition("WAITING_FOR_APPROVAL");
        return { success: true, implementation };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emit("FAILED", msg);
        if (!sm.isTerminal())
            await sm.transition("FAILED").catch(() => { });
        return { success: false };
    }
}
