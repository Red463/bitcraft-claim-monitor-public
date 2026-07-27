export const DEFAULT_APP_PAGE = "dashboard";

export const VALID_APP_PAGES = [
  "dashboard",
  "leaderboard",
  "members",
  "skills",
  "craft-monitor",
  "planning",
  "publiccrafts",
  "inventory",
  "construction",
  "research",
  "settlement-market",
  "market",
  "region",
  "empires",
  "map",
  "activity",
];

export function validAppPage(value) {
  return VALID_APP_PAGES.includes(value);
}

export function validClaimId(value) {
  return /^\d{8,}$/.test(String(value ?? "").trim());
}

export function validRefreshIntervalSeconds(value) {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= 15 && seconds <= 300;
}

export function validRegionId(value) {
  return /^\d+$/.test(String(value ?? "").trim());
}

export function parseRegionIds(value) {
  return String(value ?? "")
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => validRegionId(entry));
}

function finiteNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function clampNumberSetting(value, fallback, min, max) {
  const number = finiteNumber(value) || fallback;
  return Math.min(Math.max(number, min), max);
}

export function normalizeSavedRefreshIntervalSeconds(value, fallbackSeconds) {
  return clampNumberSetting(value, fallbackSeconds, 15, 300);
}
