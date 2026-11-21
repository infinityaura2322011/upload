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
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
let mainWindow = null;
let backendProcess = null;
const PORT = 4319;
function resolveEnvPath() {
    const candidates = [
        path.join(electron_1.app.getAppPath(), ".env"),
        path.join(process.cwd(), ".env"),
        path.join(__dirname, "..", ".env"),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c))
            return c;
    }
    return candidates[0];
}
function loadEnv() {
    const envPath = resolveEnvPath();
    if (!fs.existsSync(envPath))
        return;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?([^"'\r\n]*)["']?\s*$/);
        if (m && !process.env[m[1]])
            process.env[m[1]] = m[2].trim();
    }
}
/** Kill whatever process is holding PORT so we always start fresh */
function killPortProcess(port) {
    try {
        if (process.platform === "win32") {
            const out = (0, child_process_1.execSync)(`netstat -aon 2>nul | findstr :${port}`, { encoding: "utf8" });
            const pids = new Set();
            for (const line of out.split("\n")) {
                const m = line.trim().match(/\s+(\d+)$/);
                if (m && m[1] !== "0")
                    pids.add(m[1]);
            }
            for (const pid of pids) {
                try {
                    (0, child_process_1.execSync)(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
                }
                catch { }
            }
        }
    }
    catch {
        // Non-fatal — port may simply be free
    }
}
function findNodeBinary() {
    const candidates = [
        path.join(__dirname, "..", ".node", "node-v20.14.0-win-x64", "node.exe"),
        "D:\\tulshi\\node-v24.18.0-win-x64\\node.exe",
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files (x86)\\nodejs\\node.exe",
        path.join(process.env.LOCALAPPDATA || "", "Programs", "nodejs", "node.exe"),
        path.join(process.env.LOCALAPPDATA || "", "ms-playwright-go", "1.57.0", "node.exe"),
        "C:\\Users\\user\\AppData\\Local\\ms-playwright-go\\1.57.0\\node.exe",
        "C:\\Users\\user\\AppData\\Roaming\\npm\\node.exe",
    ];
    for (const candidate of candidates) {
        if (candidate && fs.existsSync(candidate)) {
            return { binary: candidate, env: { ...process.env } };
        }
    }
    // Best-effort fallback: if no Node runtime is present, keep the app usable instead of hanging the UI forever.
    return { binary: process.execPath, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } };
}
async function startBackend() {
    loadEnv();
    // Always kill stale backend first so we run the latest build
    killPortProcess(PORT);
    // Give OS a moment to release the port
    await new Promise((r) => setTimeout(r, 400));
    const serverScript = path.join(__dirname, "..", "dist", "server.js");
    if (!fs.existsSync(serverScript)) {
        console.error("Backend not built. Run: npm run build:backend");
        return;
    }
    // Sync schema.sql to dist
    const schemaSrc = path.join(__dirname, "..", "src", "db", "schema.sql");
    const schemaDst = path.join(__dirname, "..", "dist", "db", "schema.sql");
    if (!fs.existsSync(schemaDst) && fs.existsSync(schemaSrc)) {
        try {
            fs.mkdirSync(path.dirname(schemaDst), { recursive: true });
            fs.copyFileSync(schemaSrc, schemaDst);
        }
        catch { }
    }
    const { binary: nodeBin, env: nodeEnv } = findNodeBinary();
    backendProcess = (0, child_process_1.spawn)(nodeBin, [serverScript], {
        env: nodeEnv,
        stdio: ["ignore", "pipe", "pipe"],
    });
    backendProcess.stdout?.on("data", (d) => process.stdout.write("[backend] " + d));
    backendProcess.stderr?.on("data", (d) => process.stderr.write("[backend] " + d));
    backendProcess.on("exit", (code) => {
        if (code && code !== 0)
            console.error(`Backend exited with code ${code}`);
    });
}
function waitForBackend(retries = 80) {
    // Use http module — fetch is NOT available in Electron main process Node context
    const http = require("http");
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const check = () => {
            const req = http.get(`http://127.0.0.1:${PORT}/api/providers`, (res) => {
                if (res.statusCode && res.statusCode < 500)
                    resolve();
                else {
                    attempts++;
                    if (attempts >= retries)
                        reject(new Error("Backend not ready"));
                    else
                        setTimeout(check, 500);
                }
                res.resume();
            });
            req.on("error", () => {
                attempts++;
                if (attempts >= retries)
                    reject(new Error("Backend did not start in time"));
                else
                    setTimeout(check, 500);
            });
            req.setTimeout(400, () => { req.destroy(); });
        };
        check();
    });
}
async function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1600,
        height: 960,
        minWidth: 1200,
        minHeight: 700,
        frame: false,
        titleBarStyle: "hidden",
        backgroundColor: "#0b1017",
        icon: path.join(__dirname, "..", "public", "icon.png"),
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
            webSecurity: false,
            allowRunningInsecureContent: true,
        },
        show: false,
    });
    // Grant all permissions for webview (camera, media, etc.) so Perchance loads fully
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, _perm, callback) => {
        callback(true);
    });
    // When a webview is attached, also grant it full permissions and disable web security
    mainWindow.webContents.on("did-attach-webview", (_event, webContents) => {
        webContents.session.setPermissionRequestHandler((_wc, _perm, callback) => {
            callback(true);
        });
        // Allow autoplay and mixed content in webview
        webContents.setWindowOpenHandler(() => ({ action: "allow" }));
    });
    mainWindow.loadFile(path.join(__dirname, "..", "public", "index.html"));
    mainWindow.show();
    waitForBackend().then(() => {
        mainWindow?.webContents.send("backend:ready");
    }).catch(() => {
        mainWindow?.webContents.send("backend:error");
    });
    mainWindow.on("closed", () => { mainWindow = null; });
}
// ── IPC handlers ─────────────────────────────────────────────────────────────
electron_1.ipcMain.handle("window:minimize", () => mainWindow?.minimize());
electron_1.ipcMain.handle("window:maximize", () => {
    if (mainWindow?.isMaximized())
        mainWindow.unmaximize();
    else
        mainWindow?.maximize();
});
electron_1.ipcMain.handle("window:close", () => mainWindow?.close());
function getOwnedWebview(event, id) {
    if (event.sender !== mainWindow?.webContents || !Number.isInteger(id))
        return null;
    const child = electron_1.webContents.fromId(id);
    return child && child.getType() === "webview" ? child : null;
}
electron_1.ipcMain.handle("webview:screenshot", async (event, webContentsId) => {
    const child = getOwnedWebview(event, webContentsId);
    if (!child)
        throw new Error("Unknown webview");
    const image = await child.capturePage();
    const size = image.getSize();
    return { base64: image.toPNG().toString("base64"), width: size.width, height: size.height };
});
electron_1.ipcMain.handle("webview:click", async (event, webContentsId, x, y) => {
    const child = getOwnedWebview(event, webContentsId);
    if (!child || !Number.isFinite(x) || !Number.isFinite(y))
        throw new Error("Invalid webview click");
    const point = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) };
    child.sendInputEvent({ type: "mouseMove", ...point });
    child.sendInputEvent({ type: "mouseDown", ...point, button: "left", clickCount: 1 });
    child.sendInputEvent({ type: "mouseUp", ...point, button: "left", clickCount: 1 });
    return { ok: true, ...point };
});
electron_1.ipcMain.handle("dialog:openFolder", async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
        title: "Select Project Workspace",
    });
    return result.canceled ? null : result.filePaths[0];
});
electron_1.ipcMain.handle("dialog:openFile", async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        title: "Open Project File",
    });
    return result.canceled ? null : result.filePaths[0];
});
electron_1.ipcMain.handle("dialog:addFiles", async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ["openFile", "multiSelections"],
        title: "Add Project Files",
    });
    return result.canceled ? [] : result.filePaths;
});
electron_1.ipcMain.handle("dialog:addFolder", async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ["openDirectory"],
        title: "Add Project Folder",
    });
    return result.canceled ? null : result.filePaths[0];
});
electron_1.ipcMain.handle("dialog:selectFilesAndFolders", async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ["openFile", "openDirectory", "multiSelections"],
        title: "Add Files or Folders to Task",
    });
    return result.canceled ? [] : result.filePaths;
});
electron_1.ipcMain.handle("shell:openExternal", (_e, url) => electron_1.shell.openExternal(url));
electron_1.ipcMain.handle("shell:runInTerminal", (_e, cwd, cmd) => {
    // Opens a real visible terminal window and runs the command
    if (process.platform === "win32") {
        (0, child_process_1.spawn)("cmd.exe", ["/c", `start "Run" cmd.exe /K cd /d ${cwd} && ${cmd}`], { detached: true, stdio: "ignore" }).unref();
    }
    else if (process.platform === "darwin") {
        (0, child_process_1.spawn)("open", ["-a", "Terminal", cwd], { detached: true, stdio: "ignore" }).unref();
    }
    else {
        (0, child_process_1.spawn)("x-terminal-emulator", ["-e", `bash -c "cd '${cwd}' && ${cmd}; exec bash"`], { detached: true, stdio: "ignore" }).unref();
    }
    return { ok: true };
});
electron_1.ipcMain.handle("shell:openInExplorer", (_e, folderPath) => {
    if (process.platform === "win32") {
        (0, child_process_1.spawn)("explorer.exe", [folderPath], { detached: true, stdio: "ignore" }).unref();
    }
    else if (process.platform === "darwin") {
        (0, child_process_1.spawn)("open", [folderPath], { detached: true, stdio: "ignore" }).unref();
    }
    else {
        (0, child_process_1.spawn)("xdg-open", [folderPath], { detached: true, stdio: "ignore" }).unref();
    }
    return { ok: true };
});
electron_1.ipcMain.handle("env:get", () => ({
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT ?? "",
    PORT,
}));
// ── App lifecycle ─────────────────────────────────────────────────────────────
electron_1.app.whenReady().then(async () => {
    await startBackend();
    await createWindow();
});
function cleanupBackend() {
    if (backendProcess) {
        try {
            backendProcess.kill();
        }
        catch { }
        backendProcess = null;
    }
}
electron_1.app.on("window-all-closed", () => {
    cleanupBackend();
    if (process.platform !== "darwin")
        electron_1.app.quit();
});
electron_1.app.on("before-quit", cleanupBackend);
electron_1.app.on("will-quit", cleanupBackend);
process.on("exit", cleanupBackend);
