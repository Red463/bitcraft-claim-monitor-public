import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  createClaimDirectoryRepository,
  refreshClaimDirectory,
} from "../src/server/claimDirectory.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";

function openDatabase() {
  const db = new DatabaseSync(":memory:");
  applySchemaBootstrap(db);
  return db;
}

test("claim directory search matches settlement names and numeric ids within a region", () => {
  const db = openDatabase();
  const repository = createClaimDirectoryRepository({
    db,
    now: () => "2026-07-27T12:00:00.000Z",
  });
  repository.replaceAll([
    { claimId: "101", name: "Oakheart", regionId: "7", regionName: "West", tier: 4, ownerName: "Ada" },
    { claimId: "202", name: "Ironhome", regionId: "8", regionName: "East", tier: 3, ownerName: "Bea" },
    { claimId: "1010", name: "Oakwatch", regionId: "7", regionName: "West", tier: 2, ownerName: null },
  ]);

  assert.deepEqual(repository.search({ query: "oak", regionId: "7", limit: 10 }).map((row) => row.claimId), ["101", "1010"]);
  assert.deepEqual(repository.search({ query: "202", limit: 10 }).map((row) => row.name), ["Ironhome"]);
  assert.deepEqual(repository.search({ query: "", regionId: "8", limit: 10 }).map((row) => row.claimId), ["202"]);
  db.close();
});

test("directory refresh keeps the last successful cache when an upstream refresh fails", async () => {
  const db = openDatabase();
  const repository = createClaimDirectoryRepository({
    db,
    now: () => "2026-07-27T12:00:00.000Z",
  });
  repository.replaceAll([{ claimId: "101", name: "Oakheart", regionId: "7", regionName: "West" }]);

  await assert.rejects(
    refreshClaimDirectory({
      repository,
      fetchJson: async () => {
        throw new Error("upstream unavailable");
      },
    }),
    /upstream unavailable/,
  );

  assert.equal(repository.get("101").name, "Oakheart");
  assert.equal(repository.status().claimCount, 1);
  assert.match(repository.status().lastError, /upstream unavailable/);
  db.close();
});

test("directory refresh keeps the last successful cache when BitJita returns an empty regions payload", async () => {
  const db = openDatabase();
  const repository = createClaimDirectoryRepository({
    db,
    now: () => "2026-07-27T12:00:00.000Z",
  });
  repository.replaceAll([{ claimId: "101", name: "Cached Claim", regionId: "19" }]);
  await assert.rejects(
    refreshClaimDirectory({ repository, fetchJson: async () => ({ regions: [] }) }),
    /cached claim directory retained/i,
  );
  assert.equal(repository.get("101")?.name, "Cached Claim");
  assert.match(repository.status().lastError, /no regions/i);
  db.close();
});

test("directory refresh walks every region and replaces stale rows atomically", async () => {
  const db = openDatabase();
  const repository = createClaimDirectoryRepository({
    db,
    now: () => "2026-07-27T12:00:00.000Z",
  });
  repository.replaceAll([{ claimId: "999", name: "Old", regionId: "1", regionName: "Old region" }]);
  const requested = [];
  const payloads = new Map([
    ["/regions", { regions: [{ id: 7, name: "West" }, { id: 8, name: "East" }] }],
    ["/claims?regionId=7&limit=100&page=1", { claims: [{ entityId: 101, name: "Oakheart", tier: 4, owner: { username: "Ada" } }] }],
    ["/claims?regionId=8&limit=100&page=1", { claims: [{ entityId: 202, name: "Ironhome", tier: 3 }] }],
  ]);

  const result = await refreshClaimDirectory({
    repository,
    fetchJson: async (path) => {
      requested.push(path);
      return payloads.get(path);
    },
  });

  assert.equal(result.claimCount, 2);
  assert.deepEqual(requested, [
    "/regions",
    "/claims?regionId=7&limit=100&page=1",
    "/claims?regionId=8&limit=100&page=1",
  ]);
  assert.equal(repository.get("999"), null);
  assert.deepEqual(repository.get("101"), {
    claimId: "101",
    name: "Oakheart",
    regionId: "7",
    regionName: "West",
    tier: 4,
    ownerName: "Ada",
    refreshedAt: "2026-07-27T12:00:00.000Z",
  });
  db.close();
});

test("directory refresh advances through BitJita claim pages", async () => {
  const db = openDatabase();
  const repository = createClaimDirectoryRepository({
    db,
    now: () => "2026-07-27T12:00:00.000Z",
  });
  const requested = [];
  const payloads = new Map([
    ["/regions", [{ regionId: 7, regionName: "West" }]],
    ["/claims?regionId=7&limit=2&page=1", { claims: [
      { entityId: 101, name: "Oakheart" },
      { entityId: 102, name: "Oakwatch" },
    ] }],
    ["/claims?regionId=7&limit=2&page=2", { claims: [
      { entityId: 103, name: "Oakrest" },
    ] }],
  ]);

  const result = await refreshClaimDirectory({
    repository,
    pageSize: 2,
    fetchJson: async (path) => {
      requested.push(path);
      return payloads.get(path);
    },
  });

  assert.equal(result.claimCount, 3);
  assert.deepEqual(requested, [
    "/regions",
    "/claims?regionId=7&limit=2&page=1",
    "/claims?regionId=7&limit=2&page=2",
  ]);
  db.close();
});

test("directory refresh rejects a repeated full claim page instead of looping", async () => {
  const db = openDatabase();
  const repository = createClaimDirectoryRepository({
    db,
    now: () => "2026-07-27T12:00:00.000Z",
  });
  let claimRequests = 0;

  await assert.rejects(
    refreshClaimDirectory({
      repository,
      pageSize: 2,
      fetchJson: async (path) => {
        if (path === "/regions") return [{ regionId: 7, regionName: "West" }];
        claimRequests += 1;
        if (claimRequests > 2) throw new Error("test stopped an unbounded pagination loop");
        return { claims: [
          { entityId: 101, name: "Oakheart" },
          { entityId: 102, name: "Oakwatch" },
        ] };
      },
    }),
    /repeated claim page/i,
  );

  assert.equal(claimRequests, 2);
  assert.match(repository.status().lastError, /repeated claim page/i);
  db.close();
});
