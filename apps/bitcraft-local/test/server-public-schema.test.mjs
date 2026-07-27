import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { applySchemaBootstrap, omittedPublicTables } from "../src/server/schemaBootstrap.mjs";

test("fresh public schema omits removed account, bot, deal-alert, Hexite, and empire-membership tables", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  const tables = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
  );

  for (const table of omittedPublicTables) {
    assert.equal(tables.has(table), false, `${table} must not exist in a fresh public database`);
  }
  for (const table of ["claim_directory", "monitored_claims", "craft_plans", "craft_plan_reports", "admin_users"]) {
    assert.equal(tables.has(table), true, `${table} must exist in a fresh public database`);
  }
  const adminColumns = db.prepare("PRAGMA table_info(admin_users)").all().map((row) => row.name);
  assert.equal(adminColumns.includes("password_hash"), false, "public administrators authenticate only through Discord OAuth");
  db.close();
});
