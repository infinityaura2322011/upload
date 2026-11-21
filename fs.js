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
exports.FileTools = void 0;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const workspaceGuard_1 = require("./workspaceGuard");
class FileTools {
    log;
    guard;
    constructor(workspaceRoot, log) {
        this.log = log;
        this.guard = new workspaceGuard_1.WorkspaceGuard(workspaceRoot);
    }
    async readFile(relativePath) {
        const abs = this.guard.resolve(relativePath);
        this.log(`[fs] read ${relativePath}`);
        return fs.readFile(abs, "utf8");
    }
    async writeFile(relativePath, content) {
        const abs = this.guard.resolve(relativePath);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        this.log(`[fs] write ${relativePath} (${content.length} bytes)`);
        await fs.writeFile(abs, content, "utf8");
    }
    async deleteFile(relativePath) {
        const abs = await this.guard.assertExists(relativePath);
        this.log(`[fs] delete ${relativePath}`);
        await fs.unlink(abs);
    }
    async listDirectory(relativePath = ".") {
        const abs = this.guard.resolve(relativePath);
        this.log(`[fs] list ${relativePath}`);
        const entries = await fs.readdir(abs, { withFileTypes: true });
        return entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
    }
    async buildFileTree(dir = ".", depth = 0, maxDepth = 4) {
        if (depth > maxDepth)
            return [];
        const abs = this.guard.resolve(dir);
        let entries;
        try {
            entries = await fs.readdir(abs, { withFileTypes: true });
        }
        catch {
            return [];
        }
        const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv"]);
        const lines = [];
        for (const e of entries) {
            if (SKIP.has(e.name))
                continue;
            const rel = path.join(dir, e.name).replace(/\\/g, "/");
            lines.push("  ".repeat(depth) + (e.isDirectory() ? `📁 ${e.name}/` : `📄 ${e.name}`));
            if (e.isDirectory())
                lines.push(...await this.buildFileTree(rel, depth + 1, maxDepth));
        }
        return lines;
    }
    async fileExists(relativePath) {
        try {
            await this.guard.assertExists(relativePath);
            return true;
        }
        catch {
            return false;
        }
    }
}
exports.FileTools = FileTools;
