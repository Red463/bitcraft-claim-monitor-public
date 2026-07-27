import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

async function exists(relativePath) {
  try {
    await access(new URL(relativePath, import.meta.url));
    return true;
  } catch {
    return false;
  }
}

test("removed feature styles are absent from the public application", async () => {
  for (const stylesheet of [
    "../src/styles/bot-dashboard.css",
    "../src/styles/discord-admin.css",
    "../src/styles/craftcalc.css",
    "../src/styles/sync.css",
  ]) {
    assert.equal(await exists(stylesheet), false, `${stylesheet} should be absent`);
  }
});

test("public feature pages retain route-owned stylesheets", async () => {
  const ownership = [
    ["../src/pages/DashboardPage.tsx", /styles\/dashboard\.css/],
    ["../src/pages/ProductionPage.tsx", /styles\/production\.css/],
    ["../src/pages/MarketPage.tsx", /styles\/market\.css/],
    ["../src/pages/EmpiresPage.tsx", /styles\/empires\.css/],
    ["../src/pages/MapPage.tsx", /styles\/map\.css/],
    ["../src/components/admin/AdminPanel.tsx", /styles\/admin\.css/],
  ];
  for (const [file, stylesheet] of ownership) {
    assert.match(await readFile(new URL(file, import.meta.url), "utf8"), stylesheet);
  }
});
