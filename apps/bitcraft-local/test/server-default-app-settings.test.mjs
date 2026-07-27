import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDefaultAppSettings,
  defaultAppSettingRows,
  defaultTheme,
  obsoleteAppSettingKeys,
} from "../src/server/defaultAppSettings.mjs";

test("default app settings contain only public runtime and operator controls", () => {
  const rows = defaultAppSettingRows({
    serverRefreshSeconds: 45,
    updatedAt: "2026-07-27T12:00:00.000Z",
  });
  const keys = rows.map((row) => row.key);

  assert.deepEqual(keys, [
    "theme_json",
    "refresh_seconds",
    "server_refresh_seconds",
    "collector_settings_json",
    "default_page",
    "default_region",
    "toast_json",
    "branding_json",
    "app_popups_json",
    "visitor_security_json",
    "history_retention_days",
    "trade_retention_days",
    "maintenance_mode",
    "public_announcement",
    "public_page_flags_json",
  ]);
  assert.equal(rows.every((row) => row.updatedAt === "2026-07-27T12:00:00.000Z"), true);
  assert.equal(rows.find((row) => row.key === "theme_json")?.value, JSON.stringify(defaultTheme));
  assert.equal(rows.find((row) => row.key === "server_refresh_seconds")?.value, "45");
  assert.equal(keys.some((key) => /claim|sync|excluded|discord|access_control|deal_watch/.test(key)), false);
});

test("removed installation and account settings are actively cleaned up", () => {
  assert.equal(obsoleteAppSettingKeys.includes("claim_id"), true);
  assert.equal(obsoleteAppSettingKeys.includes("bitcraft_sync_url"), true);
  assert.equal(obsoleteAppSettingKeys.includes("excluded_member_ids_json"), true);
  assert.equal(obsoleteAppSettingKeys.includes("market_deal_watch_json"), true);
  assert.equal(obsoleteAppSettingKeys.includes("discord_json"), true);
  assert.equal(obsoleteAppSettingKeys.includes("access_control_json"), true);
});

test("applyDefaultAppSettings inserts defaults and removes obsolete settings", () => {
  const inserted = [];
  const deleted = [];
  const db = {
    prepare(sql) {
      if (sql.startsWith("INSERT")) return { run: (...args) => inserted.push(args) };
      if (sql.startsWith("DELETE")) return { run: (...args) => deleted.push(args) };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  applyDefaultAppSettings(db, {
    serverRefreshSeconds: 75,
    updatedAt: "2026-07-27T12:45:00.000Z",
  });

  assert.equal(inserted.length, 15);
  assert.deepEqual(inserted.find(([key]) => key === "server_refresh_seconds"), ["server_refresh_seconds", "75", "2026-07-27T12:45:00.000Z"]);
  assert.deepEqual(deleted, obsoleteAppSettingKeys.map((key) => [key]));
});
