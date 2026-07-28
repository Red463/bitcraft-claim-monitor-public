import assert from "node:assert/strict";
import test from "node:test";

import {
  createClaimRosterEnrichment,
  enrichClaimPlayerDetails,
} from "../src/server/claimRosterEnrichment.mjs";

function roster(count) {
  return Array.from({ length: count }, (_, index) => ({
    playerEntityId: String(index + 1),
    userName: `Member ${index + 1}`,
  }));
}

test("player details return the full base roster while bounded enrichment progresses", async () => {
  const enrichment = createClaimRosterEnrichment();
  const members = roster(221);
  const loaded = [];
  let active = 0;
  let maximum = 0;
  const fetchPlayerDetail = async (playerId) => {
    loaded.push(playerId);
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return { entityId: playerId, username: `Enriched ${playerId}` };
  };
  const fallbackPlayer = (member) => ({
    entityId: member.playerEntityId,
    username: member.userName,
    detailAvailable: false,
  });

  const first = await enrichClaimPlayerDetails({
    claimId: "1369094286737286086",
    members,
    enrichment,
    fetchPlayerDetail,
    fallbackPlayer,
  });

  assert.equal(first.players.length, 221);
  assert.equal(loaded.length, 60);
  assert.ok(maximum <= 6);
  assert.equal(first.players.filter((player) => player.detailAvailable === true).length, 60);
  assert.equal(first.players.filter((player) => player.detailAvailable === false).length, 161);
  assert.deepEqual(first.coverage, {
    rosterTotal: 221,
    refreshedThisRequest: 60,
    covered: 60,
    pending: 161,
    failedThisRequest: 0,
    complete: false,
    nextCursor: "61",
  });

  const second = await enrichClaimPlayerDetails({
    claimId: "1369094286737286086",
    members,
    enrichment,
    fetchPlayerDetail,
    fallbackPlayer,
  });

  assert.equal(second.players.length, 221);
  assert.equal(second.players.filter((player) => player.detailAvailable === true).length, 120);
  assert.deepEqual(loaded.slice(60), members.slice(60, 120).map((member) => member.playerEntityId));
});

test("player detail failures keep fallback rows and bounded diagnostics", async () => {
  const members = roster(70);
  const result = await enrichClaimPlayerDetails({
    claimId: "claim-a",
    members,
    enrichment: createClaimRosterEnrichment({ failureLimit: 20 }),
    fetchPlayerDetail: async () => {
      throw new Error("upstream unavailable");
    },
    fallbackPlayer: (member) => ({
      entityId: member.playerEntityId,
      username: member.userName,
      detailAvailable: false,
    }),
    forceRefresh: true,
  });

  assert.equal(result.players.length, 70);
  assert.equal(result.failed, 60);
  assert.equal(result.failures.length, 20);
  assert.equal(result.players[0].detailAvailable, false);
  assert.equal(result.coverage.failedThisRequest, 60);
});
