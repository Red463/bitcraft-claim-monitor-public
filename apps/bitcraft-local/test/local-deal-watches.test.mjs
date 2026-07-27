import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateDealWatch,
  marketWatchStorageKey,
  normalizeLocalDealWatches,
  upsertLocalDealWatch,
} from "../src/market/localDealWatches.ts";

test("market watches are namespaced by settlement", () => {
  assert.equal(marketWatchStorageKey("101"), "claim-monitor.settlement.101.marketWatches");
  assert.notEqual(marketWatchStorageKey("101"), marketWatchStorageKey("202"));
});

test("local watches are bounded, normalized, and replaced by item-region identity", () => {
  const first = upsertLocalDealWatch([], { regionId: "7", itemId: "9", itemType: 0, itemName: "Iron", thresholdPercent: 30 });
  const replaced = upsertLocalDealWatch(first, { regionId: "7", itemId: "9", itemType: 0, itemName: "Iron Ore", thresholdPercent: 40 });
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].itemName, "Iron Ore");
  assert.equal(replaced[0].thresholdPercent, 40);
  assert.equal(normalizeLocalDealWatches(new Array(120).fill(first[0])).length, 50);
});

test("watch evaluation alerts only below the configured confirmed-trade average", () => {
  const watch = { thresholdPercent: 25 };
  assert.equal(evaluateDealWatch(watch, { averagePrice: 100, lowestListingPrice: 74 }).triggered, true);
  assert.equal(evaluateDealWatch(watch, { averagePrice: 100, lowestListingPrice: 75 }).triggered, false);
  assert.equal(evaluateDealWatch(watch, { averagePrice: 0, lowestListingPrice: 1 }).triggered, false);
});
