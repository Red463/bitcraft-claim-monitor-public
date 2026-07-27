import type { ThemeSettings } from "../theme";
import type { ActivePanel } from "./app";

export type BrandingAsset = {
  fileName: string;
  contentType: string;
  updatedAt: string;
  url: string;
};

export type NotificationSoundId =
  | "soft-chime" | "clear-ping" | "deep-bell" | "alert-pop" | "bright-ping"
  | "double-ping" | "coin-ding" | "coin-jingle" | "success-chime"
  | "warning-blip" | "soft-bell" | "urgent-pulse" | "crystal-tap"
  | "low-thud" | "arcade-beep" | "reverse-chime" | "ui-pop"
  | "ui-pack-pop" | "coin-clink-4" | "coin-clink-8" | "coin-clink-9"
  | "ui-blip" | "new-notification-1" | "notification-bell" | "confirm-tap"
  | "happy-pop" | "drop-coin" | "simple-ping" | "cash-register" | "plopp"
  | "interface-click" | "bubble-pop-soft" | "bubble-pop"
  | "notification-010" | "notification-035" | "notification-040"
  | "notification-047" | "notification-062" | "notification-beep";

export type NotificationSoundType =
  | "marketListings"
  | "marketSales"
  | "dealAlerts"
  | "productionStarted"
  | "productionCompleted";

export type UserToastSettings = {
  marketListings: boolean;
  marketSales: boolean;
  production: boolean;
  soundEnabled: boolean;
  soundId: NotificationSoundId;
  soundVolume: number;
  soundByType: Partial<Record<NotificationSoundType, NotificationSoundId>>;
};

export type AppSettings = {
  theme: ThemeSettings;
  refreshSeconds: number;
  serverRefreshSeconds: number;
  collectorSettings: Record<string, { label: string; enabled: boolean; intervalSeconds: number }>;
  defaultPage: ActivePanel;
  defaultRegion: string;
  toastSettings: { marketListings: boolean; marketSales: boolean; production: boolean };
  branding: { logo?: BrandingAsset; favicon?: BrandingAsset };
  visitorSecurity: {
    fullIpRetentionDays: number;
    statsRetentionDays: number;
    geoipProvider: string;
    geoipCacheDays: number;
    geoipSourceUrl: string;
    geoipAccountId: string;
    geoipLicenseKey?: string;
    geoipLicenseKeyConfigured?: boolean;
    geoipClearLicenseKey?: boolean;
  };
  browserSnapshotsEnabled: boolean;
  historyRetentionDays: number;
  tradeRetentionDays: number;
  maintenanceMode: boolean;
  announcement: string;
  pageFlags: Partial<Record<ActivePanel, boolean>>;
};
