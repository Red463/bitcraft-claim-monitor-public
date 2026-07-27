export const defaultTheme = {
  bg: "#0c0d10",
  sidebar: "#06070a",
  panel: "#181b21",
  panel2: "#11141a",
  border: "#353b46",
  muted: "#a8adba",
  text: "#f6f3ea",
  gold: "#f0c64f",
  good: "#4ee28a",
  danger: "#ef6461",
};

export const obsoleteAppSettingKeys = [
  "analytics_json",
  "claim_id",
  "bitcraft_sync_url",
  "excluded_member_ids_json",
  "market_deal_watch_json",
  "discord_json",
  "discord_last_announced_version",
  "discord_last_supply_report_at",
  "discord_last_low_supplies_at",
  "discord_last_delivery_json",
  "access_control_json",
];

function settingRow(key, value, updatedAt) {
  return { key, value, updatedAt };
}

export function defaultAppSettingRows({ serverRefreshSeconds, updatedAt }) {
  return [
    settingRow("theme_json", JSON.stringify(defaultTheme), updatedAt),
    settingRow("refresh_seconds", "30", updatedAt),
    settingRow("server_refresh_seconds", String(serverRefreshSeconds), updatedAt),
    settingRow("collector_settings_json", JSON.stringify({}), updatedAt),
    settingRow("default_page", "dashboard", updatedAt),
    settingRow("default_region", "", updatedAt),
    settingRow("toast_json", JSON.stringify({ marketListings: true, marketSales: true, production: true }), updatedAt),
    settingRow("branding_json", JSON.stringify({}), updatedAt),
    settingRow("app_popups_json", JSON.stringify({ popups: [] }), updatedAt),
    settingRow("visitor_security_json", JSON.stringify({ fullIpRetentionDays: 7, statsRetentionDays: 180, geoipProvider: "ipapi", geoipCacheDays: 30, geoipSourceUrl: "", geoipAccountId: "", geoipLicenseKey: "" }), updatedAt),
    settingRow("history_retention_days", "90", updatedAt),
    settingRow("trade_retention_days", "365", updatedAt),
    settingRow("maintenance_mode", "0", updatedAt),
    settingRow("public_announcement", "", updatedAt),
    settingRow("public_page_flags_json", JSON.stringify({}), updatedAt),
  ];
}

export function applyDefaultAppSettings(db, {
  serverRefreshSeconds,
  updatedAt,
  rows = defaultAppSettingRows({ serverRefreshSeconds, updatedAt }),
  obsoleteKeys = obsoleteAppSettingKeys,
}) {
  const insertDefaultAppSetting = db.prepare("INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)");
  for (const row of rows) insertDefaultAppSetting.run(row.key, row.value, row.updatedAt);
  const deleteAppSetting = db.prepare("DELETE FROM app_settings WHERE key = ?");
  for (const key of obsoleteKeys) deleteAppSetting.run(key);
}
