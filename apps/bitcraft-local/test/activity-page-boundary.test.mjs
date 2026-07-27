import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const activityPage = readFileSync(new URL("../src/pages/ActivityPage.tsx", import.meta.url), "utf8");

test("Activity exposes every category without account access gates", () => {
  assert.match(activityPage, /const visibleActivityFilters = ACTIVITY_FILTERS/);
  assert.doesNotMatch(activityPage, /EffectiveAccess|effectiveTargetAllowed|restricted-access/);
});

test("Activity page lives outside the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const mainPages = existsSync(mainPagesUrl) ? readFileSync(mainPagesUrl, "utf8") : "";
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const activityPageUrl = new URL("../src/pages/ActivityPage.tsx", import.meta.url);

  assert.equal(existsSync(activityPageUrl), true);
  assert.doesNotMatch(mainPages, new RegExp("export function ActivityPanel\\b"));
  assert.match(appShell, /React\.lazy\(\(\) => import\("\.\/pages\/ActivityPage"\)/);
});

test("Activity overview and labelled filters stack on phones", () => {
  const css = readFileSync(new URL("../src/styles/activity.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.activity-overview,\s*\.activity-filter-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*\.activity-command-head\s*\{[^}]*align-items:\s*flex-start[^}]*flex-direction:\s*column/s);
});
