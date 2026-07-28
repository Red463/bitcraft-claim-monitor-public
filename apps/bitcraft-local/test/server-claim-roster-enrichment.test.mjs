import assert from "node:assert/strict";
import test from "node:test";

import {
  createClaimRosterEnrichment,
  uniqueClaimMembers,
} from "../src/server/claimRosterEnrichment.mjs";

function roster(count, prefix = "player") {
  return Array.from({ length: count }, (_, index) => ({
    playerEntityId: `${prefix}-${index + 1}`,
    userName: `${prefix} ${index + 1}`,
  }));
}

test("uniqueClaimMembers keeps stable first-seen player identity", () => {
  const first = { playerEntityId: "1", userName: "First" };
  assert.deepEqual(uniqueClaimMembers([
    first,
    { entityId: "2", userName: "Second" },
    { playerEntityId: "1", userName: "Duplicate" },
    null,
    { userName: "Missing ID" },
  ]), [
    first,
    { entityId: "2", userName: "Second" },
  ]);
});

test("rotating batches cover all 221 members without first-N starvation", async () => {
  const enrichment = createClaimRosterEnrichment();
  const members = roster(221);
  const refreshed = [];
  const batchSizes = [];

  for (let call = 0; call < 4; call += 1) {
    const result = await enrichment.runBatch({
      claimId: "ba-sing-se",
      family: "player-details",
      members,
      batchSize: 60,
      concurrency: 6,
      maxAgeMs: 5 * 60_000,
      loadMember: async (member) => {
        refreshed.push(member.playerEntityId);
        return { id: member.playerEntityId };
      },
      fallback: (member) => ({ id: member.playerEntityId, fallback: true }),
    });
    batchSizes.push(result.coverage.refreshedThisRequest);
  }

  assert.deepEqual(batchSizes, [60, 60, 60, 41]);
  assert.equal(new Set(refreshed).size, 221);
  assert.deepEqual(refreshed, members.map((member) => member.playerEntityId));

  const wrapped = [];
  const result = await enrichment.runBatch({
    claimId: "ba-sing-se",
    family: "player-details",
    members,
    batchSize: 60,
    concurrency: 6,
    maxAgeMs: 5 * 60_000,
    loadMember: async (member) => {
      wrapped.push(member.playerEntityId);
      return { id: member.playerEntityId };
    },
    fallback: (member) => ({ id: member.playerEntityId, fallback: true }),
  });
  assert.deepEqual(wrapped, members.slice(0, 60).map((member) => member.playerEntityId));
  assert.equal(result.coverage.nextCursor, members[60].playerEntityId);
});

test("claim and family cursors and caches are independent", async () => {
  const enrichment = createClaimRosterEnrichment();
  const members = roster(3);
  const calls = [];
  const run = (claimId, family) => enrichment.runBatch({
    claimId,
    family,
    members,
    batchSize: 1,
    concurrency: 1,
    maxAgeMs: 1_000,
    loadMember: async (member) => {
      calls.push(`${claimId}:${family}:${member.playerEntityId}`);
      return { source: `${claimId}:${family}` };
    },
    fallback: () => ({ fallback: true }),
  });

  await run("claim-a", "players");
  await run("claim-a", "players");
  await run("claim-a", "crafts");
  await run("claim-b", "players");

  assert.deepEqual(calls, [
    "claim-a:players:player-1",
    "claim-a:players:player-2",
    "claim-a:crafts:player-1",
    "claim-b:players:player-1",
  ]);
});

test("entries merge fresh, stale, fallback, and failed member states", async () => {
  let clock = 1_000;
  const enrichment = createClaimRosterEnrichment({ now: () => clock });
  const members = roster(3);
  const fallback = (member) => ({ id: member.playerEntityId, fallback: true });

  const first = await enrichment.runBatch({
    claimId: "claim-a",
    family: "players",
    members,
    batchSize: 1,
    concurrency: 1,
    maxAgeMs: 500,
    loadMember: async (member) => ({ id: member.playerEntityId, enriched: true }),
    fallback,
  });
  assert.deepEqual(first.entries.map((entry) => entry.state), ["fresh", "fallback", "fallback"]);
  assert.deepEqual(first.coverage, {
    rosterTotal: 3,
    refreshedThisRequest: 1,
    covered: 1,
    pending: 2,
    failedThisRequest: 0,
    complete: false,
    nextCursor: "player-2",
  });

  clock = 1_600;
  const second = await enrichment.runBatch({
    claimId: "claim-a",
    family: "players",
    members,
    batchSize: 1,
    concurrency: 1,
    maxAgeMs: 500,
    loadMember: async (member) => ({ id: member.playerEntityId, enriched: true }),
    fallback,
  });
  assert.deepEqual(second.entries.map((entry) => entry.state), ["stale", "fresh", "fallback"]);

  await enrichment.runBatch({
    claimId: "claim-a",
    family: "players",
    members,
    batchSize: 1,
    concurrency: 1,
    maxAgeMs: 500,
    loadMember: async (member) => ({ id: member.playerEntityId, enriched: true }),
    fallback,
  });
  const failed = await enrichment.runBatch({
    claimId: "claim-a",
    family: "players",
    members,
    batchSize: 1,
    concurrency: 1,
    maxAgeMs: 500,
    loadMember: async () => {
      throw new Error("temporary upstream failure");
    },
    fallback,
  });

  assert.equal(failed.entries[0].value.enriched, true);
  assert.equal(failed.coverage.covered, 3);
  assert.equal(failed.coverage.failedThisRequest, 1);
  assert.deepEqual(failed.failures, [{ playerId: "player-1", error: "temporary upstream failure" }]);
});

test("failure arrays are bounded and concurrency never exceeds the requested limit", async () => {
  const enrichment = createClaimRosterEnrichment({ failureLimit: 3 });
  let active = 0;
  let maximum = 0;
  const result = await enrichment.runBatch({
    claimId: "claim-a",
    family: "players",
    members: roster(12),
    batchSize: 10,
    concurrency: 4,
    maxAgeMs: 1_000,
    forceRefresh: true,
    loadMember: async (_member, options) => {
      assert.equal(options.forceRefresh, true);
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      throw new Error("failed");
    },
    fallback: (member) => ({ id: member.playerEntityId }),
  });

  assert.equal(result.coverage.refreshedThisRequest, 10);
  assert.equal(result.coverage.failedThisRequest, 10);
  assert.equal(result.failures.length, 3);
  assert.ok(maximum <= 4);
});

test("force refresh remains bounded to the selected rotating batch", async () => {
  const enrichment = createClaimRosterEnrichment();
  const refreshed = [];
  const result = await enrichment.runBatch({
    claimId: "claim-a",
    family: "players",
    members: roster(20),
    batchSize: 5,
    concurrency: 2,
    maxAgeMs: 1_000,
    forceRefresh: true,
    loadMember: async (member) => {
      refreshed.push(member.playerEntityId);
      return member;
    },
    fallback: (member) => member,
  });

  assert.equal(refreshed.length, 5);
  assert.equal(result.coverage.refreshedThisRequest, 5);
});
