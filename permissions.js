"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionGate = void 0;
exports.classifyCommand = classifyCommand;
// Patterns that classify a command's risk level.
const DANGEROUS_PATTERNS = [
    /\brm\s+-rf\b/, /\bformat\b/, /\bdiskpart\b/, /\bfdisk\b/, /\bmkfs\b/,
    /\bdd\b.*of=/, /\bchmod\s+777\b/, /\bsudo\b/, /\bpasswd\b/, /\bcredential/i,
    /\bregistry\b/i, /\bnet\s+user\b/i, /\bwmic\b/i,
];
const CAUTION_PATTERNS = [
    /\bnpm\s+install\b/, /\bpip\s+install\b/, /\byarn\s+add\b/, /\bgit\s+checkout\b/,
    /\bgit\s+reset\b/, /\bgit\s+clean\b/, /\bgit\s+push\b/, /\bgit\s+force\b/,
    /\bdocker\b/, /\bkubectl\b/,
];
function classifyCommand(command) {
    if (DANGEROUS_PATTERNS.some((p) => p.test(command)))
        return "DANGEROUS";
    if (CAUTION_PATTERNS.some((p) => p.test(command)))
        return "CAUTION";
    return "SAFE";
}
class PermissionGate {
    alwaysAllow = new Set();
    async check(command, level, requestApproval) {
        if (level === "SAFE")
            return true;
        if (this.alwaysAllow.has(command))
            return true;
        const decision = await requestApproval(command, level);
        if (decision === "always_allow") {
            this.alwaysAllow.add(command);
            return true;
        }
        return decision === "allow_once";
    }
}
exports.PermissionGate = PermissionGate;
