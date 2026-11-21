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
exports.WorkspaceGuard = void 0;
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs/promises"));
// Resolves and validates that a path stays within the workspace root.
// Protects against path traversal, absolute escapes, and credential files.
const BLOCKED_NAMES = [".env", ".git/config", "id_rsa", "id_ed25519", ".npmrc", ".netrc"];
class WorkspaceGuard {
    root;
    constructor(root) {
        this.root = root;
    }
    resolve(relativePath) {
        const abs = path.resolve(this.root, relativePath);
        if (!abs.startsWith(path.resolve(this.root))) {
            throw new Error(`Path traversal blocked: "${relativePath}" escapes workspace root`);
        }
        const base = path.basename(abs);
        if (BLOCKED_NAMES.some((b) => abs.endsWith(b) || base === b)) {
            throw new Error(`Access to sensitive file blocked: "${relativePath}"`);
        }
        return abs;
    }
    async assertExists(relativePath) {
        const abs = this.resolve(relativePath);
        await fs.access(abs);
        return abs;
    }
}
exports.WorkspaceGuard = WorkspaceGuard;
