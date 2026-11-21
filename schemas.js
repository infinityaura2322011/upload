"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JudgeVerdictSchema = exports.AssetMetadataSchema = exports.ProjectValidationReportSchema = exports.ProjectValidationCheckSchema = exports.FinalJudgeVerdictSchema = exports.TestPlanSchema = exports.TestFileSchema = exports.DebugReportSchema = exports.DebugFindingSchema = exports.EngineeringReviewSchema = exports.ImplementationSchema = exports.FileChangeSchema = exports.ArchitectPlanSchema = void 0;
const zod_1 = require("zod");
// Helper to coerce items to string array (supports string[], object[], or single string)
const resilientStringArray = zod_1.z.preprocess((val) => {
    if (Array.isArray(val)) {
        return val.map((item) => {
            if (typeof item === "string")
                return item;
            if (typeof item === "object" && item !== null) {
                return item.description || item.step || item.task || item.title || item.action || JSON.stringify(item);
            }
            return String(item ?? "");
        });
    }
    if (typeof val === "string")
        return [val];
    return [];
}, zod_1.z.array(zod_1.z.string()));
// Helper to normalize complexity to "low" | "medium" | "high"
const resilientComplexity = zod_1.z.preprocess((val) => {
    if (typeof val === "string") {
        const s = val.toLowerCase();
        if (s.includes("low"))
            return "low";
        if (s.includes("high") || s.includes("complex"))
            return "high";
        return "medium";
    }
    return "medium";
}, zod_1.z.enum(["low", "medium", "high"]));
// ── Architect ──────────────────────────────────────────────────────────────
exports.ArchitectPlanSchema = zod_1.z.object({
    summary: zod_1.z.preprocess((v) => (typeof v === "string" ? v : JSON.stringify(v ?? "")), zod_1.z.string()),
    relevantFiles: resilientStringArray,
    steps: resilientStringArray,
    estimatedComplexity: resilientComplexity,
    risks: resilientStringArray,
    dependencies: resilientStringArray,
    avoidRewriting: resilientStringArray,
});
// ── Implementer ────────────────────────────────────────────────────────────
exports.FileChangeSchema = zod_1.z.object({
    path: zod_1.z.string(),
    action: zod_1.z.enum(["create", "modify", "delete"]),
    content: zod_1.z.string().optional(),
    diff: zod_1.z.string().optional(),
    reason: zod_1.z.string(),
});
exports.ImplementationSchema = zod_1.z.object({
    changes: zod_1.z.array(exports.FileChangeSchema),
    summary: zod_1.z.string(),
    testCommands: zod_1.z.array(zod_1.z.string()),
    buildCommands: zod_1.z.array(zod_1.z.string()),
});
const resilientSeverity = zod_1.z.preprocess((val) => {
    if (typeof val === "string") {
        const s = val.toLowerCase().trim();
        if (s === "critical" || s === "fatal")
            return "critical";
        if (s === "high" || s === "error" || s === "err")
            return "error";
        if (s === "medium" || s === "med" || s === "warning" || s === "warn")
            return "warning";
        if (s === "low" || s === "info" || s === "note")
            return "info";
        if (["info", "warning", "error", "critical"].includes(s))
            return s;
    }
    return "warning"; // safe default for any unknown value
}, zod_1.z.enum(["info", "warning", "error", "critical"]));
const resilientReviewSeverity = zod_1.z.preprocess((val) => {
    if (typeof val === "string") {
        const s = val.toLowerCase().trim();
        if (s === "critical" || s === "fatal")
            return "critical";
        if (s === "high" || s === "error" || s === "err")
            return "high";
        if (s === "medium" || s === "med" || s === "warning" || s === "warn")
            return "medium";
        if (s === "low" || s === "info")
            return "low";
        if (s === "none" || s === "clean" || s === "ok" || s === "pass")
            return "none";
        if (["none", "low", "medium", "high", "critical"].includes(s))
            return s;
    }
    return "low"; // safe default
}, zod_1.z.enum(["none", "low", "medium", "high", "critical"]));
// ── Engineering Review ─────────────────────────────────────────────────────
exports.EngineeringReviewSchema = zod_1.z.object({
    quality_score: zod_1.z.preprocess((v) => (typeof v === "number" ? v : Number(v) || 80), zod_1.z.number().min(0).max(100)),
    rewrite_required: zod_1.z.preprocess((v) => Boolean(v), zod_1.z.boolean()),
    severity: resilientReviewSeverity,
    issues: resilientStringArray,
    principles_violated: resilientStringArray,
    recommended_changes: resilientStringArray,
    engineering_rationale: zod_1.z.preprocess((v) => (typeof v === "string" ? v : JSON.stringify(v ?? "")), zod_1.z.string()),
});
// ── Debugger ───────────────────────────────────────────────────────────────
exports.DebugFindingSchema = zod_1.z.object({
    file: zod_1.z.preprocess((v) => (typeof v === "string" ? v : String(v ?? "")), zod_1.z.string()),
    line: zod_1.z.preprocess((v) => (typeof v === "number" ? v : (v ? Number(v) || undefined : undefined)), zod_1.z.number().optional()),
    issue: zod_1.z.preprocess((v) => (typeof v === "string" ? v : String(v ?? "")), zod_1.z.string()),
    severity: resilientSeverity,
    fix: zod_1.z.preprocess((v) => (typeof v === "string" ? v : (v ? String(v) : undefined)), zod_1.z.string().optional()),
});
exports.DebugReportSchema = zod_1.z.object({
    result: zod_1.z.preprocess((val) => {
        if (typeof val === "string") {
            const s = val.toUpperCase().trim();
            if (s.includes("PASS") || s === "SUCCESS" || s === "OK" || s === "CLEAN" || s === "NONE")
                return "PASS";
            return "FAIL";
        }
        return "FAIL";
    }, zod_1.z.enum(["PASS", "FAIL"])),
    findings: zod_1.z.preprocess((v) => (Array.isArray(v) ? v : []), zod_1.z.array(exports.DebugFindingSchema)),
    fixedCode: zod_1.z.record(zod_1.z.string()).optional(),
    summary: zod_1.z.preprocess((v) => (typeof v === "string" ? v : (v ? String(v) : undefined)), zod_1.z.string().optional()),
});
// ── Tester ─────────────────────────────────────────────────────────────────
exports.TestFileSchema = zod_1.z.object({
    path: zod_1.z.string(),
    content: zod_1.z.string(),
    framework: zod_1.z.string(),
});
exports.TestPlanSchema = zod_1.z.object({
    testFiles: zod_1.z.array(exports.TestFileSchema),
    runCommand: zod_1.z.string(),
    coverage: zod_1.z.array(zod_1.z.string()),
});
// ── Final Judge ────────────────────────────────────────────────────────────
exports.FinalJudgeVerdictSchema = zod_1.z.object({
    ready: zod_1.z.boolean(),
    summary: zod_1.z.string(),
    quality_score: zod_1.z.number().min(0).max(100),
    risks: zod_1.z.array(zod_1.z.string()),
    recommendations: zod_1.z.array(zod_1.z.string()),
});
// ── Project Validation ─────────────────────────────────────────────────────
exports.ProjectValidationCheckSchema = zod_1.z.object({
    name: zod_1.z.string(),
    status: zod_1.z.enum(["pass", "warn", "fail"]),
    category: zod_1.z.enum(["compile", "dependency", "asset", "license", "content-rating", "build", "script", "reference"]).optional(),
    asset: zod_1.z.string().optional(),
    message: zod_1.z.string().optional(),
});
exports.ProjectValidationReportSchema = zod_1.z.object({
    checks: zod_1.z.array(exports.ProjectValidationCheckSchema),
    overall: zod_1.z.enum(["PASS", "WARN", "FAIL"]),
    autoRepaired: zod_1.z.array(zod_1.z.string()).optional(),
    summary: zod_1.z.string(),
});
exports.AssetMetadataSchema = zod_1.z.object({
    name: zod_1.z.string(),
    sourceUrl: zod_1.z.string().optional(),
    downloadUrl: zod_1.z.string().optional(),
    creator: zod_1.z.string().optional(),
    license: zod_1.z.string().optional(), // SPDX or human-readable
    licenseUrl: zod_1.z.string().optional(),
    licenseConfidence: zod_1.z.enum(["LICENSE_CONFIRMED", "LICENSE_PARTIAL", "LICENSE_UNKNOWN"]).default("LICENSE_UNKNOWN"),
    licenseStatus: zod_1.z.enum(["CONFIRMED", "PARTIAL", "UNKNOWN"]).default("UNKNOWN"),
    commercialUse: zod_1.z.boolean().optional(),
    modificationAllowed: zod_1.z.boolean().optional(),
    attributionRequired: zod_1.z.boolean().optional(),
    contentRating: zod_1.z.enum(["EVERYONE", "TEEN", "MATURE", "ADULT_18_PLUS"]).default("EVERYONE"),
    nudity: zod_1.z.boolean().default(false),
    sexualContent: zod_1.z.boolean().default(false),
    violence: zod_1.z.boolean().default(false),
    gore: zod_1.z.boolean().default(false),
    mimeType: zod_1.z.string().optional(),
    width: zod_1.z.number().optional(),
    height: zod_1.z.number().optional(),
    fileSize: zod_1.z.number().optional(),
    sourceProvider: zod_1.z.string().optional(),
    checksum: zod_1.z.string().optional(),
    assetCategory: zod_1.z.enum(["character", "background", "ui", "texture", "animation", "audio", "model", "icon", "font", "other"]).default("other"),
    projectPath: zod_1.z.string().optional(),
    projectUsage: zod_1.z.string().optional(),
    fetchedAt: zod_1.z.number().optional(),
    licenseWarning: zod_1.z.string().optional(),
});
// ── Legacy Judge (A vs B comparison) ──────────────────────────────────────
exports.JudgeVerdictSchema = zod_1.z.object({
    winner: zod_1.z.enum(["A", "B", "tie"]),
    scores: zod_1.z.object({ A: zod_1.z.number(), B: zod_1.z.number() }),
    rationale: zod_1.z.string(),
    recommendation: zod_1.z.string(),
});
