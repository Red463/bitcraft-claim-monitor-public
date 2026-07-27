import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  CraftPlanConflictError,
  CraftPlanForbiddenError,
  createSharedCraftPlanRepository,
} from "../src/server/sharedCraftPlans.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";

function openRepository() {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  let sequence = 0;
  const repository = createSharedCraftPlanRepository({
    db,
    now: () => "2026-07-27T12:00:00.000Z",
    randomToken: (purpose) => `${purpose}-${++sequence}-abcdefghijklmnopqrstuvwxyz0123456789`,
  });
  return { db, repository };
}

test("anonymous plan creation returns the edit key once and lists only public plan data", () => {
  const { db, repository } = openRepository();
  const created = repository.create({
    claimId: "101",
    title: "Town hall",
    description: "Shared build order",
    config: { targets: [{ itemId: 12, quantity: 4 }] },
    creatorKey: "ip-hash",
  });

  assert.match(created.editKey, /^edit-/);
  assert.equal(created.plan.claimId, "101");
  assert.equal(created.plan.revision, 1);
  assert.equal("editKeyHash" in created.plan, false);
  assert.deepEqual(repository.list("101"), [created.plan]);
  assert.equal(repository.get(created.plan.planId).editKey, undefined);
  assert.equal(db.prepare("SELECT edit_key_hash FROM craft_plans WHERE plan_id = ?").get(created.plan.planId).edit_key_hash.length, 64);
  db.close();
});

test("plan updates require the private edit key and reject stale revisions", () => {
  const { db, repository } = openRepository();
  const created = repository.create({
    claimId: "101",
    title: "Town hall",
    config: { targets: [] },
    creatorKey: "ip-hash",
  });

  assert.throws(
    () => repository.update(created.plan.planId, { title: "Wrong key", expectedRevision: 1 }, { editKey: "not-the-key" }),
    CraftPlanForbiddenError,
  );
  const updated = repository.update(
    created.plan.planId,
    { title: "Town hall tier 2", description: "Bring stone", config: { targets: [1] }, expectedRevision: 1 },
    { editKey: created.editKey },
  );
  assert.equal(updated.revision, 2);
  assert.equal(updated.title, "Town hall tier 2");
  assert.throws(
    () => repository.update(created.plan.planId, { title: "Stale", expectedRevision: 1 }, { editKey: created.editKey }),
    CraftPlanConflictError,
  );
  db.close();
});

test("rotating a plan edit key invalidates the previous key and admin authority can archive it", () => {
  const { db, repository } = openRepository();
  const created = repository.create({
    claimId: "101",
    title: "Town hall",
    config: {},
    creatorKey: "ip-hash",
  });
  const rotated = repository.rotateKey(created.plan.planId, { editKey: created.editKey });

  assert.notEqual(rotated.editKey, created.editKey);
  assert.throws(
    () => repository.update(created.plan.planId, { title: "Old key", expectedRevision: 2 }, { editKey: created.editKey }),
    CraftPlanForbiddenError,
  );
  const archived = repository.archive(created.plan.planId, { admin: true });
  assert.equal(archived.archivedAt, "2026-07-27T12:00:00.000Z");
  assert.deepEqual(repository.list("101"), []);
  db.close();
});

test("plan creation enforces three plans per creator per hour and 25 active plans per settlement", () => {
  const { db, repository } = openRepository();
  for (let index = 1; index <= 3; index += 1) {
    repository.create({ claimId: "101", title: `Plan ${index}`, config: {}, creatorKey: "same-ip" });
  }
  assert.throws(
    () => repository.create({ claimId: "101", title: "Plan 4", config: {}, creatorKey: "same-ip" }),
    /three plans per hour/i,
  );

  for (let index = 4; index <= 25; index += 1) {
    repository.create({ claimId: "101", title: `Plan ${index}`, config: {}, creatorKey: `ip-${index}` });
  }
  assert.throws(
    () => repository.create({ claimId: "101", title: "Plan 26", config: {}, creatorKey: "new-ip" }),
    /25 active plans/i,
  );
  db.close();
});

test("administrators can resolve or dismiss public plan reports", () => {
  const { db, repository } = openRepository();
  const created = repository.create({ claimId: "101", title: "Review me", config: {}, creatorKey: "creator" });
  const first = repository.report(created.plan.planId, { reporterKey: "reporter-1", reason: "Incorrect targets" });
  const second = repository.report(created.plan.planId, { reporterKey: "reporter-2", reason: "Duplicate" });

  assert.equal(repository.reports().length, 2);
  assert.deepEqual(repository.resolveReport(first.reportId, { adminId: 7 }), {
    reportId: first.reportId,
    status: "resolved",
    resolvedAt: "2026-07-27T12:00:00.000Z",
    resolvedBy: 7,
  });
  assert.equal(repository.resolveReport(second.reportId, { adminId: 7, status: "dismissed" }).status, "dismissed");
  assert.deepEqual(repository.reports(), []);
  db.close();
});
