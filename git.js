"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitTool = void 0;
class GitTool {
    terminal;
    constructor(terminal) {
        this.terminal = terminal;
    }
    async status() {
        const result = await this.terminal.run("git status --porcelain=v1 -b");
        if (result.exitCode !== 0)
            return { branch: "unknown", modified: [], untracked: [], staged: [], isRepo: false };
        const lines = result.stdout.split("\n");
        const branchLine = lines[0] ?? "";
        const branch = branchLine.replace("## ", "").split("...")[0];
        const modified = [];
        const untracked = [];
        const staged = [];
        for (const line of lines.slice(1)) {
            if (!line.trim())
                continue;
            const xy = line.slice(0, 2);
            const file = line.slice(3);
            if (xy[0] !== " " && xy[0] !== "?")
                staged.push(file);
            if (xy[1] === "M")
                modified.push(file);
            if (xy === "??")
                untracked.push(file);
        }
        return { branch, modified, untracked, staged, isRepo: true };
    }
    async diff(file) {
        const cmd = file ? `git diff -- "${file}"` : "git diff";
        const result = await this.terminal.run(cmd);
        return result.stdout;
    }
    async log(n = 10) {
        const result = await this.terminal.run(`git log --oneline -${n}`);
        return result.stdout;
    }
    async checkpoint(message) {
        const status = await this.status();
        if (!status.isRepo)
            return null;
        await this.terminal.run("git add -A");
        const result = await this.terminal.run(`git commit -m "chore(monster): checkpoint — ${message}" --allow-empty`);
        if (result.exitCode !== 0)
            return null;
        const sha = await this.terminal.run("git rev-parse HEAD");
        return sha.stdout.trim();
    }
    async revertToCheckpoint(sha) {
        const result = await this.terminal.run(`git reset --hard ${sha}`);
        return result.exitCode === 0;
    }
}
exports.GitTool = GitTool;
