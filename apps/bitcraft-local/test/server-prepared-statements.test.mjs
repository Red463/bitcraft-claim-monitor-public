import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createPreparedStatements } from "../src/server/preparedStatements.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import { applyAdditiveColumnMigrations } from "../src/server/schemaMigrations.mjs";

test("public database prepares settlement, market, plan-audit, admin, and operations statements", () => {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  applyAdditiveColumnMigrations(db);
  const statements = createPreparedStatements(db);

  for (const key of [
    "getSettlementState",
    "upsertSettlementState",
    "upsertListing",
    "insertMarketTrade",
    "insertActivity",
    "getSetting",
    "upsertSetting",
    "insertCraftPlanProgressSnapshot",
    "latestCraftPlanProgressSnapshot",
    "insertCraftPlanProgressEvent",
    "upsertCraftPlanProgressAuditState",
    "getCraftPlanProgressAuditState",
    "pruneCraftPlanProgressSnapshots",
    "pruneCraftPlanProgressEvents",
    "insertDiscordAdmin",
    "adminByDiscordId",
    "insertSession",
    "insertAudit",
  ]) {
    assert.ok(statements[key], `${key} should be prepared`);
  }
  assert.equal(Object.hasOwn(statements, "latestSnapshot"), false);
  assert.equal(Object.hasOwn(statements, "insertSnapshot"), false);
  db.close();
});
