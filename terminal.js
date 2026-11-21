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
exports.TerminalTool = void 0;
const node_child_process_1 = require("node:child_process");
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const permissions_1 = require("./permissions");
/**
 * Resolve npm/npx to the bundled portable node's npm if system npm is absent.
 * Searches multiple common locations on Windows to find a working node+npm.
 */
function resolveEnvWithNpm() {
    const env = { ...process.env };
    const currentPath = env.PATH ?? "";
    // Quick check: if PATH already has node/npm, we're good
    const lowerPath = currentPath.toLowerCase();
    if (lowerPath.includes("nodejs") || lowerPath.includes("\\npm") || lowerPath.includes("/npm"))
        return env;
    // Gather candidate directories where node+npm might live
    const extra = [];
    // 1. The directory of the Node binary running this process
    const selfDir = path.dirname(process.execPath);
    if (fs.existsSync(path.join(selfDir, "npm.cmd")) || fs.existsSync(path.join(selfDir, "npm"))) {
        extra.push(selfDir);
    }
    // 2. Standard Windows Node.js install locations
    const standardPaths = [
        "C:\\Program Files\\nodejs",
        "C:\\Program Files (x86)\\nodejs",
    ];
    for (const sp of standardPaths) {
        if (fs.existsSync(path.join(sp, "npm.cmd")))
            extra.push(sp);
    }
    // 3. NVM for Windows
    const nvmHome = env.NVM_HOME;
    const nvmSymlink = env.NVM_SYMLINK;
    if (nvmSymlink && fs.existsSync(path.join(nvmSymlink, "npm.cmd"))) {
        extra.push(nvmSymlink);
    }
    else if (nvmHome && fs.existsSync(nvmHome)) {
        try {
            const vers = fs.readdirSync(nvmHome).filter((d) => d.startsWith("v") || /^\d/.test(d));
            if (vers.length > 0) {
                const latest = vers.sort().reverse()[0];
                const dir = path.join(nvmHome, latest);
                if (fs.existsSync(path.join(dir, "npm.cmd")))
                    extra.push(dir);
            }
        }
        catch { /* ignore */ }
    }
    // 4. fnm / volta
    const localApp = env.LOCALAPPDATA || "";
    const appData = env.APPDATA || "";
    const fnmPaths = [
        path.join(localApp, "fnm_multishells"),
        path.join(localApp, "Volta", "bin"),
        path.join(appData, "npm"),
    ];
    for (const fp of fnmPaths) {
        if (fs.existsSync(fp))
            extra.push(fp);
    }
    // 5. Bundled .node directory in the project
    const bundleCandidates = [
        path.join(__dirname, "..", "..", ".node"),
        path.join(process.cwd(), ".node"),
    ];
    for (const base of bundleCandidates) {
        if (!fs.existsSync(base))
            continue;
        try {
            const entries = fs.readdirSync(base).filter((d) => d.startsWith("node-"));
            if (entries.length > 0)
                extra.push(path.join(base, entries[0]));
        }
        catch { /* ignore */ }
    }
    if (extra.length > 0) {
        // Deduplicate and prepend to PATH
        const unique = [...new Set(extra)];
        env.PATH = unique.join(path.delimiter) + path.delimiter + currentPath;
    }
    return env;
}
const ENV_WITH_NPM = resolveEnvWithNpm();
class TerminalTool {
    cwd;
    gate;
    log;
    requestApproval;
    constructor(cwd, gate, log, requestApproval) {
        this.cwd = cwd;
        this.gate = gate;
        this.log = log;
        this.requestApproval = requestApproval;
    }
    async run(command, timeoutMs = 120_000) {
        const level = (0, permissions_1.classifyCommand)(command);
        const allowed = await this.gate.check(command, level, this.requestApproval);
        if (!allowed) {
            this.log(`[terminal] DENIED: ${command}`);
            return { stdout: "", stderr: "Command denied by permission gate", exitCode: 1, command };
        }
        this.log(`[terminal] ${this.cwd}> run (${level}): ${command}`);
        return new Promise((resolve) => {
            const proc = (0, node_child_process_1.spawn)(command, { shell: true, cwd: this.cwd, env: ENV_WITH_NPM });
            let stdout = "";
            let stderr = "";
            const timer = setTimeout(() => { proc.kill(); resolve({ stdout, stderr: stderr + "\n[TIMEOUT]", exitCode: 124, command }); }, timeoutMs);
            proc.stdout.on("data", (d) => { stdout += d.toString(); });
            proc.stderr.on("data", (d) => { stderr += d.toString(); });
            proc.on("close", (code) => { clearTimeout(timer); resolve({ stdout, stderr, exitCode: code ?? 1, command }); });
        });
    }
}
exports.TerminalTool = TerminalTool;
