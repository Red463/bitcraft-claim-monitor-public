import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  marketViewLocation,
  settlementMarketViewLocation,
} from "../src/navigation/routeState.ts";
import { localHistoryIncludeForPanel } from "../src/api/localHistoryInclude.ts";

test("global Market canonicalizes current and legacy tool tabs", () => {
  assert.deepEqual(marketViewLocation(null), {
    page: "market",
    view: "overview",
    canonicalTab: "overview",
    shouldReplace: true,
  });
  assert.deepEqual(marketViewLocation("pricing"), {
    page: "market",
    view: "browse",
    canonicalTab: "browse",
    shouldReplace: true,
  });
  assert.deepEqual(marketViewLocation("buyOrders"), {
    page: "market",
    view: "buy-orders",
    canonicalTab: "buy-orders",
    shouldReplace: true,
  });
  assert.deepEqual(marketViewLocation("deal-watchlist"), {
    page: "market",
    view: "deal-watch",
    canonicalTab: "deal-watch",
    shouldReplace: true,
  });
});

test("legacy local Market tabs redirect to Settlement Market", () => {
  assert.deepEqual(marketViewLocation("live"), {
    page: "settlement-market",
    view: "live",
    canonicalTab: "live",
    shouldReplace: true,
  });
  assert.deepEqual(marketViewLocation("analytics"), {
    page: "settlement-market",
    view: "analytics",
    canonicalTab: "analytics",
    shouldReplace: true,
  });
  assert.deepEqual(settlementMarketViewLocation(null), {
    page: "settlement-market",
    view: "live",
    canonicalTab: "live",
    shouldReplace: true,
  });
});

test("only Settlement Market requests monitored market history", () => {
  assert.equal(localHistoryIncludeForPanel("market"), "activity");
  assert.equal(localHistoryIncludeForPanel("settlement-market"), "activity,market");
  assert.equal(localHistoryIncludeForPanel("dashboard"), "activity,market,dashboard");
});

test("global Market and browser-local Deal Watch use active regions", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  const dealWatch = readFileSync(new URL("../src/pages/market/DealWatchlist.tsx", import.meta.url), "utf8");
  assert.match(marketPage, /const activeRegions = useActiveRegions\(\);/);
  assert.match(dealWatch, /const activeRegions = useActiveRegions\(monitoredRegionId\);/);
  assert.match(dealWatch, /localStorage/);
  assert.doesNotMatch(marketPage, /useActiveRegions\(fallbackRegionId\)/);
  assert.doesNotMatch(dealWatch, /\/market\/deal-watches/);
});

test("all retained Market workspaces are public", () => {
  const marketPage = readFileSync(new URL("../src/pages/MarketPage.tsx", import.meta.url), "utf8");
  assert.match(marketPage, /const views = MARKET_VIEWS/);
  assert.doesNotMatch(marketPage, /effectiveTargetAllowed|EffectiveAccess|restricted-access/);
});
