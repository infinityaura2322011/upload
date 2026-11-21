"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electronAPI", {
    minimize: () => electron_1.ipcRenderer.invoke("window:minimize"),
    maximize: () => electron_1.ipcRenderer.invoke("window:maximize"),
    close: () => electron_1.ipcRenderer.invoke("window:close"),
    openFolder: () => electron_1.ipcRenderer.invoke("dialog:openFolder"),
    openFile: () => electron_1.ipcRenderer.invoke("dialog:openFile"),
    addFiles: () => electron_1.ipcRenderer.invoke("dialog:addFiles"),
    addFolder: () => electron_1.ipcRenderer.invoke("dialog:addFolder"),
    selectFilesAndFolders: () => electron_1.ipcRenderer.invoke("dialog:selectFilesAndFolders"),
    openExternal: (url) => electron_1.ipcRenderer.invoke("shell:openExternal", url),
    getEnv: () => electron_1.ipcRenderer.invoke("env:get"),
    runInTerminal: (cwd, cmd) => electron_1.ipcRenderer.invoke("shell:runInTerminal", cwd, cmd),
    openInExplorer: (folderPath) => electron_1.ipcRenderer.invoke("shell:openInExplorer", folderPath),
    onBackendReady: (cb) => electron_1.ipcRenderer.on("backend:ready", cb),
    onBackendError: (cb) => electron_1.ipcRenderer.on("backend:error", cb),
    webviewScreenshot: (webContentsId) => electron_1.ipcRenderer.invoke("webview:screenshot", webContentsId),
    webviewClick: (webContentsId, x, y) => electron_1.ipcRenderer.invoke("webview:click", webContentsId, x, y),
});
