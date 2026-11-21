// Test runner for Coding Monster test suite
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const testsDir = path.join(__dirname, "..", "dist", "tests");

if (!fs.existsSync(testsDir)) {
  console.error("dist/tests does not exist. Please run build first (tsc --project tsconfig.json).");
  process.exit(1);
}

const testFiles = fs.readdirSync(testsDir).filter((f) => f.endsWith(".test.js"));

if (testFiles.length === 0) {
  console.log("No test files found in dist/tests.");
  process.exit(0);
}

console.log(`\n🦖 Running ${testFiles.length} Coding Monster Test Suites...\n`);

let passed = 0;
let failed = 0;

for (const file of testFiles) {
  const fullPath = path.join(testsDir, file);
  console.log(`── Running ${file} ──`);
  try {
    execFileSync(process.execPath, [fullPath], { stdio: "inherit" });
    passed++;
  } catch (err) {
    console.error(`❌ Suite failed: ${file}`);
    failed++;
  }
}

console.log(`\n========================================`);
console.log(`Suites Summary: ${passed} passed, ${failed} failed, ${testFiles.length} total`);
console.log(`========================================\n`);

if (failed > 0) process.exit(1);
