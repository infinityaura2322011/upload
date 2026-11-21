// Dev launcher: compiles backend + electron, then starts both with portable path resolution
const { execFileSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');

// Dynamic Node executable detection
function findNodeExecutable() {
  const candidates = [
    'D:\\tulshi\\node-v24.18.0-win-x64\\node.exe',
    path.join('D:\\', 'tulshi', 'node-v24.18.0-win-x64', 'node.exe'),
    process.execPath,
    'C:\\Program Files\\nodejs\\node.exe',
    'C:\\Program Files (x86)\\nodejs\\node.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'node', 'node.exe'),
    path.join(process.env.APPDATA || '', 'npm', 'node.exe'),
    'C:\\Users\\user\\AppData\\Local\\ms-playwright-go\\1.57.0\\node.exe',
  ];

  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }
  return 'node';
}

const nodeExe = findNodeExecutable();
const tscScript = path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');

console.log(`\n🦖 Coding Monster Dev Launcher`);
console.log(`   Project Root: ${projectRoot}`);
console.log(`   Node Binary:  ${nodeExe}`);

console.log('\n[1/3] Building backend (tsc --project tsconfig.json)...');
try {
  execFileSync(nodeExe, [tscScript, '--project', 'tsconfig.json'], {
    stdio: 'inherit',
    cwd: projectRoot,
  });
} catch (err) {
  console.error('Backend compilation failed.');
  process.exit(1);
}

console.log('\n[2/3] Building electron shell (tsc --project tsconfig.electron.json)...');
try {
  execFileSync(nodeExe, [tscScript, '--project', 'tsconfig.electron.json'], {
    stdio: 'inherit',
    cwd: projectRoot,
  });
} catch (err) {
  console.error('Electron compilation failed.');
  process.exit(1);
}

// Copy schema.sql to dist/db/schema.sql so the server can find it at runtime
const schemaSrc = path.join(projectRoot, 'src', 'db', 'schema.sql');
const schemaDst = path.join(projectRoot, 'dist', 'db', 'schema.sql');
try {
  fs.mkdirSync(path.dirname(schemaDst), { recursive: true });
  fs.copyFileSync(schemaSrc, schemaDst);
  console.log('✓ schema.sql synced to dist/db/');
} catch (err) {
  console.warn('Warning: could not sync schema.sql:', err.message);
}

console.log('\n[3/3] Launching Electron shell...');
const electronPath = require('electron');
const proc = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  cwd: projectRoot,
  env: process.env,
});
proc.on('exit', (code) => process.exit(code || 0));
