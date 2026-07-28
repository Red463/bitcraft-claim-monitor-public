import assert from "node:assert/strict";
import test from "node:test";

import {
  createClaimRosterEnrichment,
  enrichClaimPassiveCrafts,
  enrichClaimProductionCrafts,
} from "../src/server/claimRosterEnrichment.mjs";

function roster(count) {
  return Array.from({ length: count }, (_, index) => ({
    playerEntityId: String(index + 1),
    userName: `Member ${index + 1}`,
  }));
}

function craft(entityId, claimId, extra = {}) {
  return { entityId, claimEntityId: claimId, totalActionsRequired: 10, ...extra };
}

test("production returns public crafts immediately and bounds member fan-out", async () => {
  const members = roster(221);
  let active = 0;
  let maximum = 0;
  let requested = 0;
  const result = await enrichClaimProductionCrafts({
    claimId: "claim-a",
    members,
    publicPayload: { craftResults: [craft("public-1", "claim-a", { isPublic: true })] },
    enrichment: createClaimRosterEnrichment(),
    fetchMemberCrafts: async () => {
      requested += 1;
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      throw new Error("private crafts unavailable");
    },
  });

  assert.deepEqual(result.craftResults.map((entry) => entry.entityId), ["public-1"]);
  assert.equal(requested, 50);
  assert.ok(maximum <= 8);
  assert.equal(result.coverage.rosterTotal, 221);
  assert.equal(result.coverage.refreshedThisRequest, 50);
  assert.equal(result.coverage.failedThisRequest, 50);
});

test("production accumulates member crafts and catalogs across fair batches", async () => {
  const members = roster(221);
  const enrichment = createClaimRosterEnrichment();
  const seen = [];
  const fetchMemberCrafts = async (playerId) => {
    seen.push(playerId);
    return {
      craftResults: [
        craft(`private-${playerId}`, "claim-a", { isPublic: false }),
        craft(`foreign-${playerId}`, "claim-b", { isPublic: false }),
      ],
      items: [{ id: `item-${playerId}` }],
      cargos: [{ id: `cargo-${playerId}` }],
      claims: [{ id: `catalog-claim-${playerId}` }],
    };
  };
  let result;
  const covered = [];

  for (let call = 0; call < 5; call += 1) {
    result = await enrichClaimProductionCrafts({
      claimId: "claim-a",
      members,
      publicPayload: {
        craftResults: [
          craft("public-1", "claim-a", { isPublic: true }),
          craft("duplicate", "claim-a", { isPublic: true, progress: 1 }),
        ],
        items: [{ id: "public-item" }],
        cargos: [],
        claims: [],
      },
      enrichment,
      fetchMemberCrafts: async (playerId, options) => {
        const payload = await fetchMemberCrafts(playerId, options);
        if (playerId === "51") {
          payload.craftResults.push(craft("duplicate", "claim-a", { progress: 9 }));
        }
        return payload;
      },
    });
    covered.push(result.coverage.covered);
  }

  assert.deepEqual(covered, [50, 100, 150, 200, 221]);
  assert.equal(new Set(seen).size, 221);
  assert.equal(result.craftResults.filter((entry) => entry.entityId.startsWith("foreign-")).length, 0);
  assert.equal(result.craftResults.filter((entry) => entry.entityId.startsWith("private-")).length, 221);
  assert.equal(result.craftResults.filter((entry) => entry.entityId === "duplicate").length, 1);
  assert.equal(result.craftResults.find((entry) => entry.entityId === "duplicate").isPublic, true);
  assert.equal(result.craftResults.find((entry) => entry.entityId === "duplicate").progress, 9);
  assert.equal(result.items.length, 222);
  assert.equal(result.cargos.length, 221);
  assert.equal(result.claims.length, 221);
});

test("manual production refresh remains bounded to one 50-member batch", async () => {
  let requested = 0;
  const result = await enrichClaimProductionCrafts({
    claimId: "claim-a",
    members: roster(221),
    publicPayload: { craftResults: [] },
    enrichment: createClaimRosterEnrichment(),
    forceRefresh: true,
    fetchMemberCrafts: async (_playerId, options) => {
      assert.equal(options.forceRefresh, true);
      requested += 1;
      return { craftResults: [] };
    },
  });

  assert.equal(requested, 50);
  assert.equal(result.coverage.refreshedThisRequest, 50);
});

test("passive crafts accumulate, retain prior rows, sort newest first, and cap at 18", async () => {
  const enrichment = createClaimRosterEnrichment();
  const members = roster(100);
  const fetchPassiveCrafts = async (playerId) => ({
    ok: true,
    playerId,
    memberName: `Member ${playerId}`,
    rows: [{
      recipe: `Recipe ${playerId}`,
      sortTimestamp: Number(playerId),
      timestamp: Number(playerId),
    }],
  });

  const first = await enrichClaimPassiveCrafts({
    claimId: "claim-a",
    members,
    enrichment,
    fetchPassiveCrafts,
  });
  const second = await enrichClaimPassiveCrafts({
    claimId: "claim-a",
    members,
    enrichment,
    fetchPassiveCrafts,
  });

  assert.equal(first.coverage.covered, 50);
  assert.equal(second.coverage.covered, 100);
  assert.equal(second.rows.length, 18);
  assert.deepEqual(second.rows.map((row) => row.playerId), roster(18).map((_, index) => String(100 - index)));
});

test("passive failures retain cached rows and use independent coverage", async () => {
  const enrichment = createClaimRosterEnrichment();
  const members = roster(50);
  const success = await enrichClaimPassiveCrafts({
    claimId: "claim-a",
    members,
    enrichment,
    fetchPassiveCrafts: async (playerId) => ({
      ok: true,
      playerId,
      memberName: `Member ${playerId}`,
      rows: [{ recipe: `Recipe ${playerId}`, sortTimestamp: Number(playerId) }],
    }),
  });
  const failed = await enrichClaimPassiveCrafts({
    claimId: "claim-a",
    members,
    enrichment,
    forceRefresh: true,
    fetchPassiveCrafts: async () => {
      throw new Error("temporary failure");
    },
  });

  assert.equal(success.coverage.complete, true);
  assert.equal(failed.coverage.failedThisRequest, 50);
  assert.equal(failed.coverage.covered, 50);
  assert.equal(failed.rows.length, 18);

  const production = await enrichClaimProductionCrafts({
    claimId: "claim-a",
    members,
    publicPayload: { craftResults: [] },
    enrichment,
    fetchMemberCrafts: async () => ({ craftResults: [] }),
  });
  assert.equal(production.coverage.refreshedThisRequest, 50);
});
