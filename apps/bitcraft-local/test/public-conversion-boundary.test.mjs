import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = (relativePath) => readFile(path.join(root, relativePath), "utf8");

async function missing(relativePath) {
  try {
    await access(path.join(root, relativePath));
    return false;
  } catch {
    return true;
  }
}

test("public navigation excludes removed account, bot, calculator, and sync surfaces", async () => {
  const navigation = await source("src/navigation.ts");
  const shell = await source("src/AppShell.tsx");

  for (const removedPage of ["bot", "craftcalc", "sync"]) {
    assert.doesNotMatch(navigation, new RegExp(`id:\\s*[\"']${removedPage}[\"']`));
    assert.doesNotMatch(shell, new RegExp(`case\\s+[\"']${removedPage}[\"']`));
  }
  assert.doesNotMatch(shell, /sidebar-account-card|Linked Accounts|Sign in with Discord/);
  assert.match(navigation, /Public Craft Finder/);
});

test("removed frontend feature modules are physically absent", async () => {
  const removedFiles = [
    "src/pages/CraftCalculatorPage.tsx",
    "src/pages/SyncPage.tsx",
    "src/components/settings/AccountDeletionDialog.tsx",
    "src/components/settings/PrivacyDataSection.tsx",
  ];
  for (const removedFile of removedFiles) {
    assert.equal(await missing(removedFile), true, `${removedFile} should be removed`);
  }
});

test("settlement selection is required, shareable, persistent, and always switchable", async () => {
  const shell = await source("src/AppShell.tsx");
  const selection = await source("src/settlements/settlementSelection.ts");
  const picker = await source("src/settlements/SettlementPicker.tsx");

  assert.match(shell, /mobile-settlement-switcher/);
  assert.match(shell, /settlement-switcher-button/);
  assert.match(shell, /mode=\{claimId \? "switch" : "welcome"\}/);
  assert.match(shell, /\/interest/);
  assert.match(selection, /claimId/);
  assert.match(selection, /readStorage/);
  assert.match(shell, /window\.localStorage/);
  assert.match(picker, /regionId/);
  assert.match(picker, /ownerName|owner/);
});

test("Empires is overview-only without Hexite or Watchtowers", async () => {
  const page = await source("src/pages/EmpiresPage.tsx");
  const dialog = await source("src/pages/empires/EmpireDetailsDialog.tsx");

  assert.match(page, /Regional empires/);
  assert.match(page, /EmpireDetailsDialog/);
  assert.doesNotMatch(page, /Hexite|Watchtower|watchtower/);
  assert.doesNotMatch(dialog, /Hexite|Watchtower|watchtower|towers/);
});

test("admin console is operations-focused and exposes public edition roles", async () => {
  const panel = await source("src/components/admin/AdminPanel.tsx");
  const permissions = await source("src/server/adminPermissions.mjs");

  for (const section of ["Active settlements", "Shared plans", "Retention", "Administrators", "Audit"]) {
    assert.match(panel, new RegExp(section, "i"));
  }
  assert.match(permissions, /owner/);
  assert.match(permissions, /admin/);
  assert.match(permissions, /viewer/);
  assert.doesNotMatch(panel, /Linked Accounts|Discord Bot|Hexite|Watchtower/);
});

test("server rejects every removed public or bot route before legacy dispatch", async () => {
  const server = await source("server.mjs");

  assert.match(server, /url\.pathname\.startsWith\(\"\/api\/local\/auth\/\"\)/);
  assert.match(server, /url\.pathname === \"\/api\/discord\/interactions\"/);
  assert.doesNotMatch(server, /url\.pathname === \"\/api\/local\/empires\/watchtowers\"/);
  assert.match(server, /url\.pathname\.startsWith\(\"\/api\/local\/admin\/discord\/\"\)/);
});
