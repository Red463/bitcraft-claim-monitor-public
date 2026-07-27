import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  collectActiveClaims,
  createActiveClaimRepository,
} from "../src/server/activeClaims.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";

function openDatabase() {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  return db;
}

test("active claim selection expires old heartbeats and rotates least-recently collected claims first", () => {
  const db = openDatabase();
  let now = Date.parse("2026-07-27T12:00:00.000Z");
  const repository = createActiveClaimRepository({ db, now: () => new Date(now).toISOString() });
  repository.registerInterest("101");
  repository.registerInterest("202");
  repository.recordSuccess("202", "2026-07-27T11:59:00.000Z");

  assert.deepEqual(repository.active({ limit: 25 }).map((row) => row.claimId), ["101", "202"]);

  now += 16 * 60 * 1000;
  repository.registerInterest("202");
  assert.deepEqual(repository.active({ limit: 25 }).map((row) => row.claimId), ["202"]);
  db.close();
});

test("active claim collection isolates failures and never exceeds configured concurrency", async () => {
  let running = 0;
  let maximumRunning = 0;
  const successes = [];
  const failures = [];
  const result = await collectActiveClaims({
    claims: ["101", "202", "303", "404"].map((claimId) => ({ claimId })),
    concurrency: 2,
    collect: async (claimId) => {
      running += 1;
      maximumRunning = Math.max(maximumRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      if (claimId === "202") throw new Error("HTTP 503");
      return { claimId };
    },
    onSuccess: (claimId) => successes.push(claimId),
    onFailure: (claimId, error) => failures.push([claimId, error.message]),
  });

  assert.equal(maximumRunning, 2);
  assert.deepEqual(successes, ["101", "303", "404"]);
  assert.deepEqual(failures, [["202", "HTTP 503"]]);
  assert.deepEqual(result, { attempted: 4, succeeded: 3, failed: 1 });
});

test("active claim ceiling bounds work without dropping stored interest", () => {
  const db = openDatabase();
  const repository = createActiveClaimRepository({
    db,
    now: () => "2026-07-27T12:00:00.000Z",
  });
  for (let index = 1; index <= 30; index += 1) repository.registerInterest(String(index));

  assert.equal(repository.active({ limit: 25 }).length, 25);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM monitored_claims").get().count, 30);
  db.close();
});
