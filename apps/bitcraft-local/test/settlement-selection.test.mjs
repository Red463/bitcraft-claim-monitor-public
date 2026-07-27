import assert from "node:assert/strict";
import test from "node:test";

import {
  initialSettlementId,
  resetSettlementScopedPreferences,
  settlementShareHref,
  settlementStateKey,
} from "../src/settlements/settlementSelection.ts";

test("a valid shared URL settlement overrides the browser's saved settlement", () => {
  const storage = new Map([["claim-monitor.selectedSettlement", "101"]]);
  assert.equal(initialSettlementId({
    search: "?page=dashboard&claimId=202",
    readStorage: (key) => storage.get(key) ?? null,
  }), "202");
});

test("invalid shared and saved settlement ids produce the first-visit welcome state", () => {
  assert.equal(initialSettlementId({
    search: "?claimId=not-a-number",
    readStorage: () => "also-invalid",
  }), "");
});

test("settlement share links retain page state and replace the monitored claim", () => {
  assert.equal(
    settlementShareHref("https://claim-monitor.com/?page=planning&claimId=101#plan=abc", "202"),
    "/?page=planning&claimId=202#plan=abc",
  );
});

test("claim-scoped state keys cannot collide across settlements", () => {
  assert.equal(settlementStateKey("101", "market.watches"), "settlement.101.market.watches");
  assert.equal(settlementStateKey("202", "market.watches"), "settlement.202.market.watches");
});

test("switching settlements clears settlement filters without clearing global preferences", () => {
  const removed = [];
  resetSettlementScopedPreferences((key) => removed.push(key));
  assert.ok(removed.includes("claim-monitor.activity.member"));
  assert.ok(removed.includes("claim-monitor.map.players"));
  assert.ok(removed.includes("claim-monitor.market.member"));
  assert.ok(removed.includes("claim-monitor.public-crafts.region"));
  assert.ok(!removed.includes("claim-monitor.theme.local"));
  assert.ok(!removed.includes("claim-monitor.user.notifications"));
  assert.ok(!removed.includes("claim-monitor.globalMarket.region"));
});
