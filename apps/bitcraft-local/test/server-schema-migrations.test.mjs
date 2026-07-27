import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  applyAdditiveColumnMigrations,
  applyLegacySchemaCleanup,
  applySchemaIndexStatements,
  applySettlementStateMigration,
  schemaIndexStatements,
} from "../src/server/schemaMigrations.mjs";

test("additive migrations update retained tables and skip omitted public tables", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE retained (id INTEGER PRIMARY KEY);");
  applyAdditiveColumnMigrations(db, [
    { table: "removed_table", column: "ignored", definition: "TEXT" },
    { table: "retained", column: "value", definition: "TEXT" },
  ]);
  const columns = db.prepare("PRAGMA table_info(retained)").all().map((row) => row.name);
  assert.deepEqual(columns, ["id", "value"]);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'removed_table'").get(), undefined);
  db.close();
});

test("release-sensitive indexes include claim and shared-plan audit scope", () => {
  assert.ok(schemaIndexStatements.some((statement) => statement.includes("idx_activity_source")));
  assert.ok(schemaIndexStatements.some((statement) => statement.includes("idx_market_events_source")));
  assert.ok(schemaIndexStatements.some((statement) => statement.includes("idx_admin_users_discord_id")));
  assert.ok(schemaIndexStatements.some((statement) => statement.includes("(claim_id, plan_id, captured_at DESC)")));

  const calls = [];
  applySchemaIndexStatements({ exec: (sql) => calls.push(sql) });
  assert.deepEqual(calls, schemaIndexStatements);
});

test("settlement state migration keeps the newest legacy snapshot and removes obsolete cache tables", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE snapshots (
      id INTEGER PRIMARY KEY,
      claim_id TEXT,
      captured_at TEXT,
      supplies REAL,
      treasury REAL,
      members_count INTEGER,
      buildings_count INTEGER,
      market_count INTEGER
    );
    CREATE TABLE current_claim_state (claim_id TEXT);
    INSERT INTO snapshots VALUES (1, '12345678', '2026-01-01T00:00:00.000Z', 1, 2, 3, 4, 5);
    INSERT INTO snapshots VALUES (2, '12345678', '2026-01-02T00:00:00.000Z', 6, 7, 8, 9, 10);
  `);
  applySettlementStateMigration(db);
  applyLegacySchemaCleanup(db);
  const state = db.prepare("SELECT * FROM settlement_state_current WHERE claim_id = '12345678'").get();
  assert.equal(state.supplies, 6);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'snapshots'").get(), undefined);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'current_claim_state'").get(), undefined);
  db.close();
});
