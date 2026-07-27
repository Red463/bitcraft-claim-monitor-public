import { DEFAULT_COLLECTOR_SETTINGS, DEFAULT_SETTINGS } from "../settingsDefaults";
import { toNumber, type AnyRecord } from "../main-app-data";
import { normalizeThemeCandidate } from "../theme";
import type { AppSettings, BrandingAsset } from "../types/settings";
import type { ActivePanel } from "../types/app";

const PUBLIC_DEFAULT_PAGES = new Set<ActivePanel>([
  "dashboard",
  "leaderboard",
  "members",
  "skills",
  "craft-monitor",
  "planning",
  "inventory",
  "construction",
  "research",
  "settlement-market",
  "market",
  "region",
  "empires",
  "map",
  "activity",
  "publiccrafts",
]);

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = toNumber(value);
  return Math.min(Math.max(parsed || fallback, min), max);
}

function brandingAsset(value: unknown): BrandingAsset | undefined {
  const asset = value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : null;
  if (!asset?.url) return undefined;
  return {
    fileName: String(asset.fileName ?? ""),
    contentType: String(asset.contentType ?? "application/octet-stream"),
    updatedAt: String(asset.updatedAt ?? ""),
    url: String(asset.url),
  };
}

function publicPageFlags(value: unknown): AppSettings["pageFlags"] {
  const flags = value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
  return Object.fromEntries(
    Object.entries(flags)
      .filter(([page, enabled]) => PUBLIC_DEFAULT_PAGES.has(page as ActivePanel) && typeof enabled === "boolean"),
  ) as AppSettings["pageFlags"];
}

export function normalizeAppSettings(config: Partial<AppSettings> | AnyRecord | null | undefined): AppSettings {
  const raw = config && typeof config === "object" && !Array.isArray(config) ? config as AnyRecord : {};
  const configuredPage = String(raw.defaultPage ?? DEFAULT_SETTINGS.defaultPage) as ActivePanel;
  const defaultPage = PUBLIC_DEFAULT_PAGES.has(configuredPage) ? configuredPage : DEFAULT_SETTINGS.defaultPage;
  const normalizedTheme = normalizeThemeCandidate(raw.theme)?.theme ?? DEFAULT_SETTINGS.theme;
  const collectorSource = raw.collectorSettings && typeof raw.collectorSettings === "object" ? raw.collectorSettings as AnyRecord : {};

  return {
    ...DEFAULT_SETTINGS,
    theme: normalizedTheme,
    refreshSeconds: boundedNumber(raw.refreshSeconds, DEFAULT_SETTINGS.refreshSeconds, 15, 300),
    serverRefreshSeconds: boundedNumber(raw.serverRefreshSeconds ?? raw.refreshSeconds, DEFAULT_SETTINGS.serverRefreshSeconds, 15, 300),
    collectorSettings: Object.fromEntries(Object.entries(DEFAULT_COLLECTOR_SETTINGS).map(([key, defaults]) => {
      const saved = collectorSource[key] && typeof collectorSource[key] === "object" ? collectorSource[key] as AnyRecord : {};
      return [key, {
        ...defaults,
        enabled: saved.enabled !== false,
        intervalSeconds: boundedNumber(saved.intervalSeconds, defaults.intervalSeconds, 15, 86_400),
      }];
    })),
    defaultPage,
    defaultRegion: /^\d+$/.test(String(raw.defaultRegion ?? "").trim()) ? String(raw.defaultRegion).trim() : "",
    toastSettings: {
      marketListings: raw.toastSettings?.marketListings !== false,
      marketSales: raw.toastSettings?.marketSales !== false,
      production: raw.toastSettings?.production !== false,
    },
    branding: {
      logo: brandingAsset(raw.branding?.logo),
      favicon: brandingAsset(raw.branding?.favicon),
    },
    visitorSecurity: {
      ...DEFAULT_SETTINGS.visitorSecurity,
      ...(raw.visitorSecurity ?? {}),
      fullIpRetentionDays: boundedNumber(raw.visitorSecurity?.fullIpRetentionDays, DEFAULT_SETTINGS.visitorSecurity.fullIpRetentionDays, 1, 30),
      statsRetentionDays: boundedNumber(raw.visitorSecurity?.statsRetentionDays, DEFAULT_SETTINGS.visitorSecurity.statsRetentionDays, 30, 730),
      geoipCacheDays: boundedNumber(raw.visitorSecurity?.geoipCacheDays, DEFAULT_SETTINGS.visitorSecurity.geoipCacheDays, 1, 90),
    },
    browserSnapshotsEnabled: raw.browserSnapshotsEnabled !== false,
    historyRetentionDays: boundedNumber(raw.historyRetentionDays, DEFAULT_SETTINGS.historyRetentionDays, 7, 730),
    tradeRetentionDays: boundedNumber(raw.tradeRetentionDays, DEFAULT_SETTINGS.tradeRetentionDays, 30, 1460),
    maintenanceMode: raw.maintenanceMode === true,
    announcement: String(raw.announcement ?? "").trim().slice(0, 2_000),
    pageFlags: publicPageFlags(raw.pageFlags),
  };
}
