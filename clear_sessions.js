const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, "..", "coding-monster.db"));
const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasmPath) });
  const db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  for (const table of ["task_events", "tasks", "usage_log", "usage_events", "quota_snapshots"]) {
    db.run(`DELETE FROM ${table}`);
  }
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  console.log(`Cleared task sessions, events, usage history, and quota snapshots from ${dbPath}`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
