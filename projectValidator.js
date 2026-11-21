"use strict";
/**
 * Project Validator — structured pre-completion checks.
 *
 * Produces pass/warn/fail per check. Only fails the build on LICENSE_UNKNOWN
 * assets when strictLicenseMode is enabled. Adult-rated projects are fully
 * supported — the validator checks for required age-gate infrastructure but
 * does not reject the project.
 */
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
exports.validateProject = validateProject;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const assetCache_1 = require("./assetCache");
// ── Check builder helpers ─────────────────────────────────────────────────────
function pass(name, category, message) {
    return { name, status: "pass", category, message };
}
function warn(name, category, message, asset) {
    return { name, status: "warn", category, message, asset };
}
function fail(name, category, message, asset) {
    return { name, status: "fail", category, message, asset };
}
// ── Individual checks ─────────────────────────────────────────────────────────
function checkDependencies(root) {
    const pkgPath = path.join(root, "package.json");
    if (!fs.existsSync(pkgPath))
        return pass("Dependencies", "dependency", "No package.json — skipped");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const nmPath = path.join(root, "node_modules");
    if (!fs.existsSync(nmPath))
        return fail("Dependencies", "dependency", "node_modules missing — run npm install");
    const missing = [];
    for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
        if (!fs.existsSync(path.join(nmPath, dep)))
            missing.push(dep);
    }
    return missing.length === 0
        ? pass("Dependencies", "dependency")
        : fail("Dependencies", "dependency", `Missing packages: ${missing.slice(0, 5).join(", ")}`);
}
function checkMissingAssets(root) {
    const assetsDir = path.join(root, "Assets");
    if (!fs.existsSync(assetsDir))
        return pass("Missing Assets", "asset", "No Assets/ directory — skipped");
    const empty = [];
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (fs.statSync(full).size === 0)
                empty.push(path.relative(root, full));
        }
    }
    walk(assetsDir);
    return empty.length === 0
        ? pass("Missing Assets", "asset")
        : warn("Missing Assets", "asset", `Empty/placeholder files: ${empty.slice(0, 5).join(", ")}`);
}
function checkScripts(root) {
    const srcDir = path.join(root, "Scripts");
    if (!fs.existsSync(srcDir))
        return pass("Scripts", "script", "No Scripts/ directory — skipped");
    const stubs = [];
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (entry.name.endsWith(".js") || entry.name.endsWith(".ts")) {
                const content = fs.readFileSync(full, "utf-8");
                if (content.includes("TODO: implement") || content.trim() === "")
                    stubs.push(path.relative(root, full));
            }
        }
    }
    walk(srcDir);
    return stubs.length === 0
        ? pass("Scripts", "script")
        : warn("Scripts", "script", `Stub/empty scripts: ${stubs.slice(0, 5).join(", ")}`);
}
function checkLicenses(root, strictLicenseMode) {
    const index = (0, assetCache_1.getCacheIndex)(root);
    const entries = Object.values(index);
    if (entries.length === 0)
        return [pass("License Review", "license", "No cached assets to review")];
    const checks = [];
    for (const entry of entries) {
        const m = entry.metadata;
        const conf = m.licenseConfidence ?? "LICENSE_UNKNOWN";
        const name = path.basename(entry.cachedPath);
        if (conf === "LICENSE_CONFIRMED") {
            checks.push(pass(`License: ${name}`, "license"));
        }
        else if (conf === "LICENSE_PARTIAL") {
            checks.push(warn(`License: ${name}`, "license", m.licenseWarning ?? "License partially known — verify before use", name));
        }
        else {
            const msg = m.licenseWarning ?? "License information unavailable";
            checks.push(strictLicenseMode
                ? fail(`License: ${name}`, "license", msg, name)
                : warn(`License: ${name}`, "license", msg, name));
        }
    }
    return checks;
}
function checkContentRating(root, rating) {
    const checks = [];
    const isMature = rating === "MATURE" || rating === "ADULT_18_PLUS";
    if (!isMature) {
        checks.push(pass("Content Rating", "content-rating", `Project rated ${rating} — no special requirements`));
        return checks;
    }
    // Mature/18+ projects need MatureContent directory
    const matureDir = path.join(root, "Assets", "MatureContent");
    if (!fs.existsSync(matureDir)) {
        checks.push(warn("Content Rating: MatureContent dir", "content-rating", `Project rated ${rating} but Assets/MatureContent/ is missing — run scaffold to create it`));
    }
    else {
        checks.push(pass("Content Rating: MatureContent dir", "content-rating"));
    }
    // Age-gate screen check (warn, not fail — developer may implement it differently)
    const ageGatePaths = [
        path.join(root, "Scenes", "AgeGate.js"),
        path.join(root, "Scenes", "AgeGate.ts"),
        path.join(root, "Scripts", "AgeGate.js"),
        path.join(root, "Scripts", "AgeGate.ts"),
        path.join(root, "Scripts", "ageGate.js"),
        path.join(root, "Scripts", "ageGate.ts"),
    ];
    const hasAgeGate = ageGatePaths.some(fs.existsSync);
    checks.push(hasAgeGate
        ? pass("Content Rating: Age gate", "content-rating")
        : warn("Content Rating: Age gate", "content-rating", `${rating} project should include an age-gate screen (AgeGate.js/ts in Scenes/ or Scripts/)`));
    // Content-rating metadata file
    const metaPath = path.join(root, "ProjectData", "content-rating.json");
    checks.push(fs.existsSync(metaPath)
        ? pass("Content Rating: Metadata", "content-rating")
        : warn("Content Rating: Metadata", "content-rating", "Missing ProjectData/content-rating.json — add rating metadata for build reports"));
    return checks;
}
function checkBuild(root) {
    const pkgPath = path.join(root, "package.json");
    if (!fs.existsSync(pkgPath))
        return pass("Build", "build", "No package.json — skipped");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (!pkg.scripts?.build)
        return pass("Build", "build", "No build script defined — skipped");
    const main = pkg.main ?? pkg.module ?? "index.js";
    const mainPath = path.join(root, main);
    return fs.existsSync(mainPath)
        ? pass("Build", "build")
        : warn("Build", "build", `Entry point ${main} not found — run build first`);
}
function checkDuplicateAssets(root) {
    const index = (0, assetCache_1.getCacheIndex)(root);
    const entries = Object.values(index);
    const names = entries.map((e) => path.basename(e.cachedPath).toLowerCase());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    return dupes.length === 0
        ? pass("Duplicate Assets", "asset")
        : warn("Duplicate Assets", "asset", `Possible duplicate filenames: ${[...new Set(dupes)].slice(0, 5).join(", ")}`);
}
function validateProject(root, settings = { contentRating: "EVERYONE", strictLicenseMode: false }) {
    const allChecks = [
        checkDependencies(root),
        checkMissingAssets(root),
        checkDuplicateAssets(root),
        checkScripts(root),
        ...checkLicenses(root, settings.strictLicenseMode ?? false),
        ...checkContentRating(root, settings.contentRating),
        checkBuild(root),
    ];
    const hasFail = allChecks.some((c) => c.status === "fail");
    const hasWarn = allChecks.some((c) => c.status === "warn");
    const overall = hasFail ? "FAIL" : hasWarn ? "WARN" : "PASS";
    const failNames = allChecks.filter((c) => c.status === "fail").map((c) => c.name);
    const warnNames = allChecks.filter((c) => c.status === "warn").map((c) => c.name);
    const summary = overall === "PASS"
        ? "All checks passed — project is ready."
        : overall === "WARN"
            ? `${warnNames.length} warning(s): ${warnNames.slice(0, 3).join(", ")}`
            : `${failNames.length} failure(s): ${failNames.slice(0, 3).join(", ")}`;
    return { checks: allChecks, overall, summary };
}
