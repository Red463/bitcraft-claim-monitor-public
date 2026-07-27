import { DEFAULT_THEME } from "./theme";
import type { AppSettings } from "./types/settings";
export { DEFAULT_USER_TOAST_SETTINGS } from "./notifications/userToastSettings";

export const DEFAULT_COLLECTOR_SETTINGS: AppSettings["collectorSettings"] = {
  claim: { label: "Claim", enabled: true, intervalSeconds: 30 },
  members: { label: "Members", enabled: true, intervalSeconds: 30 },
  players: { label: "Player details", enabled: true, intervalSeconds: 60 },
  professions: { label: "Professions", enabled: true, intervalSeconds: 30 },
  production: { label: "Production", enabled: true, intervalSeconds: 30 },
  inventory: { label: "Inventory and storage", enabled: true, intervalSeconds: 60 },
  construction: { label: "Construction", enabled: true, intervalSeconds: 60 },
  research: { label: "Research", enabled: true, intervalSeconds: 600 },
  market: { label: "Market", enabled: true, intervalSeconds: 60 },
  region: { label: "Region", enabled: true, intervalSeconds: 300 },
  mapCatalog: { label: "Map/catalog", enabled: true, intervalSeconds: 600 },
  marketListings: { label: "Market listing sync", enabled: true, intervalSeconds: 60 },
  productionContributions: { label: "Production contribution sync", enabled: true, intervalSeconds: 300 },
  storageActivity: { label: "Storage activity", enabled: true, intervalSeconds: 60 },
  marketTrades: { label: "Member market trades", enabled: true, intervalSeconds: 60 },
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: DEFAULT_THEME,
  refreshSeconds: 30,
  serverRefreshSeconds: 30,
  collectorSettings: DEFAULT_COLLECTOR_SETTINGS,
  defaultPage: "dashboard",
  defaultRegion: "",
  toastSettings: { marketListings: true, marketSales: true, production: true },
  branding: {},
  visitorSecurity: {
    fullIpRetentionDays: 7,
    statsRetentionDays: 180,
    geoipProvider: "ipapi",
    geoipCacheDays: 30,
    geoipSourceUrl: "",
    geoipAccountId: "",
    geoipLicenseKey: "",
    geoipLicenseKeyConfigured: false,
  },
  browserSnapshotsEnabled: true,
  historyRetentionDays: 90,
  tradeRetentionDays: 365,
  maintenanceMode: false,
  announcement: "",
  pageFlags: {},
};
