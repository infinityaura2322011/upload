"use strict";
/**
 * Asset Cache — structured local store with hash-based deduplication.
 *
 * Layout:
 *   .asset_cache/
 *     metadata.json      — index of all cached assets (keyed by SHA-256)
 *     downloads/         — raw downloaded files
 *     processed/         — converted/optimised versions
 *     thumbnails/        — preview images
 *     hashes/            — per-hash marker files for fast lookup
 *     licenses/          — per-asset license text files
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
exports.scaffoldProjectDirs = scaffoldProjectDirs;
exports.resolveAssetTargetPath = resolveAssetTargetPath;
exports.downloadAsset = downloadAsset;
exports.importLocalAsset = importLocalAsset;
exports.getCacheIndex = getCacheIndex;
exports.getCacheEntryById = getCacheEntryById;
exports.generateLicenseReport = generateLicenseReport;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const https = __importStar(require("node:https"));
const http = __importStar(require("node:http"));
const crypto = __importStar(require("node:crypto"));
const node_url_1 = require("node:url");
const CACHE_ROOT = ".asset_cache";
// ── Cache subdirectory helpers ────────────────────────────────────────────────
function cacheRoot(workspaceRoot) { return path.join(workspaceRoot, CACHE_ROOT); }
function metadataPath(workspaceRoot) { return path.join(cacheRoot(workspaceRoot), "metadata.json"); }
function downloadsDir(workspaceRoot) { return path.join(cacheRoot(workspaceRoot), "downloads"); }
function hashesDir(workspaceRoot) { return path.join(cacheRoot(workspaceRoot), "hashes"); }
function licensesDir(workspaceRoot) { return path.join(cacheRoot(workspaceRoot), "licenses"); }
function ensureCacheDirs(workspaceRoot) {
    for (const d of [
        cacheRoot(workspaceRoot),
        downloadsDir(workspaceRoot),
        path.join(cacheRoot(workspaceRoot), "processed"),
        path.join(cacheRoot(workspaceRoot), "thumbnails"),
        hashesDir(workspaceRoot),
        licensesDir(workspaceRoot),
    ]) {
        if (!fs.existsSync(d))
            fs.mkdirSync(d, { recursive: true });
    }
}
function loadMetadata(workspaceRoot) {
    const p = metadataPath(workspaceRoot);
    if (!fs.existsSync(p))
        return {};
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
    catch {
        return {};
    }
}
function saveMetadata(workspaceRoot, index) {
    ensureCacheDirs(workspaceRoot);
    fs.writeFileSync(metadataPath(workspaceRoot), JSON.stringify(index, null, 2), "utf-8");
}
// ── Project directory structure ───────────────────────────────────────────────
const BASE_DIRS = [
    "Assets/Characters", "Assets/Environments", "Assets/Textures",
    "Assets/Animations", "Assets/Audio", "Assets/UI", "Assets/Imported",
    "Scripts", "Scenes", "Prefabs", "Materials", "Resources", "ProjectData",
];
function scaffoldProjectDirs(workspaceRoot, contentRating) {
    const dirs = (contentRating === "MATURE" || contentRating === "ADULT_18_PLUS")
        ? [...BASE_DIRS, "Assets/MatureContent"]
        : BASE_DIRS;
    const created = [];
    for (const d of dirs) {
        const full = path.join(workspaceRoot, d);
        if (!fs.existsSync(full)) {
            fs.mkdirSync(full, { recursive: true });
            created.push(d);
        }
    }
    return created;
}
function categoryToDir(cat) {
    const map = {
        character: "Assets/Characters", background: "Assets/Environments",
        ui: "Assets/UI", texture: "Assets/Textures", animation: "Assets/Animations",
        audio: "Assets/Audio", model: "Assets/Imported", icon: "Assets/UI",
        font: "Assets/UI", other: "Assets/Imported",
    };
    return map[cat ?? "other"] ?? "Assets/Imported";
}
function resolveAssetTargetPath(workspaceRoot, asset, contentRating) {
    const isMatureProject = contentRating === "MATURE" || contentRating === "ADULT_18_PLUS";
    const isMatureAsset = asset.contentRating === "MATURE" || asset.contentRating === "ADULT_18_PLUS";
    const baseDir = (isMatureProject && isMatureAsset) ? "Assets/MatureContent" : categoryToDir(asset.assetCategory ?? "other");
    const rawUrl = asset.downloadUrl ?? asset.name;
    const ext = path.extname(rawUrl.split("?")[0]) || ".bin";
    const safe = (asset.name ?? "asset").replace(/[^a-zA-Z0-9_\-. ]/g, "_").replace(/\s+/g, "_").slice(0, 60);
    return path.join(workspaceRoot, baseDir, safe + ext);
}
// ── Download helper ───────────────────────────────────────────────────────────
function downloadBuffer(url, redirects = 0) {
    if (redirects > 5)
        return Promise.reject(new Error("Too many redirects"));
    return new Promise((resolve, reject) => {
        const parsed = new node_url_1.URL(url);
        const lib = parsed.protocol === "https:" ? https : http;
        lib.get(url, { headers: { "User-Agent": "CodingMonster/1.0 (asset-cache)" } }, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return downloadBuffer(res.headers.location, redirects + 1).then(resolve).catch(reject);
            }
            if ((res.statusCode ?? 0) >= 400)
                return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => resolve(Buffer.concat(chunks)));
        }).on("error", reject);
    });
}
/**
 * Downloads an asset URL, deduplicates by SHA-256, places it in the correct
 * project directory, and records full metadata in the cache index.
 */
async function downloadAsset(workspaceRoot, asset, contentRating) {
    const index = loadMetadata(workspaceRoot);
    // Fast path: already cached by URL
    const byUrl = Object.values(index).find((e) => e.metadata.downloadUrl === asset.downloadUrl);
    if (byUrl && fs.existsSync(byUrl.cachedPath)) {
        if (!byUrl.usedIn.includes(workspaceRoot))
            byUrl.usedIn.push(workspaceRoot);
        saveMetadata(workspaceRoot, index);
        return { targetPath: byUrl.cachedPath, checksum: byUrl.checksum, fromCache: true, sizeBytes: fs.statSync(byUrl.cachedPath).size };
    }
    const buffer = await downloadBuffer(asset.downloadUrl);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    // Deduplicate by hash
    if (index[checksum] && fs.existsSync(index[checksum].cachedPath)) {
        if (!index[checksum].usedIn.includes(workspaceRoot))
            index[checksum].usedIn.push(workspaceRoot);
        saveMetadata(workspaceRoot, index);
        return { targetPath: index[checksum].cachedPath, checksum, fromCache: true, sizeBytes: buffer.length };
    }
    ensureCacheDirs(workspaceRoot);
    scaffoldProjectDirs(workspaceRoot, contentRating);
    const targetPath = resolveAssetTargetPath(workspaceRoot, asset, contentRating);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, buffer);
    // Write raw copy to downloads/
    const dlPath = path.join(downloadsDir(workspaceRoot), checksum + path.extname(targetPath));
    fs.writeFileSync(dlPath, buffer);
    // Write hash marker
    fs.writeFileSync(path.join(hashesDir(workspaceRoot), checksum), targetPath, "utf-8");
    // Write license file if known
    if (asset.license && asset.license !== "Unknown") {
        const licText = [
            `Asset: ${asset.name}`,
            `Source: ${asset.sourceUrl ?? "N/A"}`,
            `Creator: ${asset.creator ?? "Unknown"}`,
            `License: ${asset.license}`,
            `License URL: ${asset.licenseUrl ?? "N/A"}`,
            `Confidence: ${asset.licenseConfidence ?? "LICENSE_UNKNOWN"}`,
            asset.licenseWarning ? `Warning: ${asset.licenseWarning}` : "",
        ].filter(Boolean).join("\n");
        fs.writeFileSync(path.join(licensesDir(workspaceRoot), checksum + ".txt"), licText, "utf-8");
    }
    const entry = {
        checksum,
        cachedPath: targetPath,
        fetchedAt: Date.now(),
        usedIn: [workspaceRoot],
        metadata: { ...asset, checksum, fetchedAt: Date.now(), projectPath: targetPath, projectUsage: workspaceRoot },
    };
    index[checksum] = entry;
    saveMetadata(workspaceRoot, index);
    return { targetPath, checksum, fromCache: false, sizeBytes: buffer.length };
}
/**
 * Imports a locally provided file into the project asset structure.
 * Computes checksum, deduplicates, and records metadata.
 */
function importLocalAsset(workspaceRoot, filePath, metadata, contentRating) {
    if (!fs.existsSync(filePath))
        throw new Error(`File not found: ${filePath}`);
    const buffer = fs.readFileSync(filePath);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const index = loadMetadata(workspaceRoot);
    if (index[checksum] && fs.existsSync(index[checksum].cachedPath)) {
        if (!index[checksum].usedIn.includes(workspaceRoot))
            index[checksum].usedIn.push(workspaceRoot);
        saveMetadata(workspaceRoot, index);
        return { targetPath: index[checksum].cachedPath, checksum, fromCache: true, sizeBytes: buffer.length };
    }
    ensureCacheDirs(workspaceRoot);
    scaffoldProjectDirs(workspaceRoot, contentRating);
    const enriched = {
        ...metadata,
        checksum,
        fileSize: buffer.length,
        fetchedAt: Date.now(),
        sourceProvider: metadata.sourceProvider ?? "user",
    };
    const targetPath = resolveAssetTargetPath(workspaceRoot, enriched, contentRating);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(filePath, targetPath);
    fs.writeFileSync(path.join(hashesDir(workspaceRoot), checksum), targetPath, "utf-8");
    index[checksum] = { checksum, cachedPath: targetPath, fetchedAt: Date.now(), usedIn: [workspaceRoot], metadata: { ...enriched, projectPath: targetPath, projectUsage: workspaceRoot } };
    saveMetadata(workspaceRoot, index);
    return { targetPath, checksum, fromCache: false, sizeBytes: buffer.length };
}
function getCacheIndex(workspaceRoot) {
    return loadMetadata(workspaceRoot);
}
function getCacheEntryById(workspaceRoot, checksum) {
    return loadMetadata(workspaceRoot)[checksum];
}
function generateLicenseReport(workspaceRoot) {
    const index = loadMetadata(workspaceRoot);
    const lines = ["# Asset License Report", ""];
    for (const entry of Object.values(index)) {
        const m = entry.metadata;
        lines.push(`## ${m.name}`);
        lines.push(`- Source:      ${m.sourceUrl ?? "N/A"}`);
        lines.push(`- Creator:     ${m.creator ?? "Unknown"}`);
        lines.push(`- License:     ${m.license ?? "Unknown"}`);
        lines.push(`- Confidence:  ${m.licenseConfidence ?? "LICENSE_UNKNOWN"}`);
        lines.push(`- Status:      ${m.licenseStatus ?? "UNKNOWN"}`);
        lines.push(`- Rating:      ${m.contentRating ?? "EVERYONE"}`);
        lines.push(`- Mature flags: nudity=${Boolean(m.nudity)}, sexual=${Boolean(m.sexualContent)}, violence=${Boolean(m.violence)}, gore=${Boolean(m.gore)}`);
        lines.push(`- Cached:      ${new Date(entry.fetchedAt).toISOString()}`);
        if (m.licenseWarning)
            lines.push(`- ⚠ Warning:  ${m.licenseWarning}`);
        lines.push("");
    }
    return lines.join("\n");
}
