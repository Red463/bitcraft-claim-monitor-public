import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { publicRetentionCutoffs, runPublicRetention } from "../src/server/publicRetention.mjs";

test("public retention defaults to 90-day history and 365-day confirmed trades", () => {
  const cutoffs = publicRetentionCutoffs({ now: new Date("2026-07-27T12:00:00.000Z") });
  assert.equal(cutoffs.historyCutoff, "2026-04-28T12:00:00.000Z");
  assert.equal(cutoffs.tradeCutoff, "2025-07-27T12:00:00.000Z");
});

test("public retention prunes history and confirmed trades without touching current state", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE activity_events (occurred_at TEXT NOT NULL);
    CREATE TABLE market_events (occurred_at TEXT NOT NULL);
    CREATE TABLE global_market_price_snapshots (captured_at TEXT NOT NULL);
    CREATE TABLE market_trades (occurred_at TEXT NOT NULL);
    CREATE TABLE domain_payloads (collected_at TEXT NOT NULL);
  `);
  const oldHistory = "2026-01-01T00:00:00.000Z";
  const oldTrade = "2025-01-01T00:00:00.000Z";
  const recent = "2026-07-01T00:00:00.000Z";
  for (const table of ["activity_events", "market_events"]) {
    db.prepare(`INSERT INTO ${table} VALUES (?)`).run(oldHistory);
    db.prepare(`INSERT INTO ${table} VALUES (?)`).run(recent);
  }
  db.prepare("INSERT INTO global_market_price_snapshots VALUES (?)").run(oldHistory);
  db.prepare("INSERT INTO global_market_price_snapshots VALUES (?)").run(recent);
  db.prepare("INSERT INTO market_trades VALUES (?)").run(oldTrade);
  db.prepare("INSERT INTO market_trades VALUES (?)").run(recent);
  db.prepare("INSERT INTO domain_payloads VALUES (?)").run(oldHistory);

  const result = runPublicRetention(db, { now: new Date("2026-07-27T12:00:00.000Z") });

  assert.deepEqual(result.deleted, {
    activityEvents: 1,
    marketEvents: 1,
    marketSnapshots: 1,
    marketTrades: 1,
  });
  assert.equal(db.prepare("SELECT COUNT(*) count FROM activity_events").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM market_trades").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM domain_payloads").get().count, 1);
  db.close();
});
