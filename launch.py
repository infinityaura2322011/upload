"""
Coding Monster — Python auto-launcher
Downloads portable Node.js 20 LTS if needed, installs deps, builds, and launches Electron.
Run with: python launch.py
"""
import os, sys, subprocess, urllib.request, zipfile, shutil, json
from pathlib import Path

ROOT = Path(__file__).parent
NODE_DIR = ROOT / ".node"
NODE_VERSION = "20.14.0"
NODE_ZIP_URL = f"https://nodejs.org/dist/v{NODE_VERSION}/node-v{NODE_VERSION}-win-x64.zip"
NODE_EXE = Path(r"D:\tulshi\node-v24.18.0-win-x64\node.exe")
NPM_CMD = Path(r"D:\tulshi\node-v24.18.0-win-x64\npm.cmd")
if not NODE_EXE.exists():
    NODE_EXE = NODE_DIR / f"node-v{NODE_VERSION}-win-x64" / "node.exe"
    NPM_CMD = NODE_DIR / f"node-v{NODE_VERSION}-win-x64" / "npm.cmd"

def log(msg): print(f"\033[92m[monster]\033[0m {msg}", flush=True)
def err(msg): print(f"\033[91m[error]\033[0m {msg}", flush=True)

def download_node():
    if NODE_EXE.exists():
        log(f"Node.js already present at {NODE_EXE}")
        return
    log(f"Downloading portable Node.js {NODE_VERSION}...")
    NODE_DIR.mkdir(exist_ok=True)
    zip_path = NODE_DIR / "node.zip"
    def progress(count, block, total):
        pct = min(100, int(count * block * 100 / total))
        print(f"\r  {pct}%", end="", flush=True)
    urllib.request.urlretrieve(NODE_ZIP_URL, zip_path, reporthook=progress)
    print()
    log("Extracting...")
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(NODE_DIR)
    zip_path.unlink()
    log("Node.js ready.")

def run(cmd, cwd=None, env=None):
    result = subprocess.run(cmd, cwd=cwd or ROOT, env=env or os.environ, shell=True)
    if result.returncode != 0:
        err(f"Command failed: {cmd}")
        sys.exit(result.returncode)

def node_env():
    e = os.environ.copy()
    node_bin = str(NODE_EXE.parent)
    e["PATH"] = node_bin + os.pathsep + e.get("PATH", "")
    return e

def main():
    log("=== CODING MONSTER LAUNCHER ===")
    download_node()
    env = node_env()
    node = str(NODE_EXE)
    npm  = str(NPM_CMD)

    # Install deps if node_modules missing
    if not (ROOT / "node_modules").exists():
        log("Installing npm dependencies (first run — takes a few minutes)...")
        run(f'"{npm}" install', env=env)

    # Build backend TypeScript
    dist_server = ROOT / "dist" / "server.js"
    if not dist_server.exists():
        log("Building backend TypeScript...")
        run(f'"{npm}" run build:backend', env=env)
    # Always ensure schema.sql is in dist
    schema_src = ROOT / "src" / "db" / "schema.sql"
    schema_dst = ROOT / "dist" / "db" / "schema.sql"
    schema_dst.parent.mkdir(parents=True, exist_ok=True)
    if not schema_dst.exists():
        shutil.copy2(schema_src, schema_dst)

    # Launch Electron
    electron_bin = Path(r"D:\autonomus\coding-monster\node_modules\electron\dist\electron.exe")
    if not electron_bin.exists():
        electron_bin = ROOT / "node_modules" / ".bin" / "electron.cmd"
    if not electron_bin.exists():
        electron_bin = ROOT / "node_modules" / "electron" / "dist" / "electron.exe"
    if not electron_bin.exists():
        err("Electron not found. Run: npm install")
        sys.exit(1)

    log("Launching Coding Monster desktop app...")
    subprocess.Popen(
        [str(electron_bin), str(ROOT)],
        cwd=str(ROOT),
        env=env,
    )
    log("App launched. You can close this window.")

if __name__ == "__main__":
    main()
