import React from "react";
import { createRoot } from "react-dom/client";
import "./styles/phase6.css";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Bell,
  Box,
  Building2,
  Calculator,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  CircleHelp,
  Clock,
  Coffee,
  Command,
  Crown,
  Database,
  Download,
  ExternalLink,
  Factory,
  FileText,
  FlaskConical,
  Globe2,
  GraduationCap,
  Hammer,
  Home,
  KeyRound,
  Lock,
  LogOut,
  HardDrive,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  Plus,
  RefreshCw,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  Share2,
  ShoppingBag,
  ShoppingCart,
  Star,
  TrendingDown,
  TrendingUp,
  Trophy,
  Trash2,
  Upload,
  Users,
  User,
  UserPlus,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import packageJson from "../package.json";
import { useBitjitaData } from "./api/bitjita";
import { useLocalHistory } from "./api/localHistory";
import { RarityBadge, TierBadge, TrackedOwnerName } from "./components/main/Badges";
import { DataTable } from "./components/main/DataTable";
import { ItemIcon, ItemLabel, TierMaterialIcon } from "./components/main/ItemDisplay";
import { SearchBox } from "./components/main/SearchBox";
import { Info, LiveValue, MiniStat, Stat } from "./components/main/Stats";
import {
  buildConstructionProjects,
  claimSupplyCap,
  claimSupplyRunOutAt,
  constructionNeededMaterials,
  parseDateValue,
  toNumber,
  unwrap,
  type AnyRecord,
} from "./main-app-data";
import {
  dateLabel,
  formatCompactNumber,
  formatDaysAndHours,
  formatDuration,
  formatEquipmentSlot,
  formatNumber,
  shortDateLabel,
  timeAgo,
  timestampMs,
} from "./utils/format";
import { mapWithBrowserConcurrency } from "./utils/concurrency";
import { clearBrowserLocalSettings, hasPersistedState, usePersistedState } from "./hooks/usePersistedState";
import { getTrackedOwnerName } from "./utils/ownership";
import { bitjitaIconUrl, isMarketableItem, playerToolbeltTools } from "./utils/items";
import { buyOrderAgeDays, normalizeBuyOrder, sortBuyOrdersByBestPrice } from "./utils/marketOrders";
import { normalizeData } from "./utils/normalize";
import { unique } from "./utils/array";
import { SKILL_IDS, SKILL_NAMES, TOOL_TAG_BY_TYPE } from "./utils/professions";
import type { ActivePanel, LocalHistoryState, LoadState } from "./types/app";
import { Construction } from "./pages/ConstructionPage";
import { CraftCalculatorPage } from "./pages/CraftCalculatorPage";
import { Members } from "./pages/MembersPage";
import { Research } from "./pages/ResearchPage";
import { Region } from "./pages/RegionPage";
import { Skills } from "./pages/SkillsPage";
import { SyncPanel } from "./pages/SyncPage";
import "./styles.css";

function BuyMeCoffeeButton() {
  return (
    <a
      className="footer-bmc"
      href="https://buymeacoffee.com/tom.bush"
      target="_blank"
      rel="noreferrer"
      aria-label="Support the app on Buy Me a Coffee"
    >
      <span className="footer-bmc-emoji" aria-hidden="true">☕</span>
      <span>Support the app</span>
      <Coffee size={14} aria-hidden="true" />
    </a>
  );
}

const API = "/api/bitjita";
const LOCAL_API = "/api/local";
const GITHUB_REPOSITORY = "https://github.com/Red463/bitcraft-claim-monitor-public";
const APP_VERSION = packageJson.version;
const LOCAL_CLAIM_ID_STORAGE_KEY = "claim-monitor.public.claimId";
const LOCAL_SYNC_URL_STORAGE_KEY = "claim-monitor.public.syncUrl";

type MapFocus = { name: string; locationX: number; locationZ: number } | null;
type ToastKind = "market" | "production";
type ToastNotice = { id: string; title: string; body: string; kind: ToastKind; occurredAt?: string; read?: boolean; destination?: ActivePanel; item?: AnyRecord | null };
type BrandingAsset = { fileName: string; contentType: string; updatedAt: string; url: string };
type AnalyticsConsent = "accepted" | "declined" | null;
type UserToastSettings = { marketListings: boolean; marketSales: boolean; production: boolean };
type AppUser = {
  id: number;
  discordId: string;
  username: string;
  globalName: string;
  avatarUrl: string | null;
  characterPlayerId: string;
  characterName: string;
  characterStatus: "unlinked" | "pending" | "approved" | "rejected" | string;
  settings: AnyRecord;
  createdAt?: string;
  lastLoginAt?: string;
};
type UserAuthState = { user: AppUser | null; discordLoginEnabled: boolean };
type AppSettings = {
  claimId: string;
  syncUrl: string;
  theme: typeof DEFAULT_THEME;
  refreshSeconds: number;
  defaultPage: ActivePanel;
  defaultRegion: string;
  toastSettings: { marketListings: boolean; marketSales: boolean; production: boolean };
  branding: { logo?: BrandingAsset; favicon?: BrandingAsset };
  snapshotRetentionDays: number;
  browserSnapshotsEnabled: boolean;
};

type NavItem = readonly [ActivePanel, string, LucideIcon];
type NavGroup = { id: string; label: string; items: readonly NavItem[] };

const NAV_GROUPS = [
  { id: "command", label: "Command", items: [
    ["dashboard", "Dashboard", Home],
    ["leaderboard", "Leaderboard", Trophy],
  ] },
  { id: "settlement", label: "Settlement", items: [
    ["members", "Members", Users],
    ["skills", "Professions", GraduationCap],
    ["production", "Production", Factory],
    ["inventory", "Inventory", Package],
    ["construction", "Construction", Hammer],
    ["research", "Research", FlaskConical],
  ] },
  { id: "economy", label: "Economy & Region", items: [
    ["market", "Market", CircleDollarSign],
    ["empire", "Region", Globe2],
    ["map", "Map", MapIcon],
    ["activity", "Activity", Activity],
  ] },
  { id: "tools", label: "Tools", items: [
    ["publiccrafts", "Public Craft Finder", Search],
    ["craftcalc", "Craft Calculator", Calculator],
    ["sync", "Sync", Share2],
  ] },
] as const satisfies readonly NavGroup[];

const NAV: readonly NavItem[] = NAV_GROUPS.reduce<NavItem[]>((items, group) => {
  items.push(...group.items);
  return items;
}, []);
const DEFAULT_SIDEBAR_GROUPS = Object.fromEntries(NAV_GROUPS.map((group) => [group.id, true])) as Record<string, boolean>;

const DEFAULT_THEME = {
  bg: "#0c0d10",
  sidebar: "#06070a",
  panel: "#181b21",
  panel2: "#11141a",
  border: "#353b46",
  cardTop: "#111923",
  cardBottom: "#080d14",
  cardTitle: "#b8c2cf",
  cardValue: "#ffffff",
  iconBg: "#12181f",
  activeColor: "#f0c64f",
  activeBg: "#3a3118",
  activeBorder: "#7a6428",
  hoverBorder: "#5f5127",
  muted: "#a8adba",
  text: "#f6f3ea",
  gold: "#f0c64f",
  good: "#4ee28a",
  danger: "#ef6461",
  gradientTop: "#1f1f1f",
  gradientMid: "#080808",
  gradientBase: "#030303",
  gradientTopStop: "0",
  gradientMidStop: "58",
  gradientFadeStop: "100",
  gradientHeight: "32",
};
type ThemeSettings = typeof DEFAULT_THEME;
type ThemeKey = keyof ThemeSettings;
type ThemeRangeKey = "gradientTopStop" | "gradientMidStop" | "gradientFadeStop" | "gradientHeight";
type ThemeColorKey = Exclude<ThemeKey, ThemeRangeKey>;
const CUSTOM_THEME_STORAGE_KEY = "theme.custom.local";
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const THEME_RANGE_FIELD_CONFIG: Record<ThemeRangeKey, { label: string; cssVar: string; min: number; max: number; unit: string }> = {
  gradientTopStop: { label: "Top colour stop", cssVar: "--theme-gradient-top-stop", min: 0, max: 100, unit: "%" },
  gradientMidStop: { label: "Middle colour stop", cssVar: "--theme-gradient-mid-stop", min: 0, max: 100, unit: "%" },
  gradientFadeStop: { label: "Fade stop", cssVar: "--theme-gradient-fade-stop", min: 0, max: 100, unit: "%" },
  gradientHeight: { label: "Gradient height", cssVar: "--theme-gradient-height", min: 12, max: 72, unit: "vh" },
};
const THEME_RANGE_KEYS = Object.keys(THEME_RANGE_FIELD_CONFIG) as ThemeRangeKey[];

function clampThemeNumber(value: unknown, min: number, max: number, fallback: string) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  return String(Math.min(max, Math.max(min, Math.round(parsed))));
}

function normalizeThemeCandidate(input: unknown): { theme: ThemeSettings; count: number } | null {
  const source = (input as AnyRecord)?.theme && typeof (input as AnyRecord).theme === "object" ? (input as AnyRecord).theme : input;
  if (!source || typeof source !== "object") return null;
  const nextTheme = { ...DEFAULT_THEME };
  let applied = 0;
  for (const key of Object.keys(DEFAULT_THEME) as ThemeKey[]) {
    const value = (source as AnyRecord)[key];
    if (THEME_RANGE_KEYS.includes(key as ThemeRangeKey)) {
      const config = THEME_RANGE_FIELD_CONFIG[key as ThemeRangeKey];
      const nextValue = clampThemeNumber(value, config.min, config.max, DEFAULT_THEME[key]);
      if (nextValue !== DEFAULT_THEME[key] || value !== undefined) {
        nextTheme[key] = nextValue;
        applied += 1;
      }
    } else if (typeof value === "string" && HEX_COLOR_RE.test(value)) {
      nextTheme[key] = value;
      applied += 1;
    }
  }
  return applied ? { theme: nextTheme, count: applied } : null;
}

function loadSavedCustomTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    return normalizeThemeCandidate(JSON.parse(raw))?.theme ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

const MAP_CATEGORY_ORDER = [
  "Ancient Loot",
  "Baitfish",
  "Berry",
  "Chummed Ocean Fish School",
  "Clay",
  "Coconut",
  "Fiber Plant",
  "Flower",
  "Fruit",
  "Huntable Animal",
  "Hexite Meteor",
  "Lake Fish School",
  "Metal Outcrop",
  "Monster Den",
  "Mushroom",
  "Ocean Fish School",
  "Ore Vein",
  "Rare Mushroom",
  "Rare Research",
  "Research",
  "Rock",
  "Rock Boulder",
  "Rock Outcrop",
  "Sailing Cargo",
  "Salt",
  "Sand",
  "Sapling",
  "Seasonal",
  "Seasonal Resource",
  "Stick",
  "Treasure",
  "Tree",
  "Wild Grain",
  "Wild Vegetable",
  "Wonder Resource",
  "Wood Logs",
];
const MAP_CATEGORY_SET = new Set(MAP_CATEGORY_ORDER);

const DEFAULT_SETTINGS: AppSettings = {
  claimId: "",
  syncUrl: "",
  theme: DEFAULT_THEME,
  refreshSeconds: 30,
  defaultPage: "dashboard",
  defaultRegion: "",
  toastSettings: { marketListings: true, marketSales: true, production: true },
  branding: {},
  snapshotRetentionDays: 365,
  browserSnapshotsEnabled: false,
};

const DEFAULT_USER_TOAST_SETTINGS: UserToastSettings = { marketListings: true, marketSales: true, production: true };

function normalizeAppSettings(config: Partial<AppSettings> | AnyRecord | null | undefined): AppSettings {
  const configuredDefaultPage = String((config as AnyRecord)?.defaultPage ?? DEFAULT_SETTINGS.defaultPage);
  const defaultPage = configuredDefaultPage === "buildings" || !NAV.some(([id]) => id === configuredDefaultPage)
    ? DEFAULT_SETTINGS.defaultPage
    : configuredDefaultPage as ActivePanel;
  return {
    ...DEFAULT_SETTINGS,
    ...(config ?? {}),
    defaultPage,
    theme: { ...DEFAULT_THEME, ...((config as AnyRecord)?.theme ?? {}) },
    toastSettings: { ...DEFAULT_SETTINGS.toastSettings, ...((config as AnyRecord)?.toastSettings ?? {}) },
    branding: (config as AnyRecord)?.branding ?? {},
  } as AppSettings;
}

const THEME_FIELDS: Array<[ThemeColorKey, string, string]> = [
  ["gradientTop", "Top page gradient", "--theme-gradient-top"],
  ["gradientMid", "Middle page gradient", "--theme-gradient-mid"],
  ["gradientBase", "Lower page base", "--theme-gradient-base"],
  ["bg", "Body fallback", "--bg"],
  ["sidebar", "Sidebar surface", "--sidebar"],
  ["panel", "Card surface", "--panel"],
  ["panel2", "Field / inset surface", "--panel-2"],
  ["border", "Card and control border", "--border"],
  ["cardTop", "Card gradient top", "--card-top"],
  ["cardBottom", "Card gradient bottom", "--card-bottom"],
  ["cardTitle", "Card title text", "--card-title"],
  ["cardValue", "Metric value text", "--card-value"],
  ["iconBg", "Icon background", "--icon-bg"],
  ["activeColor", "Active text / icon", "--active-color"],
  ["activeBg", "Active highlight", "--active-bg"],
  ["activeBorder", "Active border", "--active-border"],
  ["hoverBorder", "Hover border", "--hover-border"],
  ["muted", "Muted Text", "--muted"],
  ["text", "Text", "--text"],
  ["gold", "Accent", "--gold"],
  ["good", "Positive", "--good"],
  ["danger", "Danger", "--danger"],
];
const THEME_GRADIENT_RANGE_FIELDS: ThemeRangeKey[] = ["gradientTopStop", "gradientMidStop", "gradientFadeStop", "gradientHeight"];

const THEME_PRESETS: Array<{ id: string; label: string; description: string; theme: ThemeSettings }> = [
  { id: "default", label: "Default", description: "Original Timbersteel gold on dark steel.", theme: DEFAULT_THEME },
  { id: "command", label: "Command", description: "Darker dashboard-style black and charcoal.", theme: { ...DEFAULT_THEME, bg: "#030303", sidebar: "#05070b", panel: "#111923", panel2: "#070c12", border: "#273140", cardTop: "#101821", cardBottom: "#060a10", cardTitle: "#b8c2cf", activeBg: "#332b16", activeBorder: "#7a6428", hoverBorder: "#625328", muted: "#aab3c2", text: "#f7f8fb", gradientTop: "#1f1f1f", gradientMid: "#080808", gradientBase: "#030303" } },
  { id: "steel", label: "Steel", description: "Cooler blue-grey surfaces with blue accent.", theme: { ...DEFAULT_THEME, bg: "#071018", sidebar: "#050a10", panel: "#121f2b", panel2: "#0b141d", border: "#2e4356", cardTop: "#142434", cardBottom: "#07111a", cardTitle: "#b9d8ef", iconBg: "#0b1824", gold: "#65b7fa", activeColor: "#65b7fa", activeBg: "#12334b", activeBorder: "#3d79a8", hoverBorder: "#4e8bbc", good: "#63eba5", gradientTop: "#16283a", gradientMid: "#071018", gradientBase: "#03070c" } },
  { id: "ember", label: "Ember", description: "Warm copper-gold for a forge feel.", theme: { ...DEFAULT_THEME, bg: "#110b08", sidebar: "#080604", panel: "#211714", panel2: "#160f0c", border: "#493329", cardTop: "#2a1d17", cardBottom: "#100a07", cardTitle: "#f0cda5", iconBg: "#1b110b", gold: "#f5aa45", activeColor: "#f5aa45", activeBg: "#3d2510", activeBorder: "#915c25", hoverBorder: "#a66a2a", good: "#63eba5", danger: "#ff6b65", gradientTop: "#2d1b10", gradientMid: "#110b08", gradientBase: "#050302" } },
  { id: "forest", label: "Forest", description: "Green accent for resource and gathering focus.", theme: { ...DEFAULT_THEME, bg: "#07100c", sidebar: "#040806", panel: "#101c16", panel2: "#0a120e", border: "#284238", cardTop: "#13231a", cardBottom: "#06100b", cardTitle: "#bcdfca", iconBg: "#0b1910", gold: "#63eba5", activeColor: "#63eba5", activeBg: "#153824", activeBorder: "#3f9565", hoverBorder: "#4eb476", good: "#78f0a2", danger: "#ff6b65", gradientTop: "#183126", gradientMid: "#07100c", gradientBase: "#020503" } },
  { id: "violet", label: "Violet", description: "Purple accent with a sharper arcane command feel.", theme: { ...DEFAULT_THEME, bg: "#090812", sidebar: "#05050b", panel: "#151322", panel2: "#0d0b18", border: "#39304f", cardTop: "#1c1930", cardBottom: "#090815", cardTitle: "#d4c3ff", iconBg: "#111023", gold: "#b783ff", activeColor: "#b783ff", activeBg: "#2d2147", activeBorder: "#6f51a7", hoverBorder: "#8462c5", good: "#63eba5", danger: "#ff6b88", gradientTop: "#221a35", gradientMid: "#090812", gradientBase: "#030208" } },
  { id: "void", label: "Void", description: "Very dark, moody black with restrained silver-gold highlights.", theme: { ...DEFAULT_THEME, bg: "#010203", sidebar: "#010102", panel: "#07090d", panel2: "#030507", border: "#1c2633", cardTop: "#090d13", cardBottom: "#020304", cardTitle: "#c5ccd6", cardValue: "#ffffff", iconBg: "#06090d", muted: "#87909d", text: "#f7f8fb", gold: "#d8bd68", activeColor: "#d8bd68", activeBg: "#171407", activeBorder: "#5f5229", hoverBorder: "#77683a", good: "#63eba5", danger: "#ff6b65", gradientTop: "#0c1017", gradientMid: "#020304", gradientBase: "#000000" } },
  { id: "ocean", label: "Ocean", description: "Deep blue command surfaces with cyan highlights.", theme: { ...DEFAULT_THEME, bg: "#031018", sidebar: "#02080d", panel: "#0c1b27", panel2: "#06121b", border: "#244256", cardTop: "#102536", cardBottom: "#04101a", cardTitle: "#b8def0", iconBg: "#071721", gold: "#56d5ff", activeColor: "#56d5ff", activeBg: "#0e3340", activeBorder: "#32859a", hoverBorder: "#42a5bd", good: "#63eba5", danger: "#ff6b65", gradientTop: "#12304a", gradientMid: "#031018", gradientBase: "#010407" } },
  { id: "crimson", label: "Crimson", description: "Dark red accents for a high-alert operations feel.", theme: { ...DEFAULT_THEME, bg: "#110607", sidebar: "#070203", panel: "#1e0f12", panel2: "#11080a", border: "#4c242b", cardTop: "#2a1217", cardBottom: "#0b0405", cardTitle: "#f0c2c8", iconBg: "#17090b", gold: "#ff6b65", activeColor: "#ff6b65", activeBg: "#3a1518", activeBorder: "#993a3f", hoverBorder: "#b6494d", good: "#63eba5", danger: "#ff7d7d", gradientTop: "#2c1014", gradientMid: "#110607", gradientBase: "#040101" } },
  { id: "contrast", label: "High Contrast", description: "Brighter text and stronger borders.", theme: { ...DEFAULT_THEME, bg: "#020304", sidebar: "#020304", panel: "#111820", panel2: "#070b10", border: "#536072", cardTop: "#16202a", cardBottom: "#05080c", cardTitle: "#e5ebf5", cardValue: "#ffffff", iconBg: "#101720", muted: "#c1cad8", text: "#ffffff", gold: "#ffd84d", activeColor: "#ffd84d", activeBg: "#403414", activeBorder: "#b9972f", hoverBorder: "#c7a83a", good: "#68ff9a", danger: "#ff5b5b", gradientTop: "#202834", gradientMid: "#090d12", gradientBase: "#020304" } },
];

const THEME_FIELD_GROUPS: Array<{ title: string; keys: ThemeColorKey[] }> = [
  { title: "Page Background", keys: ["gradientTop", "gradientMid", "gradientBase", "bg"] },
  { title: "Surfaces", keys: ["sidebar", "panel", "panel2", "border", "cardTop", "cardBottom", "iconBg"] },
  { title: "Text", keys: ["text", "muted", "cardTitle", "cardValue"] },
  { title: "Active / Highlights", keys: ["gold", "activeColor", "activeBg", "activeBorder", "hoverBorder"] },
  { title: "Status", keys: ["good", "danger"] },
];

const MAP_DEFAULT_LAYERS = ["roadsLayer", ...Array.from({ length: 11 }, (_, tier) => `claimT${tier}Layer`)];

type ActiveRegion = { regionId: string; name: string; source?: string };

function activeRegionId(region: AnyRecord | ActiveRegion): string {
  const row = region as AnyRecord;
  return String(row.regionId ?? row.id ?? "").trim();
}

function activeRegionName(region: AnyRecord | ActiveRegion): string {
  const row = region as AnyRecord;
  return String(row.name ?? row.regionName ?? "").trim();
}

function regionOptionLabel(regionId: string, regions: ActiveRegion[], settlementRegionId = "") {
  const region = regions.find((entry) => entry.regionId === regionId);
  const name = region?.name?.trim();
  const base = name ? `${name} (R${regionId})` : `R${regionId}`;
  return String(regionId) === String(settlementRegionId) ? `${base} - Settlement Region` : base;
}

function activeRegionOptions(activeRegions: ActiveRegion[], settlementRegionId = "", selectedRegionId = "") {
  const byId = new Map<string, ActiveRegion>();
  for (const region of activeRegions) {
    if (/^\d+$/.test(region.regionId)) byId.set(region.regionId, region);
  }
  for (const regionId of [settlementRegionId, selectedRegionId]) {
    const id = String(regionId ?? "").trim();
    if (/^\d+$/.test(id) && !byId.has(id)) byId.set(id, { regionId: id, name: "" });
  }
  return [...byId.values()].sort((a, b) => toNumber(a.regionId) - toNumber(b.regionId));
}

function useActiveRegions(settlementRegionId = "") {
  const [regions, setRegions] = React.useState<ActiveRegion[]>(() => activeRegionOptions([], settlementRegionId));
  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`${LOCAL_API}/regions/active`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`active regions HTTP ${response.status}`)))
      .then((payload) => {
        const rows = Array.isArray(payload.regions) ? payload.regions : [];
        const next = rows
          .map((region: AnyRecord) => ({ regionId: activeRegionId(region), name: activeRegionName(region), source: String(region.source ?? "") }))
          .filter((region: ActiveRegion) => /^\d+$/.test(region.regionId));
        setRegions(activeRegionOptions(next, settlementRegionId));
      })
      .catch(() => {
        if (!controller.signal.aborted) setRegions(activeRegionOptions([], settlementRegionId));
      });
    return () => controller.abort();
  }, [settlementRegionId]);
  return regions;
}

function urlPanel(): ActivePanel | null {
  const panel = new URLSearchParams(window.location.search).get("page");
  if (panel === "buildings" || panel === "overview") return "dashboard";
  return NAV.some(([id]) => id === panel) ? panel as ActivePanel : null;
}

function urlMapFocus(): MapFocus {
  const params = new URLSearchParams(window.location.search);
  const x = params.get("mapX");
  const z = params.get("mapZ");
  if (x == null || z == null) return null;
  return {
    name: params.get("mapName") ?? "Map focus",
    locationX: toNumber(x),
    locationZ: toNumber(z),
  };
}

function updateQueryState(values: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function panelHref(panel: ActivePanel): string {
  return `/?page=${encodeURIComponent(panel)}`;
}

const ANALYTICS_CONSENT_COOKIE = "claim_monitor_analytics_consent";
const ANALYTICS_VISITOR_COOKIE = "claim_monitor_analytics_visitor";
const ANALYTICS_SESSION_KEY = "claim-monitor.analytics.session";
let analyticsConsent: AnalyticsConsent = null;

function getCookie(name: string): string {
  const entry = document.cookie.split("; ").find((cookie) => cookie.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : "";
}

function readAnalyticsConsent(): AnalyticsConsent {
  const consent = getCookie(ANALYTICS_CONSENT_COOKIE);
  return consent === "accepted" || consent === "declined" ? consent : null;
}

function cookieSuffix(maxAge: number): string {
  return `; Path=/; SameSite=Lax; Max-Age=${maxAge}${window.location.protocol === "https:" ? "; Secure" : ""}`;
}

function setAnalyticsPreference(consent: Exclude<AnalyticsConsent, null>) {
  analyticsConsent = consent;
  document.cookie = `${ANALYTICS_CONSENT_COOKIE}=${consent}${cookieSuffix(180 * 24 * 60 * 60)}`;
  if (consent === "declined") {
    document.cookie = `${ANALYTICS_VISITOR_COOKIE}=${cookieSuffix(0)}`;
    window.sessionStorage.removeItem(ANALYTICS_SESSION_KEY);
  } else if (!getCookie(ANALYTICS_VISITOR_COOKIE)) {
    document.cookie = `${ANALYTICS_VISITOR_COOKIE}=${crypto.randomUUID()}${cookieSuffix(180 * 24 * 60 * 60)}`;
  }
}

function analyticsSessionId(): string | null {
  if (analyticsConsent !== "accepted") return null;
  let visitorId = getCookie(ANALYTICS_VISITOR_COOKIE);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    document.cookie = `${ANALYTICS_VISITOR_COOKIE}=${visitorId}${cookieSuffix(180 * 24 * 60 * 60)}`;
  }
  let sessionId = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY) ?? "";
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, sessionId);
  }
  return sessionId;
}

function trackAnalyticsEvent(eventName: string, properties?: Record<string, string | number | boolean>, durationSeconds?: number, pageOverride?: ActivePanel) {
  const sessionId = analyticsSessionId();
  if (!sessionId) return;
  const page = pageOverride ?? urlPanel() ?? "dashboard";
  void fetch(`${LOCAL_API}/analytics/event`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({ sessionId, eventName, page, properties, durationSeconds }),
  }).catch(() => undefined);
}

function craftDisplayName(job: AnyRecord, craftsPayload?: AnyRecord): string {
  const item = craftOutputItem(job, craftsPayload);
  return String(item?.name ?? job.recipeName ?? `${job.buildingName ?? "Settlement"} craft`);
}

function craftOutputItem(job: AnyRecord, craftsPayload?: AnyRecord): AnyRecord | null {
  const output = job.craftedItem?.[0] ?? {};
  const itemId = String(output.item_id ?? output.itemId ?? job.outputItemId ?? job.itemId ?? "");
  const item = [...(craftsPayload?.items ?? []), ...(craftsPayload?.cargos ?? [])].find((candidate: AnyRecord) => String(candidate.id) === itemId);
  if (item) return { ...item, itemType: output.item_type ?? output.itemType ?? item.itemType };
  if (!itemId && !job.recipeName && !job.name) return null;
  return {
    id: itemId,
    itemId,
    itemType: output.item_type ?? output.itemType ?? job.outputItemType ?? job.itemType,
    name: job.recipeName ?? job.name ?? "Craft",
    tier: job.tier ?? job.itemTier,
    iconAssetName: job.iconAssetName,
  };
}

function safeDisplayJson(value: unknown): AnyRecord {
  try {
    const parsed = JSON.parse(String(value ?? "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function listingTrackingKey(listing: AnyRecord): string {
  return String(listing.entityId ?? listing.id ?? listing.marketListingId ?? listing.listingId ?? "");
}

function liveDaysSince(value: unknown): string {
  const date = parseDateValue(value);
  if (!date) return "-";
  const elapsed = Date.now() - date.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return "-";
  const days = Math.floor(elapsed / (24 * 60 * 60 * 1000));
  return days === 0 ? "<1 day" : `${days} day${days === 1 ? "" : "s"}`;
}

/*
 * BitJita active market listings expose their original listing time as
 * `timestamp`; persisted first-seen time is used for older/fallback payloads.
 */
function listingDate(listing: AnyRecord, firstSeen: unknown): unknown {
  return listing.timestamp ?? firstSeen;
}

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {children ? <p>{children}</p> : null}
      </div>
    </div>
  );
}

function ToolbarButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button className="toolbar-button" onClick={onClick}>{children}</button>;
}

function Dashboard({ data, activity, snapshots, dashboardSummary, lastUpdated, onNavigate }: { data: ReturnType<typeof normalizeData>; activity: AnyRecord[]; snapshots: AnyRecord[]; dashboardSummary: AnyRecord | null; lastUpdated: Date | null; onNavigate: (panel: ActivePanel, marketTab?: string) => void }) {
  const { claim, members, market, construction, crafts, research } = data;
  const supplies = toNumber(claim.supplies);
  const supplyCap = claimSupplyCap(claim);
  const treasury = toNumber(claim.treasury);
  const upkeep = toNumber(claim.upkeepCost);
  const tileCost = toNumber(claim.tileCost);
  const tileCount = toNumber(claim.numTiles);
  const suppliesPerDay = (upkeep || tileCost * tileCount) * 24;
  const supplyRunOutAt = claimSupplyRunOutAt(claim);
  const runOutDate = parseDateValue(supplyRunOutAt);
  const supplyDays = runOutDate && runOutDate.getTime() > Date.now()
    ? (runOutDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    : suppliesPerDay > 0 ? supplies / suppliesPerDay : 0;
  const supplyPct = supplyCap > 0 ? Math.max(2, Math.min(100, (supplies / supplyCap) * 100)) : Math.max(4, Math.min(100, supplyDays ? (Math.min(supplyDays, 14) / 14) * 100 : 0));
  const onlinePlayers = data.players.filter((player) => player.signedIn);
  const onlineCount = onlinePlayers.length;
  const constructionProjects = Array.isArray(construction) ? construction : (construction.projects ?? []);
  const activeProjects = constructionProjects.filter((project: AnyRecord) => toNumber(project.progress) < toNumber(project.actionsRequired || 0)).length;
  const activeCrafts = crafts.filter((job) => {
    const progress = toNumber(job.progress);
    const total = toNumber(job.totalActionsRequired);
    return total > 0 && progress < total && hasRecentCraftContribution(data.contributions[String(job.entityId)] ?? []);
  }).length;
  const marketListingValue = market.reduce((total, listing) => {
    const explicitTotal = toNumber(listing.totalValue ?? listing.total_value);
    return total + (explicitTotal || toNumber(listing.price) * Math.max(1, toNumber(listing.quantity || 1)));
  }, 0);
  const regionSettlements = data.region;
  const regionWealth = regionSettlements.reduce((total, row) => total + toNumber(row.treasury), 0);
  const regionWealthDetail = regionSettlements.length
    ? `${formatNumber(regionSettlements.length)} settlement${regionSettlements.length === 1 ? "" : "s"} in region`
    : "Region data loading";
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const treasuryEventsToday = activity.filter((event) => {
    if (event.event_type !== "treasury") return false;
    const occurredAt = parseDateValue(event.occurred_at);
    return !!occurredAt && occurredAt >= todayStart;
  }).map((event) => ({ event, metadata: activityMetadata(event) })).filter(({ metadata }) => metadata.before != null && metadata.after != null);
  const treasuryDeltasToday = treasuryEventsToday.map(({ metadata }) => toNumber(metadata.after) - toNumber(metadata.before));
  const fallbackTreasuryNetToday = treasuryDeltasToday.reduce((total, delta) => total + delta, 0);
  const treasuryNetToday = dashboardSummary?.treasuryNetToday == null ? fallbackTreasuryNetToday : toNumber(dashboardSummary.treasuryNetToday);
  const treasuryTrend = [...snapshots]
    .map((snapshot) => ({ at: String(snapshot.captured_at ?? snapshot.capturedAt ?? ""), value: toNumber(snapshot.treasury) }))
    .filter((point) => point.at && point.value > 0)
    .sort((a, b) => timestampMs(a.at) - timestampMs(b.at))
    .slice(-48);
  const dashboardSummaryActivity = Array.isArray(dashboardSummary?.recentActivity) ? dashboardSummary.recentActivity : null;
  const dashboardActivity = [...(dashboardSummaryActivity ?? activity)]
    .filter((event) => !["treasury", "supplies"].includes(String(event.event_type ?? "")))
    .sort((a, b) => timestampMs(b.occurred_at) - timestampMs(a.occurred_at));
  const recentActivity = dashboardActivity.slice(0, 5);
  const memberByPlayerId = new Map(members.map((member) => [String(member.playerEntityId), member]));
  const dashboardMembers: AnyRecord[] = onlinePlayers.map((player: AnyRecord) => {
    const member = memberByPlayerId.get(String(player.entityId));
    return {
      ...player,
      displayName: player.username ?? player.userName ?? member?.userName ?? "Unknown member",
      regionName: player.regionName ?? claim.regionName,
    };
  }).slice(0, 4);
  const rawData = (data as ReturnType<typeof normalizeData> & { raw?: AnyRecord | null }).raw;
  const craftItemLookup = new Map([...(rawData?.crafts?.items ?? []), ...(rawData?.crafts?.cargos ?? [])].map((item: AnyRecord) => [String(item.id), item]));
  const currentCrafts = crafts.map((job) => {
    const item = craftItemLookup.get(String(job.craftedItem?.[0]?.item_id)) ?? {};
    const progress = toNumber(job.progress);
    const total = toNumber(job.totalActionsRequired);
    const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
    const skillId = toNumber(job.levelRequirements?.[0]?.skill_id ?? job.experiencePerProgress?.[0]?.skill_id);
    const experiencePerEffort = toNumber(job.experiencePerProgress?.find((xp: AnyRecord) => toNumber(xp.skill_id) === skillId)?.quantity ?? job.experiencePerProgress?.[0]?.quantity ?? job.experiencePerEffort);
    const totalXp = toNumber(job.totalXp ?? job.totalXP) || total * experiencePerEffort;
    const name = String(item.name ?? job.recipeName ?? job.craftName ?? job.buildingName ?? "Craft");
    return {
      id: String(job.entityId ?? `${job.recipeName}-${job.buildingName}`),
      item: Object.keys(item).length ? item : { name },
      name,
      detail: job.buildingName ?? "Production",
      pct,
      totalXp,
    };
  }).sort((a, b) => b.pct - a.pct || b.totalXp - a.totalXp || a.name.localeCompare(b.name));
  const currentCraftsDisplay = currentCrafts.slice(0, 5);
  const totalProductionXp = currentCrafts.reduce((sum, job) => sum + job.totalXp, 0);
  const attention = [
    supplyDays > 0 && supplyDays < 7 ? { icon: <AlertTriangle />, count: "!", title: "Low Supplies", body: `${formatDaysAndHours(supplyDays)} remaining`, panel: "inventory" as ActivePanel, tone: "danger" } : null,
    activeProjects ? { icon: <Hammer />, count: activeProjects, title: "Construction Projects", body: `${activeProjects} project${activeProjects === 1 ? "" : "s"} in progress`, panel: "construction" as ActivePanel, tone: "warn" } : null,
    crafts.length ? { icon: <Factory />, count: crafts.length, title: "Production Queue", body: `${activeCrafts} active, ${crafts.length} total job${crafts.length === 1 ? "" : "s"}`, panel: "production" as ActivePanel, tone: "blue" } : null,
  ].filter(Boolean).slice(0, 4) as Array<{ icon: React.ReactNode; count: React.ReactNode; title: string; body: string; panel: ActivePanel; tone: string }>;
  return (
    <div className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <h2>Dashboard</h2>
          <p>Real-time summary of {claim.name ?? "the monitored settlement"}</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span className="dashboard-region-line"><Globe2 size={15} /> {claim.regionName ?? "Unknown"} <span className="dashboard-region-badge">R{claim.regionId ?? "?"}</span></span>
            <span className="dashboard-refresh-line"><span className="online-dot is-online" /> Last updated {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "waiting"}</span>
          </div>
          <span className="dashboard-claim-link"><TierBadge tier={claim.tier} /> {claim.name ?? "Monitored Settlement"}</span>
        </div>
      </header>

      <section className="dashboard-kpis">
        <DashboardMetric icon={<Users />} label="Members" value={members.length} detail={`${onlineCount} online now`} onClick={() => onNavigate("members")} />
        <DashboardMetric icon={<Package />} label="Supply Status" value={formatDaysAndHours(supplyDays)} detail={`${formatNumber(supplies)} stored`} progress={supplyPct} tone="green" onClick={() => onNavigate("inventory")} />
        <DashboardMetric icon={<Hammer />} label="Construction" value={activeProjects} detail={`${activeProjects} current project${activeProjects === 1 ? "" : "s"}`} onClick={() => onNavigate("construction")} />
        <DashboardMetric icon={<TrendingUp />} label="Market Listings" value={market.length} detail={`${formatNumber(marketListingValue)}g total listing value`} tone="green" onClick={() => onNavigate("market")} />
        <DashboardMetric icon={<CircleDollarSign />} label="Region Wealth" value={regionSettlements.length ? formatCompactNumber(regionWealth) : "-"} detail={regionWealthDetail} tone="gold" onClick={() => onNavigate("empire")} />
      </section>

      <section className="dashboard-main-grid">
        <article className="dashboard-card dashboard-card-chart">
          <DashboardCardHeader title="Treasury Over Time" icon={<CircleDollarSign size={15} />} action="7 Days" />
          <div className="dashboard-money-row">
            <strong>{formatNumber(treasury)}g</strong>
            <span className={treasuryNetToday < 0 ? "negative" : treasuryNetToday > 0 ? "positive" : ""}>{signedDelta(treasuryNetToday, 0, "g")} net today</span>
          </div>
          <DashboardTrend points={treasuryTrend} suffix="g" />
        </article>

        <article className="dashboard-card dashboard-card-supply">
          <DashboardCardHeader title="Supply Status" icon={<Package size={15} />} />
          <div className="dashboard-supply-lead"><strong>{formatDaysAndHours(supplyDays)}</strong><span>until full depletion</span></div>
          <div className="dashboard-supply-cap"><span>{formatNumber(supplies)}{supplyCap ? ` / ${formatNumber(supplyCap)}` : ""}</span><span>{supplyCap ? `${Math.round((supplies / supplyCap) * 100)}% capacity` : "Runway estimate"}</span></div>
          <div className="dashboard-progress"><div style={{ width: `${supplyPct}%` }} /></div>
          <div className="dashboard-supply-breakdown">
            <ul>
              <li><span className="yellow" /> Supplies per day <b>{formatNumber(suppliesPerDay, 0)}</b></li>
              <li><span className="green" /> Storage cap <b>{supplyCap ? formatNumber(supplyCap) : "Unknown"}</b></li>
              <li><span className="blue" /> Current stock <b>{formatNumber(supplies)}</b></li>
            </ul>
          </div>
        </article>

        <article className="dashboard-card dashboard-card-activity">
          <DashboardCardHeader title="Recent Activity" icon={<Activity size={15} />} action="View all" onClick={() => onNavigate("activity")} />
          <div className="dashboard-feed">
            {recentActivity.length ? recentActivity.map((event) => {
              const style = activityStyle(event);
              return (
                <button key={event.id ?? `${event.event_type}-${event.occurred_at}`} className={`dashboard-feed-row ${style.tone}`} onClick={() => onNavigate("activity")}>
                  <span>{style.icon}</span>
                  <strong>{style.label}</strong>
                  <small>{activitySummary(event)}</small>
                  <time>{timeAgo(event.occurred_at)}</time>
                </button>
              );
            }) : <div className="dashboard-empty">{activity.length ? "No non-treasury or non-supply activity has been recorded yet." : "No local activity history has been recorded yet."}</div>}
          </div>
        </article>

        <article className="dashboard-card dashboard-card-members">
          <DashboardCardHeader title={`Online Members (${onlineCount})`} icon={<Users size={15} />} action="View all" onClick={() => onNavigate("members")} />
          <div className="dashboard-member-list">
            {dashboardMembers.length ? dashboardMembers.map((player) => (
              <button key={player.entityId} onClick={() => onNavigate("members")}>
                <span className="dashboard-avatar">{String(player.displayName ?? "?").slice(0, 1).toUpperCase()}<i className="online-dot is-online" /></span>
                <span className="dashboard-member-copy">
                  <strong><TrackedOwnerName name={player.displayName} claim={claim} /></strong>
                  <small>{player.regionName ?? "Online"}</small>
                </span>
                <span className="dashboard-member-session">
                  <em>Online</em>
                  <small>{player.sessionSeconds != null ? `Playing ${formatDuration(player.sessionSeconds)}` : "Session active"}</small>
                </span>
              </button>
            )) : <div className="dashboard-empty">No members are currently online.</div>}
          </div>
        </article>

        <article className="dashboard-card dashboard-card-production">
          <DashboardCardHeader title="Current Crafts" icon={<Factory size={15} />} action="View production" onClick={() => onNavigate("production")} />
          <div className="dashboard-production-list">
            {currentCraftsDisplay.length ? currentCraftsDisplay.map((job) => (
              <button key={job.id} onClick={() => onNavigate("production")}>
                <span className="dashboard-item-icon"><ItemIcon item={job.item} /></span>
                <strong>{job.name}</strong>
                <b>{job.pct}%</b>
                <i><span style={{ width: `${Math.max(4, job.pct)}%` }} /></i>
              </button>
            )) : <div className="dashboard-empty">No current production jobs in the API snapshot.</div>}
          </div>
          <div className="dashboard-total-row"><span>Total Production XP</span><strong>{formatNumber(totalProductionXp)}</strong></div>
        </article>

        <article className="dashboard-card dashboard-card-attention">
          <DashboardCardHeader title="Needs Attention" icon={<AlertTriangle size={15} />} />
          <div className="dashboard-alert-list">
            {attention.length ? attention.map((item) => (
              <button key={item.title} className={item.tone} onClick={() => onNavigate(item.panel)}>
                <span>{item.count}</span>
                <strong>{item.title}</strong>
                <small>{item.body}</small>
                <ArrowUp size={14} />
              </button>
            )) : <div className="dashboard-empty">No urgent settlement issues detected.</div>}
          </div>
        </article>
      </section>
    </div>
  );
}

function DashboardMetric({ icon, label, value, detail, progress, trend, tone, onClick }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: React.ReactNode; progress?: number; trend?: string; tone?: string; onClick?: () => void }) {
  return (
    <button className={`dashboard-metric ${tone ?? ""}`} onClick={onClick}>
      <span className="dashboard-metric-icon">{icon}</span>
      <span className="dashboard-metric-label">{label}</span>
      <strong><LiveValue value={value} /></strong>
      <small>{detail}</small>
      {trend ? <em>{trend}</em> : null}
      {progress != null ? <i className="dashboard-mini-progress"><span style={{ width: `${progress}%` }} /></i> : null}
    </button>
  );
}

function DashboardCardHeader({ title, icon, action, onClick }: { title: string; icon?: React.ReactNode; action?: string; onClick?: () => void }) {
  return (
    <header className="dashboard-card-header">
      <h3>{icon ? <span className="dashboard-card-title-icon">{icon}</span> : null}{title}</h3>
      {action ? onClick ? <button onClick={onClick}>{action}</button> : <span className="dashboard-card-range">{action}</span> : null}
    </header>
  );
}

function DashboardTrend({ points, suffix = "" }: { points: Array<{ at: string; value: number }>; suffix?: string }) {
  const datedPoints = points
    .map((point) => ({ ...point, ms: timestampMs(point.at) }))
    .filter((point) => point.ms > 0)
    .sort((a, b) => a.ms - b.ms);
  if (datedPoints.length < 2) {
    return <div className="dashboard-chart-empty"><TrendingUp size={18} /><span>Daily trend appears after snapshots exist for at least two days.</span></div>;
  }
  const width = 560;
  const height = 230;
  const pad = 18;
  const dayMs = 24 * 60 * 60 * 1000;
  const latestSnapshot = datedPoints[datedPoints.length - 1];
  const end = new Date(latestSnapshot.ms);
  end.setHours(23, 59, 59, 999);
  const start = new Date(end.getTime() - 6 * dayMs);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const dailyPoints = new Map<number, { at: string; value: number; ms: number; dayMs: number }>();
  for (const point of datedPoints) {
    if (point.ms < startMs || point.ms > endMs) continue;
    const day = new Date(point.ms);
    day.setHours(12, 0, 0, 0);
    const dayMs = day.getTime();
    const existing = dailyPoints.get(dayMs);
    if (!existing || point.ms >= existing.ms) dailyPoints.set(dayMs, { ...point, dayMs });
  }
  const chartPoints = [...dailyPoints.values()].sort((a, b) => a.dayMs - b.dayMs);
  if (chartPoints.length < 2) {
    return <div className="dashboard-chart-empty"><TrendingUp size={18} /><span>Daily trend appears after snapshots exist for at least two days.</span></div>;
  }
  const values = chartPoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const isFlat = max === min;
  const range = Math.max(max - min, 1);
  const xForDay = (dayMsValue: number) => pad + ((dayMsValue - startMs) / Math.max(endMs - startMs, 1)) * (width - pad * 2);
  const yForValue = (value: number) => isFlat ? height / 2 : height - pad - ((value - min) / range) * (height - pad * 2);
  const path = chartPoints.map((point, index) => {
    const x = xForDay(point.dayMs);
    const y = yForValue(point.value);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const areaPath = `${path} L${width - pad},${height - pad} L${pad},${height - pad} Z`;
  const latest = chartPoints[chartPoints.length - 1];
  const latestX = xForDay(latest.dayMs);
  const latestY = yForValue(latest.value);
  const axisDays = Array.from({ length: 7 }, (_, index) => new Date(startMs + index * dayMs));
  return (
    <div className="dashboard-chart">
      <svg viewBox={`0 0 ${width} ${height}`} aria-label={`Treasury trend ending at ${formatNumber(latest.value)}${suffix}`}>
        <defs>
          <linearGradient id="dashboardAreaGold" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(247, 200, 54, .46)" />
            <stop offset="100%" stopColor="rgba(247, 200, 54, 0)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((y) => <line key={y} x1="0" x2={width} y1={height * y} y2={height * y} className="dashboard-chart-grid" />)}
        {chartPoints.length >= 3 ? <path d={areaPath} className="dashboard-chart-area" /> : null}
        <path d={path} className="dashboard-chart-line" />
        <circle cx={latestX} cy={latestY} r="5" className="dashboard-chart-dot" />
      </svg>
      <div className="dashboard-chart-axis">{axisDays.map((day) => <span key={day.toISOString()}>{shortDateLabel(day.toISOString())}</span>)}</div>
    </div>
  );
}

function Segmented({ options, value, onChange, label }: { options: string[]; value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <div className="segmented" aria-label={label}>
      {label ? <span>{label}:</span> : null}
      {options.map((option) => <button key={option} className={value === option ? "active" : ""} onClick={() => onChange(option)}>{option}</button>)}
    </div>
  );
}

const CORE_MATERIAL_GROUPS = [
  { label: "Ingots", matcher: (row: AnyRecord) => /^(?:Refined )?Ingot$/i.test(String(row.tag ?? "")) },
  { label: "Planks", matcher: (row: AnyRecord) => /^(?:Refined )?Plank$/i.test(String(row.tag ?? "")) },
  { label: "Bricks", matcher: (row: AnyRecord) => /^(?:Refined )?Brick$/i.test(String(row.tag ?? "")) && !/^Unfired /i.test(String(row.name ?? "")) },
  { label: "Leather", matcher: (row: AnyRecord) => /^(?:Refined )?Leather$/i.test(String(row.tag ?? "")) },
  { label: "Cloth", matcher: (row: AnyRecord) => /^(?:Refined )?Cloth$/i.test(String(row.tag ?? "")) },
] as const;

function Inventory({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [q, setQ] = React.useState("");
  const [containerQ, setContainerQ] = React.useState("");
  const [type, setType] = usePersistedState("inventory.type", "All");
  const [tier, setTier] = usePersistedState("inventory.tier", "All");
  const [rarity, setRarity] = usePersistedState("inventory.rarity", "All");
  const [buildingFilter, setBuildingFilter] = usePersistedState("inventory.container", "All");
  const [coreMaterialFilter, setCoreMaterialFilter] = usePersistedState("inventory.core-material", "All");
  const [nonEmptyOnly, setNonEmptyOnly] = usePersistedState("inventory.non-empty", true);
  const [selectedItem, setSelectedItem] = React.useState<AnyRecord | null>(null);
  const [itemDetail, setItemDetail] = React.useState<AnyRecord | null>(null);
  React.useEffect(() => {
    if (!selectedItem?.itemId) {
      setItemDetail(null);
      return;
    }
    const controller = new AbortController();
    const resource = selectedItem.type === "Cargo" ? "cargo" : "items";
    fetch(`${API}/${resource}/${selectedItem.itemId}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`item detail HTTP ${response.status}`)))
      .then(setItemDetail)
      .catch(() => { if (!controller.signal.aborted) setItemDetail(null); });
    return () => controller.abort();
  }, [selectedItem?.itemId, selectedItem?.type]);
  const itemLookup = new Map([...(data.inventories.items ?? []), ...(data.inventories.cargos ?? [])].map((i: AnyRecord) => [String(i.id), i]));
  const containers = ((data.inventories.buildings ?? []) as AnyRecord[]).map((building) => {
    const items = (building.inventory ?? []).map((slot: AnyRecord, index: number) => {
      const contents = slot.contents ?? {};
      const lookup = itemLookup.get(String(contents.item_id)) ?? {};
      return {
        id: `${building.entityId}-${contents.item_id}-${slot.slot ?? index}`,
        building: building.buildingNickname ?? building.buildingName,
        itemId: contents.item_id == null ? null : String(contents.item_id),
        name: lookup.name ?? `Item #${contents.item_id ?? "?"}`,
        iconAssetName: lookup.iconAssetName,
        quantity: contents.quantity,
        type: contents.item_type === "cargo" ? "Cargo" : "Item",
        tier: lookup.tier,
        rarity: lookup.rarityStr,
        tag: lookup.tag,
      };
    });
    return {
      id: String(building.entityId ?? building.buildingName),
      name: building.buildingNickname ?? building.buildingName ?? "Unknown Container",
      locked: Boolean(building.locked),
      items,
    };
  });
  const allRows = containers.flatMap((container) => container.items);
  const materialSummary: AnyRecord[] = CORE_MATERIAL_GROUPS.map((group): AnyRecord => {
    const matches = allRows.filter((row: AnyRecord) => group.matcher(row));
    const quantity = matches.reduce((total: number, row: AnyRecord) => total + toNumber(row.quantity), 0);
    const containerCount = new Set(matches.map((row: AnyRecord) => row.building).filter(Boolean)).size;
    const tierBreakdown = Object.values(matches.reduce((acc: Record<string, AnyRecord>, row: AnyRecord) => {
      const tierNumber = toNumber(row.tier);
      const tierLabel = tierNumber > 0 ? `T${tierNumber}` : "Other";
      const current = acc[tierLabel] ?? { tierLabel, tier: tierNumber, quantity: 0, item: row };
      current.quantity += toNumber(row.quantity);
      if (!current.item?.iconAssetName && row.iconAssetName) current.item = row;
      acc[tierLabel] = current;
      return acc;
    }, {})).sort((a: AnyRecord, b: AnyRecord) => {
      if (a.tierLabel === "Other") return 1;
      if (b.tierLabel === "Other") return -1;
      return toNumber(a.tier) - toNumber(b.tier);
    });
    return { label: group.label, quantity, containerCount, tierBreakdown };
  });
  const selectedCoreMaterial = CORE_MATERIAL_GROUPS.find((group) => group.label === coreMaterialFilter);
  const filteredContainers = containers.map((container) => ({
    ...container,
    items: container.items.filter((row: AnyRecord) => {
      if (selectedCoreMaterial && !selectedCoreMaterial.matcher(row)) return false;
      if (q && !row.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (type !== "All" && row.type !== type) return false;
      if (tier !== "All" && String(row.tier) !== tier) return false;
      if (rarity !== "All" && row.rarity !== rarity) return false;
      if (buildingFilter !== "All" && row.building !== buildingFilter) return false;
      return true;
    }),
  })).filter((container) => {
    if (containerQ && !container.name.toLowerCase().includes(containerQ.toLowerCase())) return false;
    if (selectedCoreMaterial && container.items.length === 0) return false;
    if (nonEmptyOnly && container.items.length === 0) return false;
    return true;
  });
  const rows = filteredContainers.flatMap((container) => container.items);
  const buildings = unique(allRows.map((row: AnyRecord) => String(row.building)).filter(Boolean));
  const tiers = unique(allRows.map((row: AnyRecord) => String(row.tier)).filter((value: string) => value && value !== "undefined" && value !== "-1" && value !== "0"));
  const rarities = unique(allRows.map((row: AnyRecord) => String(row.rarity)).filter((value: string) => value && value !== "undefined" && value !== "Default"));
  const totalItems = rows.reduce((total: number, row: AnyRecord) => total + toNumber(row.quantity), 0);
  const occupiedContainers = containers.filter((container) => container.items.length > 0).length;
  const uniqueVisibleItems = unique(rows.map((row: AnyRecord) => String(row.name))).length;
  return (
    <div className="panel inventory-page">
      <header className="members-topbar inventory-topbar">
        <div>
          <h2>Inventory & Storage</h2>
          <p>{containers.length} containers - {rows.length} visible stacks</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Package size={14} /> {formatNumber(totalItems)} visible items</span>
            <span>{formatNumber(uniqueVisibleItems)} unique</span>
          </div>
          <div className="dashboard-settlement-pill">
            <span className="status-pill">{formatNumber(occupiedContainers)}</span>
            <span>Occupied containers</span>
          </div>
        </div>
      </header>
      <div className="summary-grid inventory-summary">
        <MiniStat icon={<Package />} label="Total Items" value={formatNumber(totalItems)} />
        <MiniStat icon={<Box />} label="Unique Items" value={uniqueVisibleItems} />
        <MiniStat icon={<Package />} label="Occupied Containers" value={occupiedContainers} />
        <MiniStat icon={<Building2 />} label="Containers" value={containers.length} />
      </div>
      <section className="material-watch">
        <div className="split-header">
          <h3><Package size={17} /> Core Materials</h3>
        </div>
        <div className="material-watch-grid">
          {materialSummary.map((group) => (
            <button
              type="button"
              className={`material-card ${group.quantity ? "" : "empty"} ${coreMaterialFilter === group.label ? "active" : ""}`}
              key={group.label}
              aria-pressed={coreMaterialFilter === group.label}
              onClick={() => setCoreMaterialFilter(coreMaterialFilter === group.label ? "All" : group.label)}
            >
              <span>{group.label}</span>
              <strong>{formatNumber(group.quantity)}</strong>
              <small>{group.containerCount ? `${group.containerCount} container${group.containerCount === 1 ? "" : "s"}` : "None stored"}</small>
              {group.tierBreakdown.length ? (
                <div className="material-tier-list">
                  {group.tierBreakdown.map((entry: AnyRecord) => <div key={entry.tierLabel}>{entry.tierLabel === "Other" ? <b>{entry.tierLabel}</b> : <TierMaterialIcon item={entry.item} tier={entry.tier} />}<em>{formatNumber(entry.quantity)}</em></div>)}
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </section>
      {selectedItem && itemDetail ? (
        <section className="item-detail">
          <div className="split-header">
            <h3><Package size={17} /> {selectedItem.name}</h3>
            <button className="mini-action" onClick={() => setSelectedItem(null)}>Close</button>
          </div>
          <div className="metric-grid">
            <MiniStat icon={<Factory />} label="Crafting Recipes" value={(itemDetail.craftingRecipes ?? []).length} />
            <MiniStat icon={<Wrench />} label="Used In Recipes" value={(itemDetail.recipesUsingItem ?? []).length} />
            <MiniStat icon={<TrendingUp />} label="Related Skills" value={(itemDetail.relatedSkills ?? []).length} />
            <MiniStat icon={<CircleDollarSign />} label="Market Data" value={itemDetail.marketStats ? "Available" : "None"} />
          </div>
          <div className="highlight-grid">
            {[...(itemDetail.craftingRecipes ?? []), ...(itemDetail.recipesUsingItem ?? [])].slice(0, 6).map((recipe: AnyRecord) => (
              <div key={recipe.id ?? recipe.name}><strong>{recipe.name ?? "Recipe"}</strong><span>{recipe.buildingName ?? "No station listed"}</span></div>
            ))}
          </div>
        </section>
      ) : null}
      <div className="production-command-panel inventory-command-panel">
        <div className="inventory-command-header">
          <span className="production-command-title"><Search size={15} /> Inventory filters</span>
          <div className="inventory-command-actions">
            {selectedCoreMaterial ? <button className="mini-action active" onClick={() => setCoreMaterialFilter("All")}><X size={13} /> {selectedCoreMaterial.label} only</button> : null}
            <label className="inventory-inline-toggle"><span>Non-empty only</span><input type="checkbox" checked={nonEmptyOnly} onChange={(event) => setNonEmptyOnly(event.target.checked)} /></label>
          </div>
        </div>
        <div className="inventory-filter-grid">
          <label className="inventory-filter-field"><span>Item</span><SearchBox value={q} onChange={setQ} placeholder="Search items" /></label>
          <label className="inventory-filter-field"><span>Container</span><SearchBox value={containerQ} onChange={setContainerQ} placeholder="Search containers" /></label>
          <label className="inventory-filter-field"><span>Type</span>
            <select className="select-control" value={type} onChange={(event) => setType(event.target.value)}>
              <option>All</option><option>Item</option><option>Cargo</option>
            </select>
          </label>
          <label className="inventory-filter-field"><span>Tier</span>
            <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}>
              <option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="inventory-filter-field"><span>Rarity</span>
            <select className="select-control" value={rarity} onChange={(event) => setRarity(event.target.value)}>
              <option>All</option>{rarities.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="inventory-filter-field"><span>Storage</span>
            <select className="select-control" value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)}>
              <option>All</option>{buildings.map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="container-list">
        {selectedCoreMaterial && filteredContainers.length === 0 ? <div className="empty-state"><Package />No containers match the {selectedCoreMaterial.label.toLowerCase()} filter.</div> : null}
        {filteredContainers.map((container) => {
          const quantity = container.items.reduce((total: number, item: AnyRecord) => total + toNumber(item.quantity), 0);
          return (
            <details className="container-card" key={container.id} open={filteredContainers.length <= 4}>
              <summary>
                <span><Package size={16} /> <strong>{container.name}</strong>{container.locked ? <Lock size={13} /> : null}</span>
                <small>{container.items.length} stacks - {formatNumber(quantity)} items</small>
              </summary>
              <DataTable rows={container.items} columns={[
                ["Item", (r) => <button className="item-link with-icon" onClick={() => setSelectedItem(r)}><ItemIcon item={r} /><span><strong>{r.name}</strong>{r.tag ? <small className="muted-line">{r.tag}</small> : null}</span></button>],
                ["Qty", (r) => formatNumber(r.quantity)],
                ["Tier", (r) => r.tier ? <TierBadge tier={r.tier} /> : "-"],
                ["Rarity", (r) => r.rarity ? <RarityBadge rarity={r.rarity} /> : "-"],
                ["Type", (r) => r.type],
              ]} />
            </details>
          );
        })}
      </div>
    </div>
  );
}
function Market({ data, history, claimId }: { data: ReturnType<typeof normalizeData>; history: AnyRecord | null; claimId: string }) {
  const [q, setQ] = React.useState("");
  const [view, setView] = usePersistedState<"live" | "analytics" | "pricing" | "buyOrders">("market.view", "live");
  const [tab, setTab] = React.useState<"sell" | "buy">("sell");
  const [tier, setTier] = usePersistedState("market.tier", "All");
  const [rarity, setRarity] = usePersistedState("market.rarity", "All");
  const [memberFilter, setMemberFilter] = usePersistedState("market.member", "All");
  const [memberHistory, setMemberHistory] = React.useState<AnyRecord | null>(null);
  React.useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "live" || requested === "analytics" || requested === "pricing") setView(requested);
    if (requested === "buy-orders" || requested === "buyOrders") setView("buyOrders");
  }, [setView]);
  const selectView = (next: "live" | "analytics" | "pricing" | "buyOrders") => {
    setView(next);
    updateQueryState({ page: "market", tab: next === "buyOrders" ? "buy-orders" : next });
    trackAnalyticsEvent("market_tab_viewed", { tab: next });
  };
  const memberOptions = React.useMemo(() => {
    const names = [
      ...data.members.map((member) => member.userName ?? member.username ?? member.playerUsername ?? member.name),
      ...data.market.map((listing) => listing.ownerUsername ?? listing.owner ?? listing.ownerName),
    ].filter(Boolean).map(String);
    return unique(names).sort((a, b) => a.localeCompare(b));
  }, [data.members, data.market]);
  const ownerMatches = React.useCallback((owner: unknown) => memberFilter === "All" || String(owner ?? "").toLowerCase() === memberFilter.toLowerCase(), [memberFilter]);
  const all = data.market.filter((listing) => ownerMatches(listing.ownerUsername ?? listing.owner ?? listing.ownerName));
  React.useEffect(() => {
    if (memberFilter === "All") {
      setMemberHistory(null);
      return;
    }
    const controller = new AbortController();
    setMemberHistory(null);
    fetch(`${LOCAL_API}/market/history?claimId=${encodeURIComponent(claimId)}&limit=120&owner=${encodeURIComponent(memberFilter)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market history HTTP ${response.status}`)))
      .then((result) => setMemberHistory(result))
      .catch(() => {
        if (!controller.signal.aborted) setMemberHistory({ sales: [], topItems: [], daily: [], totals: {} });
      });
    return () => controller.abort();
  }, [claimId, memberFilter, history]);
  const analytics = memberFilter === "All" ? history : memberHistory;
  const apiTrades: AnyRecord[] = (analytics?.sales ?? [])
    .map((event: AnyRecord) => {
      const raw = safeDisplayJson(event.raw_json) ?? {};
      return {
        id: event.id,
        itemName: event.item_name,
        name: event.item_name,
        iconAssetName: event.iconAssetName ?? raw.iconAssetName,
        quantity: event.quantity,
        unitPrice: event.price,
        totalPrice: event.total_value,
        sellerUsername: event.owner,
        purchaserUsername: raw.purchaserUsername,
        itemTier: event.tier ?? raw.itemTier,
        itemRarityStr: event.rarity ?? raw.itemRarityStr,
        timestamp: event.occurred_at,
      };
    })
    .sort((a: AnyRecord, b: AnyRecord) => String(b.timestamp).localeCompare(String(a.timestamp)));
  const marketItemMeta = React.useMemo(() => {
    const entries = [...data.market, ...apiTrades].map((item: AnyRecord) => [String(item.itemName ?? item.name ?? ""), item] as const);
    return new Map(entries.filter(([name]) => Boolean(name)));
  }, [apiTrades, data.market]);
  const trackedLiveListings = React.useMemo(
    () => new Map<string, AnyRecord>((history?.liveListings ?? []).map((listing: AnyRecord) => [String(listing.listing_key), listing])),
    [history?.liveListings],
  );
  const listingListedAt = (listing: AnyRecord) => listingDate(listing, trackedLiveListings.get(listingTrackingKey(listing))?.first_seen);
  const sellOrders = all.filter((m) => String(m.side ?? m.orderType ?? "sell").toLowerCase().includes("sell"));
  const buyOrders = all.filter((m) => String(m.side ?? m.orderType ?? "").toLowerCase().includes("buy"));
  const current = tab === "sell" ? (sellOrders.length ? sellOrders : all) : buyOrders;
  const tiers = unique(all.map((m) => String(m.itemTier ?? m.tier)).filter((value) => value && value !== "undefined"));
  const rarities = unique(all.map((m) => m.itemRarityStr ?? m.rarity).filter(Boolean));
  const rows = current.filter((m) => {
    if (q && !String(m.itemName ?? "").toLowerCase().includes(q.toLowerCase())) return false;
    if (tier !== "All" && String(m.itemTier ?? m.tier) !== tier) return false;
    if (rarity !== "All" && (m.itemRarityStr ?? m.rarity) !== rarity) return false;
    return true;
  });
  const highest = [...all].sort((a, b) => toNumber(b.price) * toNumber(b.quantity || 1) - toNumber(a.price) * toNumber(a.quantity || 1)).slice(0, 3);
  const saleEvents = apiTrades.map((trade: AnyRecord) => ({
    itemName: trade.itemName,
    item_name: trade.itemName,
    quantity: trade.quantity,
    price: trade.unitPrice,
    totalValue: trade.totalPrice,
    total_value: trade.totalPrice,
    occurredAt: trade.timestamp ?? trade.createdAt,
    occurred_at: trade.timestamp ?? trade.createdAt,
  }));
  const topItems = analytics?.topItems ?? buildMarketTopItems(saleEvents);
  const daily = analytics?.daily ?? buildMarketDaily(saleEvents);
  const confirmedSales = toNumber(analytics?.totals?.confirmedSales ?? apiTrades.length);
  const confirmedRevenue = toNumber(analytics?.totals?.trackedValue ?? apiTrades.reduce((total: number, trade: AnyRecord) => total + toNumber(trade.totalPrice), 0));
  const unitsSold = toNumber(analytics?.totals?.confirmedUnits ?? apiTrades.reduce((total: number, trade: AnyRecord) => total + toNumber(trade.quantity), 0));
  const averageSaleValue = confirmedSales ? confirmedRevenue / confirmedSales : 0;
  const listingValue = all.reduce((total, listing) => total + toNumber(listing.price) * Math.max(1, toNumber(listing.quantity)), 0);
  const maxDailyValue = Math.max(...daily.map((row: AnyRecord) => toNumber(row.totalValue)), 1);
  const trendRange = daily.length ? `${formatMarketDay(daily[0].day)} to ${formatMarketDay(daily[daily.length - 1].day)}` : "No confirmed sales";
  const filterLabel = memberFilter === "All" ? "all members" : memberFilter;
  return (
    <div className="panel market-page">
      <header className="members-topbar market-topbar">
        <div>
          <h2>Market</h2>
          <p>{view === "pricing" ? "Regional completed-trade pricing for smarter listings" : view === "buyOrders" ? "Find active buy orders across regional markets" : `${formatNumber(all.length)} live listing${all.length === 1 ? "" : "s"} for ${filterLabel}`}</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><ShoppingCart size={14} /> {formatNumber(all.length)} listings</span>
            <span>{formatNumber(confirmedSales)} confirmed sales</span>
          </div>
          <div className="dashboard-settlement-pill">
            <span className="status-pill">R{data.claim?.regionId ?? "?"}</span>
            <span>{data.claim?.name ?? "Settlement market"}</span>
          </div>
        </div>
      </header>
      <div className="summary-grid market-summary">
        <MiniStat icon={<ShoppingCart />} label="Live Listings" value={formatNumber(all.length)} />
        <MiniStat icon={<CircleDollarSign />} label="Listing Value" value={formatCompactNumber(listingValue)} />
        <MiniStat icon={<CheckCircle2 />} label="Confirmed Sales" value={formatNumber(confirmedSales)} />
        <MiniStat icon={<TrendingUp />} label="Sales Revenue" value={formatCompactNumber(confirmedRevenue)} />
      </div>
      <section className="production-command-panel market-command-panel">
        <div className="market-command-header">
          <span className="production-command-title"><CircleDollarSign size={15} /> Market tools</span>
          <span className="market-command-note">{view === "pricing" ? "Use completed trade history to estimate listing prices." : view === "buyOrders" ? "Search current buy orders by item and region." : "Browse settlement market data by view and member."}</span>
        </div>
        <div className="market-tool-row">
          <div className="tabs primary-tabs market-tabs">
            <button className={view === "live" ? "active" : ""} onClick={() => selectView("live")}><ShoppingCart size={15} /> Live Listings</button>
            <button className={view === "analytics" ? "active" : ""} onClick={() => selectView("analytics")}><TrendingUp size={15} /> Analytics</button>
            <button className={view === "pricing" ? "active" : ""} onClick={() => selectView("pricing")}><CircleDollarSign size={15} /> Price Finder</button>
            <button className={view === "buyOrders" ? "active" : ""} onClick={() => selectView("buyOrders")}><ShoppingBag size={15} /> Buy Order Finder</button>
          </div>
          <label className={`market-member-field ${view === "pricing" || view === "buyOrders" ? "is-placeholder" : ""}`}>
            <span>Member</span>
            {view !== "pricing" && view !== "buyOrders" ? (
              <select className="select-control" value={memberFilter} onChange={(event) => { setMemberFilter(event.target.value); trackAnalyticsEvent("market_member_filter_used", { scope: event.target.value === "All" ? "all" : "member" }); }}>
                <option>All</option>
                {memberOptions.map((name) => <option key={name}>{name}</option>)}
              </select>
            ) : <span className="market-member-placeholder">{view === "buyOrders" ? "All market buyers" : "All settlement history"}</span>}
          </label>
        </div>
      </section>
      {view === "pricing" ? (
        <PriceFinder monitoredRegionId={String(data.claim?.regionId ?? "19")} />
      ) : view === "buyOrders" ? (
        <BuyOrderFinder monitoredRegionId={String(data.claim?.regionId ?? "19")} />
      ) : view === "analytics" ? (
        <>
          <p className="legend market-legend">Completed sales for orders listed at this settlement market, confirmed from BitJita trade records.</p>
          <div className="metric-grid market-analytics-metrics">
            <MiniStat icon={<CheckCircle2 />} label="Confirmed Sales" value={formatNumber(confirmedSales)} />
            <MiniStat icon={<Package />} label="Units Sold" value={formatNumber(unitsSold)} />
            <MiniStat icon={<CircleDollarSign />} label="Sales Revenue" value={`${formatNumber(confirmedRevenue)}g`} />
            <MiniStat icon={<TrendingUp />} label="Average Sale Value" value={`${formatNumber(averageSaleValue)}g`} />
          </div>
          <div className="two-col market-analytics">
            <section>
              <h3><Star size={17} /> Best Sellers</h3>
              <p className="legend">Ranked by units sold in API-confirmed sales.</p>
              <DataTable rows={topItems} columns={[
                ["Item", r => <ItemLabel item={{ ...marketItemMeta.get(String(r.itemName)), name: r.itemName, itemName: r.itemName }} name={r.itemName} />],
                ["Units Sold", r => formatNumber(r.unitsSold)],
                ["Sales", r => formatNumber(r.salesCount)],
                ["Revenue", r => `${formatNumber(r.totalValue)}g`],
                ["Avg Unit Price", r => `${formatNumber(r.avgUnitPrice)}g`],
                ["Last Trade", r => dateLabel(r.lastSoldAt)],
              ]} />
            </section>
            <section>
              <h3><TrendingUp size={17} /> Revenue By Day</h3>
              <p className="legend">{trendRange}. Confirmed sales only; bar length represents revenue.</p>
              <div className="daily-sales">
                {daily.length ? daily.map((row: AnyRecord) => (
                  <div className="daily-sale-row" key={row.day}>
                    <span>{formatMarketDay(row.day)}</span>
                    <div className="daily-sale-bar"><i style={{ width: `${(toNumber(row.totalValue) / maxDailyValue) * 100}%` }} /></div>
                    <strong>{formatNumber(row.totalValue)}g</strong>
                    <small>{formatNumber(row.salesCount)} sale{row.salesCount === 1 ? "" : "s"} - {formatNumber(row.unitsSold)} units</small>
                  </div>
                )) : <p className="legend">No API-confirmed sales found for this selection.</p>}
              </div>
            </section>
          </div>
          <section className="market-section">
            <h3><CheckCircle2 size={17} /> Recent Confirmed Sales</h3>
            <p className="legend">Imported completed sales retained in this monitor's history for the selected current settlement member(s).</p>
            <DataTable rows={apiTrades} columns={[
              ["When", r => dateLabel(r.timestamp ?? r.createdAt)],
              ["Item", r => <ItemLabel item={r} name={r.itemName ?? "-"} />],
              ["Tier", r => r.itemTier ? <TierBadge tier={r.itemTier} /> : "-"],
              ["Qty", r => formatNumber(r.quantity)],
              ["Unit Price", r => `${formatNumber(r.unitPrice)}g`],
              ["Value", r => `${formatNumber(r.totalPrice)}g`],
              ["Seller", r => r.sellerUsername ?? "-"],
              ["Buyer", r => r.purchaserUsername ?? r.buyerUsername ?? "-"],
            ]} />
          </section>
        </>
      ) : (
        <>
      <div className="market-live-grid">
        <MiniStat icon={<ShoppingCart />} label="Visible Listings" value={all.length} />
        <MiniStat icon={<TrendingDown />} label="Sell Orders" value={sellOrders.length || all.length} />
        <MiniStat icon={<TrendingUp />} label="Buy Orders" value={buyOrders.length} />
        <MiniStat icon={<CircleDollarSign />} label="Top Value" value={highest[0] ? `${formatNumber(toNumber(highest[0].price) * toNumber(highest[0].quantity || 1))}g` : "-"} />
      </div>
      <div className="highlight-grid market-highlights">{highest.map((listing) => <div key={listing.entityId ?? listing.itemName}><ItemLabel item={{ ...listing, name: listing.itemName }} name={listing.itemName} /><span>{formatNumber(toNumber(listing.price) * toNumber(listing.quantity || 1))}g - {formatNumber(listing.price)}g ea</span></div>)}</div>
      <section className="production-command-panel market-filter-panel">
        <div className="market-command-header">
          <span className="production-command-title"><Search size={15} /> Listing filters</span>
          <span>{formatNumber(rows.length)} visible rows</span>
        </div>
        <div className="market-filter-grid">
          <label className="research-filter-field">
            <span>Search</span>
            <SearchBox value={q} onChange={setQ} placeholder="Search market" />
          </label>
          <label className="research-filter-field">
            <span>Order Type</span>
            <div className="segmented market-order-tabs"><button className={tab === "sell" ? "active" : ""} onClick={() => setTab("sell")}><TrendingDown size={15} /> Sell</button><button className={tab === "buy" ? "active" : ""} onClick={() => setTab("buy")}><TrendingUp size={15} /> Buy</button></div>
          </label>
          <label className="research-filter-field">
            <span>Tier</span>
            <select className="select-control" value={tier} onChange={(event) => setTier(event.target.value)}><option>All</option>{tiers.map((value) => <option key={value}>{value}</option>)}</select>
          </label>
          <label className="research-filter-field">
            <span>Rarity</span>
            <select className="select-control" value={rarity} onChange={(event) => setRarity(event.target.value)}><option>All</option>{rarities.map((value) => <option key={value}>{value}</option>)}</select>
          </label>
        </div>
      </section>
      <DataTable rows={rows} columns={[
        ["Item", r => <ItemLabel item={{ ...r, name: r.itemName }} name={r.itemName ?? "Unknown"} />],
        ["Side", r => <span className={`pill ${String(r.side ?? r.orderType).includes("buy") ? "buy" : "sell"}`}>{r.side ?? r.orderType ?? "sell"}</span>],
        ["Qty", r => formatNumber(r.quantity)],
          ["Unit Price", r => `${formatNumber(r.price)}g`],
          ["Total Price", r => `${formatNumber(r.totalValue ?? r.total_value ?? (toNumber(r.price) * toNumber(r.quantity)))}g`],
          ["Tier", r => (r.itemTier ?? r.tier) ? <TierBadge tier={r.itemTier ?? r.tier} /> : "-"],
        ["Rarity", r => (r.itemRarityStr ?? r.rarity) ? <RarityBadge rarity={r.itemRarityStr ?? r.rarity} /> : "-"],
        ["Owner", r => <TrackedOwnerName name={r.ownerUsername ?? "-"} claim={data.claim} />],
        ["Listed", r => listingListedAt(r) ? dateLabel(listingListedAt(r)) : "-"],
        ["Live", r => liveDaysSince(listingListedAt(r))],
      ]} />
        </>
      )}
    </div>
  );
}

function PriceFinder({ monitoredRegionId }: { monitoredRegionId: string }) {
  const defaultRegion = monitoredRegionId || "All";
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<AnyRecord[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<AnyRecord | null>(null);
  const [searchState, setSearchState] = React.useState<"idle" | "loading" | "error">("idle");
  const [regionChoice, setRegionChoice] = usePersistedState("market.price.region", defaultRegion);
  const activeRegions = useActiveRegions(monitoredRegionId);
  const [priceState, setPriceState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: false });
  const activeRegion = regionChoice === "All" ? "" : regionChoice;

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("item");
    const itemName = params.get("itemName");
    const itemType = params.get("itemType");
    const region = params.get("region");
    if (itemId && itemName) {
      setSelectedItem({ id: itemId, name: itemName, itemType: toNumber(itemType) });
      setQuery(itemName);
    }
    if (region) setRegionChoice(region === "all" ? "All" : region);
  }, [setRegionChoice]);

  React.useEffect(() => {
    if (query.trim().length < 2 || selectedItem?.name === query.trim()) {
      setSuggestions([]);
      setSearchState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchState("loading");
      fetch(`${API}/market?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market search HTTP ${response.status}`)))
        .then((payload) => {
          setSuggestions((payload.data?.items ?? []).filter(isMarketableItem).slice(0, 8));
          setSearchState("idle");
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setSearchState("error");
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedItem?.name]);

  React.useEffect(() => {
    if (!selectedItem) {
      setPriceState({ data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    const type = toNumber(selectedItem.itemType) === 1 ? "cargo" : "items";
    const regionParam = activeRegion ? `&regionId=${encodeURIComponent(activeRegion)}` : "";
    setPriceState((current) => ({ ...current, error: null, loading: true }));
    fetch(`${API}/market/${type}/${selectedItem.id}/price-history?bucket=1%20day&limit=30${regionParam}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`price history HTTP ${response.status}`)))
      .then((payload) => setPriceState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setPriceState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false });
      });
    return () => controller.abort();
  }, [selectedItem, activeRegion, regionChoice]);

  function chooseItem(item: AnyRecord) {
    setSelectedItem(item);
    setQuery(String(item.name));
    setSuggestions([]);
    updateQueryState({ item: String(item.id), itemName: String(item.name), itemType: String(item.itemType ?? 0), region: activeRegion || "all" });
    trackAnalyticsEvent("price_finder_search", { region: activeRegion ? "selected_region" : "all_regions" });
  }

  const stats = priceState.data?.priceStats ?? {};
  const suggestedWindow = stats.avg24h != null ? "Last 24 Hours" : stats.avg7d != null ? "Last 7 Days" : stats.avg30d != null ? "Last 30 Days" : "";
  const suggestedAverage = stats.avg24h ?? stats.avg7d ?? stats.avg30d;
  const suggestedPrice = suggestedAverage == null ? null : Math.max(1, Math.round(toNumber(suggestedAverage)));
  const tradeCount = toNumber(stats.totalTrades);
  const confidence = tradeCount >= 20 ? "High confidence" : tradeCount >= 5 ? "Medium confidence" : tradeCount > 0 ? "Low confidence" : "No sales data";
  const recentTrades: AnyRecord[] = priceState.data?.recentTrades ?? [];
  const regionOptions = activeRegionOptions(activeRegions, monitoredRegionId, activeRegion);
  const selectedRegion = activeRegion ? regionOptions.find((region) => region.regionId === activeRegion) : null;
  const regionLabel = activeRegion ? (selectedRegion?.name ? `${selectedRegion.name} (R${activeRegion})` : `R${activeRegion}`) : "All Regions";
  return (
    <section className="price-finder">
      <div className="market-command-header price-finder-header">
        <span className="production-command-title"><Search size={15} /> Price lookup</span>
        <span>{regionLabel} completed trades</span>
      </div>
      <div className="price-finder-controls">
        <label className="research-filter-field price-item-search">
          <span>Item</span>
          <div className="suggestion-anchor">
            <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedItem(null); }} placeholder="Start typing an item name" />
            {suggestions.length ? <div className="suggestion-menu">{suggestions.map((item) => (
              <button key={`${item.itemType}-${item.id}`} type="button" onClick={() => chooseItem(item)}>
                <ItemIcon item={item} />
                <strong>{item.name}</strong>
                {item.tier ? <TierBadge tier={item.tier} /> : null}
                <small className="item-meta-line">{item.rarityStr ? <RarityBadge rarity={item.rarityStr} /> : null}{item.tag ?? ""}</small>
              </button>
            ))}</div> : null}
          </div>
          {searchState === "loading" ? <small className="legend">Finding market items...</small> : null}
          {searchState === "error" ? <small className="legend">Unable to search items right now.</small> : null}
        </label>
        <label className="research-filter-field price-region-field">
          <span>Region</span>
          <select value={regionChoice} onChange={(event) => { setRegionChoice(event.target.value); updateQueryState({ region: event.target.value === "All" ? "all" : event.target.value }); trackAnalyticsEvent("price_finder_region_changed", { scope: event.target.value === "All" ? "all_regions" : "specific_region" }); }}>
            {regionOptions.map((region) => <option value={region.regionId} key={region.regionId}>{regionOptionLabel(region.regionId, regionOptions, monitoredRegionId)}</option>)}
            <option value="All">All Regions</option>
          </select>
        </label>
      </div>
      {!selectedItem ? <div className="empty-state price-empty"><CircleDollarSign />Choose an item to examine completed trade pricing.</div> : null}
      {selectedItem && priceState.loading && !priceState.data ? <div className="loading">Loading price history for {selectedItem.name}...</div> : null}
      {priceState.error ? <div className="error">Unable to load price history: {priceState.error}</div> : null}
      {selectedItem && priceState.data ? (
        <>
            <div className="price-finder-heading">
              <div><h3>{selectedItem.name}</h3><span>{regionLabel} market trade history</span></div>
              <div className="price-recommendation">
              <span>Suggested List Price</span>
              <strong>{suggestedPrice == null ? "-" : `${formatNumber(suggestedPrice)}g`}</strong>
                <small>{suggestedWindow ? `Based on ${suggestedWindow.toLowerCase()} average` : "No completed trades in this selection"}</small>
              </div>
            </div>
            <div className="metric-grid">
            <MiniStat icon={<Activity />} label="Last 24 Hours" value={stats.avg24h == null ? "-" : `${formatNumber(Math.round(stats.avg24h))}g`} title="Average completed-trade unit price during the last 24 hours." />
            <MiniStat icon={<TrendingUp />} label="Last 7 Days" value={stats.avg7d == null ? "-" : `${formatNumber(Math.round(stats.avg7d))}g`} />
            <MiniStat icon={<CircleDollarSign />} label="Last 30 Days" value={stats.avg30d == null ? "-" : `${formatNumber(Math.round(stats.avg30d))}g`} />
            <MiniStat icon={<ShoppingCart />} label="Trade Volume" value={formatNumber(stats.totalVolume)} />
            <MiniStat icon={<CheckCircle2 />} label="Price Confidence" value={confidence} />
          </div>
          <p className="legend">Suggested price follows the most recent available completed-trade average and is rounded to whole gold. Review recent trades and active listings before posting.</p>
          <section>
            <h3><ShoppingBag size={17} /> Recent Trades <small>{formatNumber(stats.totalTrades)} total trades</small></h3>
            <DataTable rows={recentTrades.slice(0, 15)} columns={[
              ["When", row => dateLabel(row.timestamp ?? row.createdAt)],
              ["Unit Price", row => `${formatNumber(row.unitPrice ?? row.price)}g`],
              ["Quantity", row => formatNumber(row.quantity)],
              ["Value", row => `${formatNumber(row.totalPrice ?? row.total_value ?? toNumber(row.quantity) * toNumber(row.unitPrice))}g`],
              ["Seller", row => row.sellerUsername ?? "-"],
              ["Buyer", row => row.purchaserUsername ?? row.buyerUsername ?? "-"],
            ]} />
          </section>
        </>
      ) : null}
    </section>
  );
}

function BuyOrderFinder({ monitoredRegionId }: { monitoredRegionId: string }) {
  const defaultRegion = monitoredRegionId || "All";
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<AnyRecord[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<AnyRecord | null>(null);
  const [searchState, setSearchState] = React.useState<"idle" | "loading" | "error">("idle");
  const [regionChoice, setRegionChoice] = usePersistedState("market.buyOrders.region", defaultRegion);
  const activeRegions = useActiveRegions(monitoredRegionId);
  const [orderState, setOrderState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: false });
  const activeRegion = regionChoice === "All" ? "" : regionChoice;

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get("buyItem");
    const itemName = params.get("buyItemName");
    const itemType = params.get("buyItemType");
    const region = params.get("buyRegion");
    if (itemId && itemName) {
      setSelectedItem({ id: itemId, name: itemName, itemType: toNumber(itemType) });
      setQuery(itemName);
    }
    if (region) setRegionChoice(region === "all" ? "All" : region);
  }, [setRegionChoice]);

  React.useEffect(() => {
    if (query.trim().length < 2 || selectedItem?.name === query.trim()) {
      setSuggestions([]);
      setSearchState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchState("loading");
      fetch(`${API}/market?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`market search HTTP ${response.status}`)))
        .then((payload) => {
          const items: AnyRecord[] = payload.data?.items ?? [];
          setSuggestions(items.filter((item) => String(item.name ?? "").toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8));
          setSearchState("idle");
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setSearchState("error");
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedItem?.name]);

  React.useEffect(() => {
    if (!selectedItem) {
      setOrderState({ data: null, error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    const type = toNumber(selectedItem.itemType) === 1 ? "cargo" : "items";
    const regionParam = activeRegion ? `?regionId=${encodeURIComponent(activeRegion)}` : "";
    setOrderState((current) => ({ ...current, error: null, loading: true }));
    fetch(`${API}/market/${type}/${selectedItem.id}${regionParam}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`buy orders HTTP ${response.status}`)))
      .then((payload) => setOrderState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setOrderState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false });
      });
    return () => controller.abort();
  }, [selectedItem, activeRegion]);

  function chooseItem(item: AnyRecord) {
    setSelectedItem(item);
    setQuery(String(item.name));
    setSuggestions([]);
    updateQueryState({
      tab: "buy-orders",
      buyItem: String(item.id),
      buyItemName: String(item.name),
      buyItemType: String(item.itemType ?? 0),
      buyRegion: activeRegion || "all",
    });
    trackAnalyticsEvent("buy_order_finder_search", { region: activeRegion ? "selected_region" : "all_regions" });
  }

  const regionOptions = activeRegionOptions(activeRegions, monitoredRegionId, activeRegion);
  const orders = sortBuyOrdersByBestPrice((orderState.data?.buyOrders ?? [])
    .map((order: AnyRecord) => normalizeBuyOrder(order, toNumber(selectedItem?.itemType)))
    .filter((order: ReturnType<typeof normalizeBuyOrder>) => !activeRegion || String(order.regionId) === String(activeRegion)));
  const bestOrder = orders[0];
  const largestVolume = [...orders].sort((a, b) => b.quantity - a.quantity || b.unitPrice - a.unitPrice)[0];
  const totalDemand = orders.reduce((total, order) => total + order.quantity, 0);
  const totalValue = orders.reduce((total, order) => total + order.totalValue, 0);
  const marketCount = new Set(orders.map((order) => order.claimEntityId || order.claimName)).size;
  const selectedRegion = activeRegion ? regionOptions.find((region) => region.regionId === activeRegion) : null;
  const regionLabel = activeRegion ? (selectedRegion?.name ? `${selectedRegion.name} (R${activeRegion})` : `R${activeRegion}`) : "All Regions";

  return (
    <section className="price-finder buy-order-finder">
      <div className="market-command-header price-finder-header">
        <span className="production-command-title"><ShoppingBag size={15} /> Buy order lookup</span>
        <span>{regionLabel} active buy orders</span>
      </div>
      <div className="price-finder-controls">
        <label className="research-filter-field price-item-search">
          <span>Item</span>
          <div className="suggestion-anchor">
            <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedItem(null); }} placeholder="Start typing an item name" />
            {suggestions.length ? <div className="suggestion-menu">{suggestions.map((item) => (
              <button key={`${item.itemType}-${item.id}`} type="button" onClick={() => chooseItem(item)}>
                <ItemIcon item={item} />
                <strong>{item.name}</strong>
                {item.tier ? <TierBadge tier={item.tier} /> : null}
                <small className="item-meta-line">{item.rarityStr ? <RarityBadge rarity={item.rarityStr} /> : null}{item.tag ?? ""}</small>
              </button>
            ))}</div> : null}
          </div>
          {searchState === "loading" ? <small className="legend">Finding market items...</small> : null}
          {searchState === "error" ? <small className="legend">Unable to search items right now.</small> : null}
        </label>
        <label className="research-filter-field price-region-field">
          <span>Region</span>
          <select value={regionChoice} onChange={(event) => { setRegionChoice(event.target.value); updateQueryState({ buyRegion: event.target.value === "All" ? "all" : event.target.value }); }}>
            {regionOptions.map((region) => <option value={region.regionId} key={region.regionId}>{regionOptionLabel(region.regionId, regionOptions, monitoredRegionId)}</option>)}
            <option value="All">All Regions</option>
          </select>
        </label>
      </div>
      {!selectedItem ? <div className="empty-state price-empty"><ShoppingBag />Choose an item to find active buy orders.</div> : null}
      {selectedItem && orderState.loading && !orderState.data ? <div className="loading">Loading buy orders for {selectedItem.name}...</div> : null}
      {orderState.error ? <div className="error">Unable to load buy orders: {orderState.error}</div> : null}
      {selectedItem && orderState.data ? (
        <>
          <div className="price-finder-heading">
            <div><h3>{selectedItem.name}</h3><span>{regionLabel} current demand</span></div>
            <div className="price-recommendation">
              <span>Best Unit Price</span>
              <strong>{bestOrder ? `${formatNumber(bestOrder.unitPrice)}g` : "-"}</strong>
              <small>{bestOrder ? `${bestOrder.claimName} - ${bestOrder.ownerUsername}` : "No active buy orders"}</small>
            </div>
          </div>
          <div className="metric-grid">
            <MiniStat icon={<CircleDollarSign />} label="Best Unit Price" value={bestOrder ? `${formatNumber(bestOrder.unitPrice)}g` : "-"} />
            <MiniStat icon={<Package />} label="Total Demand" value={formatNumber(totalDemand)} />
            <MiniStat icon={<TrendingUp />} label="Total Buy Value" value={`${formatCompactNumber(totalValue)}g`} />
            <MiniStat icon={<ShoppingCart />} label="Markets With Orders" value={formatNumber(marketCount)} />
            <MiniStat icon={<ShoppingBag />} label="Most Volume" value={largestVolume ? `${formatNumber(largestVolume.quantity)} units` : "-"} />
          </div>
          <section>
            <h3><ShoppingBag size={17} /> Active Buy Orders <small>{formatNumber(orders.length)} order{orders.length === 1 ? "" : "s"}</small></h3>
            {orders.length ? (
              <DataTable rows={orders} columns={[
                ["Settlement", row => <div><strong>{row.claimName}</strong><small className="table-subline">{row.regionName || (row.regionId ? `R${row.regionId}` : "")}</small></div>],
                ["Buyer", row => row.ownerUsername],
                ["Qty", row => formatNumber(row.quantity)],
                ["Unit Price", row => `${formatNumber(row.unitPrice)}g`],
                ["Total Value", row => `${formatNumber(row.totalValue)}g`],
                ["Stored Coins", row => `${formatNumber(row.storedCoins)}g`],
                ["Listed", row => row.listedAt ? dateLabel(row.listedAt) : "-"],
                ["Live", row => {
                  const age = buyOrderAgeDays(row as ReturnType<typeof normalizeBuyOrder>);
                  return age == null ? "-" : age === 0 ? "Today" : `${age}d`;
                }],
              ]} />
            ) : <div className="empty-state price-empty"><ShoppingBag />No active buy orders found for this item in {regionLabel}.</div>}
          </section>
        </>
      ) : null}
    </section>
  );
}

function buildMarketTopItems(events: AnyRecord[]) {
  const grouped = new Map<string, { itemName: string; salesCount: number; unitsSold: number; totalValue: number; lastSoldAt: string }>();
  for (const event of events) {
    const itemName = String(event.item_name ?? event.itemName ?? "Unknown Item");
    const current = grouped.get(itemName) ?? { itemName, salesCount: 0, unitsSold: 0, totalValue: 0, lastSoldAt: "" };
    current.salesCount += 1;
    current.unitsSold += toNumber(event.quantity);
    current.totalValue += toNumber(event.total_value ?? event.totalValue);
    current.lastSoldAt = String(current.lastSoldAt && current.lastSoldAt > String(event.occurred_at) ? current.lastSoldAt : event.occurred_at ?? "");
    grouped.set(itemName, current);
  }
  return [...grouped.values()]
    .map((item) => ({ ...item, avgUnitPrice: item.unitsSold ? item.totalValue / item.unitsSold : 0 }))
    .sort((a, b) => b.unitsSold - a.unitsSold || b.totalValue - a.totalValue)
    .slice(0, 20);
}

function buildMarketDaily(events: AnyRecord[]) {
  const grouped = new Map<string, { day: string; salesCount: number; unitsSold: number; totalValue: number }>();
  for (const event of events) {
    const occurredAt = event.occurred_at ?? event.occurredAt;
    const parsed = parseDateValue(occurredAt);
    const day = parsed ? parsed.toISOString().slice(0, 10) : String(occurredAt ?? "").slice(0, 10) || "Unknown";
    const current = grouped.get(day) ?? { day, salesCount: 0, unitsSold: 0, totalValue: 0 };
    current.salesCount += 1;
    current.unitsSold += toNumber(event.quantity);
    current.totalValue += toNumber(event.total_value ?? event.totalValue);
    grouped.set(day, current);
  }
  return [...grouped.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-30);
}

function formatMarketDay(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function PublicCraftFinder({ refreshToken, monitoredRegionId, monitoredOwnerName, defaultRegionId, onShowMap }: { refreshToken: number; monitoredRegionId: string; monitoredOwnerName?: string; defaultRegionId?: string; onShowMap: (focus: NonNullable<MapFocus>) => void }) {
  type PublicCraftSortKey = "output" | "tier" | "settlement" | "required" | "remaining" | "availableXp" | "owner";
  const [skillId, setSkillId] = usePersistedState("public-crafts.skill", "All");
  const [regionId, setRegionId] = usePersistedState("public-crafts.region", defaultRegionId || monitoredRegionId || "All");
  const activeRegions = useActiveRegions(monitoredRegionId);
  const [sortKey, setSortKey] = usePersistedState<PublicCraftSortKey>("public-crafts.sort", "remaining");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("public-crafts.direction", "desc");
  const hasSavedRegion = React.useRef(hasPersistedState("public-crafts.region"));
  const [state, setState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: true });
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("skill")) setSkillId(params.get("skill")!);
    if (params.get("region")) setRegionId(params.get("region")!);
  }, [setRegionId, setSkillId]);
  React.useEffect(() => {
    const preferredRegion = defaultRegionId || monitoredRegionId;
    if (!hasSavedRegion.current && preferredRegion && regionId === "All") {
      hasSavedRegion.current = true;
      setRegionId(preferredRegion);
    }
  }, [defaultRegionId, monitoredRegionId, regionId, setRegionId]);
  React.useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true, error: null }));
    const skillQuery = skillId === "All" ? "" : `&skillId=${encodeURIComponent(skillId)}`;
    fetch(`${API}/crafts?completed=false${skillQuery}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`crafts HTTP ${response.status}`)))
      .then((payload) => setState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setState((previous) => ({ ...previous, error: error instanceof Error ? error.message : String(error), loading: false }));
      });
    return () => controller.abort();
  }, [skillId, refreshToken]);
  const jobs: AnyRecord[] = state.data?.craftResults ?? [];
  const itemLookup = new Map([...(state.data?.items ?? []), ...(state.data?.cargos ?? [])].map((item: AnyRecord) => [String(item.id), item]));
  const publicJobs: AnyRecord[] = jobs.filter((job) => job.isPublic === true && !job.completed).map((job): AnyRecord => {
    const progress = toNumber(job.progress);
    const total = toNumber(job.totalActionsRequired);
    const remaining = Math.max(0, total - progress);
    const requiredSkillId = toNumber(job.levelRequirements?.[0]?.skill_id ?? job.experiencePerProgress?.[0]?.skill_id);
    const experience = toNumber(job.experiencePerProgress?.find((xp: AnyRecord) => toNumber(xp.skill_id) === requiredSkillId)?.quantity ?? job.experiencePerProgress?.[0]?.quantity);
    const item = itemLookup.get(String(job.craftedItem?.[0]?.item_id));
    return {
      ...job,
      output: item?.name ?? `Recipe #${job.recipeId ?? "?"}`,
      tier: item?.tier ?? job.tier,
      remaining,
      experience,
      availableXp: remaining * experience,
      requiredSkillId,
      requiredSkillName: SKILL_NAMES[requiredSkillId] ?? `Skill ${requiredSkillId}`,
      minimumLevel: toNumber(job.levelRequirements?.find((requirement: AnyRecord) => toNumber(requirement.skill_id) === requiredSkillId)?.level ?? job.levelRequirements?.[0]?.level),
    };
  }).filter((job) => job.remaining > 0);
  const regions = activeRegionOptions(activeRegions, monitoredRegionId, regionId === "All" ? "" : regionId);
  const filteredJobs = publicJobs
    .filter((job) => regionId === "All" || String(job.regionId) === regionId)
    .sort((a, b) => {
      const values: Record<PublicCraftSortKey, (job: AnyRecord) => string | number> = {
        output: (job) => String(job.output ?? ""),
        tier: (job) => toNumber(job.tier),
        settlement: (job) => String(job.claimName ?? ""),
        required: (job) => toNumber(job.minimumLevel),
        remaining: (job) => toNumber(job.remaining),
        availableXp: (job) => toNumber(job.availableXp),
        owner: (job) => String(job.ownerUsername ?? ""),
      };
      const left = values[sortKey](a);
      const right = values[sortKey](b);
      const result = typeof left === "string" || typeof right === "string"
        ? String(left).localeCompare(String(right))
        : Number(left) - Number(right);
      return sortDir === "asc" ? result : -result;
    });
  const visibleJobs = filteredJobs.slice(0, 100);
  const skillName = skillId === "All" ? "All Skills" : SKILL_NAMES[toNumber(skillId)] ?? "Selected skill";
  const highestTier = Math.max(...filteredJobs.map((job) => toNumber(job.tier)), 0);
  const totalAvailableXp = filteredJobs.reduce((sum, job) => sum + toNumber(job.availableXp), 0);
  const activeSettlements = new Set(filteredJobs.map((job) => String(job.claimName ?? job.claimEntityId ?? "")).filter(Boolean)).size;
  function changeSort(nextKey: PublicCraftSortKey) {
    if (nextKey === sortKey) setSortDir((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(nextKey);
      setSortDir(["output", "settlement", "owner"].includes(nextKey) ? "asc" : "desc");
    }
  }
  const columns: Array<[string, PublicCraftSortKey, (job: AnyRecord) => React.ReactNode]> = [
    ["Craft", "output", (job) => <><strong>{job.output}</strong><small className="muted-line">{job.buildingName}</small></>],
    ["Tier", "tier", (job) => job.tier ? <TierBadge tier={job.tier} /> : "-"],
    ["Settlement", "settlement", (job) => <><strong>{job.claimName ?? "Unknown"}</strong>{job.claimLocationX != null && job.claimLocationZ != null ? <button className="map-location-link" onClick={() => { trackAnalyticsEvent("public_craft_map_opened"); onShowMap({ name: `${job.claimName ?? "Public craft"} - ${job.output}`, locationX: toNumber(job.claimLocationX), locationZ: toNumber(job.claimLocationZ) }); }}><MapPin size={12} />R{job.regionId} - {job.claimLocationX}, {job.claimLocationZ}</button> : null}</>],
    ["Required", "required", (job) => `${job.requiredSkillName} Lv ${job.minimumLevel}+`],
    ["Effort to Craft", "remaining", (job) => formatNumber(job.remaining)],
    ["XP Available", "availableXp", (job) => formatNumber(job.availableXp)],
    ["Owner", "owner", (job) => <TrackedOwnerName name={job.ownerUsername ?? "-"} claim={{ ownerPlayerUsername: monitoredOwnerName }} />],
  ];
  return (
    <section className="public-craft-finder">
      <header className="members-topbar public-craft-topbar">
        <div>
          <h2>Public Craft Finder</h2>
          <p>{state.loading && !state.data ? "Loading public jobs..." : `${skillName} - ${formatNumber(filteredJobs.length)} public job${filteredJobs.length === 1 ? "" : "s"}${filteredJobs.length > visibleJobs.length ? ` - top ${visibleJobs.length} shown` : ""}`}</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Search size={14} /> {skillName}</span>
            <span>{regionId === "All" ? "All regions" : `R${regionId}`}</span>
          </div>
          <div className="dashboard-settlement-pill">
            {highestTier ? <TierBadge tier={highestTier} /> : <span className="status-pill">No tier</span>}
            <span>Highest public craft tier</span>
          </div>
        </div>
      </header>
      <div className="summary-grid public-craft-summary">
        <MiniStat icon={<Factory />} label="Public Jobs" value={formatNumber(filteredJobs.length)} />
        <MiniStat icon={<Globe2 />} label="Settlements" value={formatNumber(activeSettlements)} />
        <MiniStat icon={<GraduationCap />} label="Skill Filter" value={skillName} />
        <MiniStat icon={<TrendingUp />} label="XP Available" value={formatNumber(totalAvailableXp)} />
      </div>
      <div className="production-command-panel public-craft-command-panel">
        <div className="production-command-main">
          <span className="production-command-title"><Search size={15} /> Craft filters</span>
          <label className="inline-field"><span>Skill</span>
            <select className="select-control" value={skillId} onChange={(event) => { setSkillId(event.target.value); updateQueryState({ skill: event.target.value }); trackAnalyticsEvent("public_craft_skill_filter_used", { scope: event.target.value === "All" ? "all_skills" : "specific_skill" }); }}>
              <option value="All">All Skills</option>
              {SKILL_IDS.map((id) => <option key={id} value={id}>{SKILL_NAMES[id]}</option>)}
            </select>
          </label>
          <label className="inline-field"><span>Region</span>
            <select className="select-control" value={regionId} onChange={(event) => { setRegionId(event.target.value); updateQueryState({ region: event.target.value }); trackAnalyticsEvent("public_craft_region_filter_used", { scope: event.target.value === "All" ? "all_regions" : "specific_region" }); }}>
              <option>All</option>{regions.map((region) => <option key={region.regionId} value={region.regionId}>{regionOptionLabel(region.regionId, regions, monitoredRegionId)}</option>)}
            </select>
          </label>
        </div>
        <div className="public-craft-hint">
          <MapPin size={13} />
          <span>Click a settlement location to open it on the map. Column headings sort the results.</span>
        </div>
      </div>
      {state.error ? <div className="error">Failed to load public crafts: {state.error}</div> : null}
      {!state.loading && !state.error && visibleJobs.length === 0 ? <div className="empty-state"><Factory />No public {skillName.toLowerCase()} jobs found.</div> : null}
      {visibleJobs.length ? <div className="table-wrap"><table><thead><tr>{columns.map(([label, key]) => <th key={key}><button className="sort-button" onClick={() => changeSort(key)}>{label}{sortKey === key ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} />}</button></th>)}</tr></thead><tbody>{visibleJobs.map((job, index) => <tr className="data-row" key={job.entityId ?? index}>{columns.map(([label, , render]) => <td key={label}>{render(job)}</td>)}</tr>)}</tbody></table></div> : null}
    </section>
  );
}

const ACTIVE_CRAFT_WINDOW_MS = 30 * 1000;

function hasRecentCraftContribution(contributors: AnyRecord[]): boolean {
  return contributors.some((person) => {
    const lastContribution = parseDateValue(person.lastContributedAt);
    if (!lastContribution) return false;
    const age = Date.now() - lastContribution.getTime();
    return age >= -5 * 1000 && age <= ACTIVE_CRAFT_WINDOW_MS;
  });
}

function craftProgressKey(job: AnyRecord): string {
  const entityId = String(job.entityId ?? "").trim();
  if (entityId) return `entity:${entityId}`;
  const structure = String(job.buildingEntityId ?? job.buildingId ?? job.buildingName ?? job.structureName ?? "").trim();
  const recipe = String(job.recipeId ?? job.recipeName ?? job.craftName ?? "").trim();
  const output = String(job.craftedItem?.[0]?.item_id ?? job.craftedItem?.[0]?.cargo_id ?? job.outputItemId ?? job.outputCargoId ?? "").trim();
  return `fallback:${structure}:${recipe}:${output}`;
}

function MemberPassiveCrafts({ members, refreshToken }: { members: AnyRecord[]; refreshToken: number }) {
  const [state, setState] = React.useState<LoadState<AnyRecord[]>>({ data: null, error: null, loading: true });
  const memberKey = members.map((member) => String(member.playerEntityId ?? "")).filter(Boolean).join(",");
  React.useEffect(() => {
    if (!memberKey) {
      setState({ data: [], error: null, loading: false });
      return;
    }
    const controller = new AbortController();
    setState((previous) => previous.data ? { ...previous, loading: true, error: null } : { data: null, error: null, loading: true });
    const memberEntries = members.filter((member) => member.playerEntityId);
    fetch(`${LOCAL_API}/passive-crafts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ members: memberEntries.map((member) => ({
        playerEntityId: member.playerEntityId,
        userName: member.userName ?? member.username,
      })) }),
      signal: controller.signal,
    }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`passive crafts HTTP ${response.status}`)))
      .then((payload) => {
      if (controller.signal.aborted) return;
      const rows = (payload.rows ?? []) as AnyRecord[];
      const failures = toNumber(payload.failed);
      setState({
        data: rows,
        error: failures ? `${failures} member${failures === 1 ? "" : "s"} could not be loaded.` : null,
        loading: false,
      });
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setState((previous) => ({
        data: previous.data ?? [],
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      }));
    });
    return () => controller.abort();
  }, [memberKey, refreshToken]);
  const rows = state.data ?? [];
  return (
    <section className="settlement-passive-crafts">
      <div className="split-header">
        <div className="dashboard-section-heading">
          <h3><Factory size={15} /> Member Passive Crafts</h3>
          <p>Recent public passive output for current settlement members. BitJita does not report craft location, so entries may have been performed elsewhere.</p>
        </div>
        {state.loading && rows.length ? <span className="refreshing-label">Updating...</span> : null}
      </div>
      {state.error ? <p className="legend">{state.error}</p> : null}
      {state.loading && !state.data ? <p className="legend">Loading passive craft history...</p> : null}
      {!state.loading && rows.length === 0 ? <div className="empty-state"><Factory />No passive craft history reported for settlement members.</div> : null}
      {rows.length ? <DataTable rows={rows} columns={[
        ["Output", (row) => <strong>{row.recipe}</strong>],
        ["Tier", (row) => row.tier ? <TierBadge tier={row.tier} /> : "-"],
        ["Member", (row) => row.memberName],
        ["Structure", (row) => row.structure],
        ["Status", (row) => <span className={`status-pill ${row.status === "complete" ? "complete" : ""}`}>{formatEquipmentSlot(row.status)}</span>],
        ["Quantity", (row) => formatNumber(row.quantity)],
        ["Latest", (row) => timeAgo(row.timestamp)],
      ]} /> : null}
    </section>
  );
}

function Production({ data, refreshToken, selectedMemberId, onSelectMember }: { data: ReturnType<typeof normalizeData> & { raw?: AnyRecord | null }; refreshToken: number; selectedMemberId: string; onSelectMember: (id: string) => void }) {
  type ProductionSortKey = "tier" | "totalXp" | "remainingXp" | "remainingEffort" | "completion" | "name";
  const [sortKey, setSortKey] = usePersistedState<ProductionSortKey>("production.sort", "tier");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("production.direction", "desc");
  const [showPrivateCrafts, setShowPrivateCrafts] = usePersistedState("production.showPrivateCrafts", true);
  const [toolbeltTools, setToolbeltTools] = React.useState<AnyRecord[] | null>(null);
  const [toolbeltError, setToolbeltError] = React.useState(false);
  const toolsForMemberRef = React.useRef<string | null>(null);
  const previousProgressRef = React.useRef<Map<string, number>>(new Map());
  const [movingCraftKeys, setMovingCraftKeys] = React.useState<Set<string>>(() => new Set());
  const itemLookup = new Map([...(data.raw?.crafts?.items ?? []), ...(data.raw?.crafts?.cargos ?? [])].map((i: AnyRecord) => [String(i.id), i]));
  const selectedMember = selectedMemberId === "All" ? null : data.members.find((member: AnyRecord) => String(member.playerEntityId) === selectedMemberId) ?? null;
  const selectedCitizen = selectedMember ? data.citizens.find((citizen: AnyRecord) => String(citizen.userName ?? citizen.username) === String(selectedMember.userName ?? selectedMember.username)) ?? null : null;
  React.useEffect(() => {
    if (!selectedMember?.playerEntityId) {
      setToolbeltTools(null);
      setToolbeltError(false);
      toolsForMemberRef.current = null;
      return;
    }
    const controller = new AbortController();
    const memberId = String(selectedMember.playerEntityId);
    if (toolsForMemberRef.current !== memberId) {
      toolsForMemberRef.current = memberId;
      setToolbeltTools(null);
    }
    setToolbeltError(false);
    fetch(`${API}/players/${memberId}/inventories`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`inventories HTTP ${response.status}`)))
      .then((payload) => setToolbeltTools(playerToolbeltTools(payload)))
      .catch(() => { if (!controller.signal.aborted) setToolbeltError(true); });
    return () => controller.abort();
  }, [selectedMember?.playerEntityId, refreshToken]);
  React.useEffect(() => {
    const previous = previousProgressRef.current;
    const nextProgress = new Map<string, number>();
    const moved = new Set<string>();
    for (const job of data.crafts) {
      const key = craftProgressKey(job);
      const progress = toNumber(job.progress);
      const prior = previous.get(key);
      if (prior != null && progress > prior) moved.add(key);
      nextProgress.set(key, progress);
    }
    previousProgressRef.current = nextProgress;
    setMovingCraftKeys(moved);
  }, [data.crafts, refreshToken]);
  function metrics(job: AnyRecord) {
    const item = itemLookup.get(String(job.craftedItem?.[0]?.item_id)) ?? {};
    const skillId = toNumber(job.levelRequirements?.[0]?.skill_id ?? job.experiencePerProgress?.[0]?.skill_id);
    const experiencePerEffort = toNumber(job.experiencePerProgress?.find((xp: AnyRecord) => toNumber(xp.skill_id) === skillId)?.quantity ?? job.experiencePerProgress?.[0]?.quantity);
    const total = toNumber(job.totalActionsRequired);
    const progress = toNumber(job.progress);
    const remaining = Math.max(0, total - progress);
    return {
      item,
      skillId,
      experiencePerEffort,
      total,
      progress,
      remaining,
      tier: toNumber(item.tier ?? job.tier),
      totalXp: total * experiencePerEffort,
      remainingXp: remaining * experiencePerEffort,
      completion: total > 0 ? progress / total : 0,
      name: String(item.name ?? job.recipeName ?? ""),
    };
  }
  function eligibility(job: AnyRecord) {
    if (!selectedMember) return null;
    const requirement = job.levelRequirements?.[0] ?? {};
    const requiredLevel = toNumber(requirement.level);
    const skillId = toNumber(requirement.skill_id);
    const skillName = SKILL_NAMES[skillId] ?? "Required skill";
    const memberLevel = toNumber(selectedCitizen?.skills?.[String(skillId)]);
    const skillOk = memberLevel >= requiredLevel;
    const toolRequirement = job.toolRequirements?.[0];
    const maxToolCraftTier = (item: AnyRecord) => toNumber(item.tier) + 1;
    const craftTier = toNumber(toolRequirement?.level);
    const expectedTool = toolRequirement ? TOOL_TAG_BY_TYPE[toNumber(toolRequirement.tool_type)] : null;
    const ownedTool = !toolRequirement ? null : (toolbeltTools ?? []).find((item) => {
      const correctType = toNumber(item.toolType) === toNumber(toolRequirement.tool_type) ||
        String(item.tags ?? item.tag ?? "") === expectedTool;
      return correctType && maxToolCraftTier(item) >= craftTier;
    });
    if (!skillOk) return { ok: false, text: `Needs ${skillName} Lv ${requiredLevel} (has ${memberLevel})` };
    if (toolbeltError && toolbeltTools == null) return { ok: false, pending: true, text: "Toolbelt unavailable" };
    if (toolRequirement && toolbeltTools == null) return { ok: false, pending: true, text: "Checking Toolbelt..." };
    if (toolRequirement && !ownedTool) return { ok: false, text: `Needs T${Math.max(1, craftTier - 1)}+ ${expectedTool ?? "required tool"} in Toolbelt` };
    return { ok: true, text: `Can craft - ${skillName} Lv ${memberLevel}${ownedTool ? ` - ${ownedTool.name} (${formatNumber(ownedTool.toolPower)} power)` : ""}` };
  }
  const privateCrafts = data.crafts.filter((job) => job.isPublic === false);
  const visibleCrafts = showPrivateCrafts ? data.crafts : data.crafts.filter((job) => job.isPublic !== false);
  function isCraftUiActive(job: AnyRecord) {
    const { total, progress } = metrics(job);
    if (total <= progress) return false;
    const contributors: AnyRecord[] = data.contributions[String(job.entityId)] ?? [];
    return hasRecentCraftContribution(contributors) || movingCraftKeys.has(craftProgressKey(job));
  }
  const jobs = [...visibleCrafts].sort((a, b) => {
    const aMetrics = metrics(a);
    const bMetrics = metrics(b);
    const activeComparison = Number(isCraftUiActive(b)) - Number(isCraftUiActive(a));
    if (activeComparison !== 0) return activeComparison;
    const aValue = sortKey === "remainingEffort" ? aMetrics.remaining : aMetrics[sortKey];
    const bValue = sortKey === "remainingEffort" ? bMetrics.remaining : bMetrics[sortKey];
    const comparison = sortKey === "name"
      ? String(aValue).localeCompare(String(bValue))
      : toNumber(aValue) - toNumber(bValue);
    if (comparison !== 0) return sortDir === "asc" ? comparison : -comparison;
    return bMetrics.completion - aMetrics.completion;
  });
  const crafterCounts = visibleCrafts.reduce<Record<string, number>>((acc, job) => {
    const name = String(job.ownerUsername ?? "Unknown");
    acc[name] = (acc[name] ?? 0) + 1;
    return acc;
  }, {});
  const activeJobs = jobs.filter((job) => {
    return isCraftUiActive(job);
  }).length;
  const totalProductionXp = jobs.reduce((sum, job) => sum + metrics(job).totalXp, 0);
  const remainingProductionXp = jobs.reduce((sum, job) => sum + metrics(job).remainingXp, 0);
  const highestTier = Math.max(...jobs.map((job) => metrics(job).tier), 0);

  return (
    <div className="panel production-page">
      <header className="members-topbar production-topbar">
        <div>
          <h2>Active Production</h2>
          <p>{visibleCrafts.length === 0 ? "No active crafting jobs" : `${activeJobs} active now - ${visibleCrafts.length} jobs across ${Object.keys(crafterCounts).length} crafters`}</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Factory size={14} /> {formatNumber(visibleCrafts.length)} shown</span>
            {privateCrafts.length ? <span><Lock size={14} /> {formatNumber(privateCrafts.length)} private</span> : null}
            <span>{formatNumber(Object.keys(crafterCounts).length)} crafters</span>
          </div>
          <div className="dashboard-settlement-pill">
            {highestTier ? <TierBadge tier={highestTier} /> : <span className="status-pill">No tier</span>}
            <span>Highest craft tier</span>
          </div>
        </div>
      </header>
      <div className="summary-grid production-summary">
        <MiniStat icon={<Factory />} label="Total Jobs" value={formatNumber(visibleCrafts.length)} />
        <MiniStat icon={<Activity />} label="Active Now" value={formatNumber(activeJobs)} />
        <MiniStat icon={<TrendingUp />} label="Total XP" value={formatNumber(totalProductionXp)} />
        <MiniStat icon={<Star />} label="XP Remaining" value={formatNumber(remainingProductionXp)} />
      </div>
      <div className="production-command-panel">
        <div className="production-command-main">
          <span className="production-command-title"><Wrench size={15} /> Production controls</span>
          <label className="inline-field"><span>Member</span>
            <select className="select-control" value={selectedMemberId} onChange={(event) => { onSelectMember(event.target.value); trackAnalyticsEvent("production_eligibility_filter_used", { scope: event.target.value === "All" ? "all_members" : "member" }); }}>
              <option value="All">All members</option>
              {data.members.map((member: AnyRecord) => <option key={member.playerEntityId} value={String(member.playerEntityId)}>{member.userName ?? member.username}</option>)}
            </select>
          </label>
          <label className="inline-field"><span>Sort by</span>
            <select className="select-control" value={sortKey} onChange={(event) => setSortKey(event.target.value as ProductionSortKey)}>
              <option value="tier">Tier</option>
              <option value="totalXp">Total XP</option>
              <option value="remainingXp">XP Remaining</option>
              <option value="remainingEffort">Effort Remaining</option>
              <option value="completion">Completion</option>
              <option value="name">Item Name</option>
            </select>
          </label>
          <Segmented options={["Descending", "Ascending"]} value={sortDir === "desc" ? "Descending" : "Ascending"} onChange={(direction) => setSortDir(direction === "Descending" ? "desc" : "asc")} label="Direction" />
          <label className="production-private-toggle"><span><Lock size={13} /> Show private crafts</span><input type="checkbox" checked={showPrivateCrafts} onChange={(event) => setShowPrivateCrafts(event.target.checked)} /></label>
        </div>
        {Object.keys(crafterCounts).length ? (
          <div className="production-crafter-line">
            <span>Current crafters</span>
            <div className="crafter-pills">
              {Object.entries(crafterCounts).map(([name, count]) => (
                <span key={name}>
                  <User size={12} />
                  <strong><TrackedOwnerName name={name} claim={data.claim} /></strong>
                  <small>{count}</small>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {selectedMember ? <div className="production-member-banner"><User size={15} /><span>Checking jobs for</span><strong><TrackedOwnerName name={selectedMember.userName ?? selectedMember.username} claim={data.claim} /></strong><small>Requires skill level and a suitable Toolbelt tool. A tool can craft one tier above its own tier; power controls effort per action.</small></div> : null}
      {data.crafts.length === 0 ? <div className="empty-state"><Factory />No crafting jobs are currently active.</div> : null}
      {data.crafts.length > 0 && visibleCrafts.length === 0 ? <div className="empty-state"><Lock />Private crafts are hidden by your Production controls.</div> : null}
      <div className="production-grid">
        {jobs.map((job, index) => {
          const first = job.craftedItem?.[0] ?? {};
          const { item, skillId, experiencePerEffort, total, progress, remaining, totalXp, remainingXp, tier } = metrics(job);
          const skillName = SKILL_NAMES[skillId] ?? job.levelRequirements?.[0]?.skillName ?? (skillId ? `Skill ${skillId}` : null);
          const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
          const contributors: AnyRecord[] = data.contributions[String(job.entityId)] ?? [];
          const isWorking = isCraftUiActive(job);
          const isDone = total > 0 && progress >= total;
          const status = isWorking ? "Active now" : isDone ? "Ready" : progress > 0 ? "Paused" : "Queued";
          const eligibilityStatus = eligibility(job);
          return (
            <article className={`production-card ${isWorking ? "active-work" : ""} ${eligibilityStatus?.ok ? "can-craft" : ""}`} key={job.entityId ?? index}>
              <header>
                <div><Factory size={15} /><strong>{job.buildingName ?? "Unknown Structure"}{job.isPublic === false ? <span className="private-craft-pill" title="Private craft. BitJita returned this through member craft data with isPublic false."><Lock size={11} /> Private</span> : null}</strong><span><TrackedOwnerName name={job.ownerUsername ?? "Unknown"} claim={data.claim} /></span></div>
                <p><span className={`status-pill ${isWorking ? "working" : ""}`}>{status}</span>{skillName ? <small>{skillName} Lv {job.levelRequirements?.[0]?.level ?? 1}+</small> : null}</p>
              </header>
              <section>
                <div className={`craft-title ${item?.iconAssetName ? "has-icon" : ""}`}>{item?.iconAssetName ? <ItemIcon item={item} /> : null}<h3>{item?.name ?? (skillName ? `${skillName} craft` : `Item #${first.item_id ?? "?"}`)}</h3>{tier ? <TierBadge tier={tier} /> : null}</div>
                {!item.name && job.recipeId ? <small>recipe #{job.recipeId}</small> : null}
                <div className="work-chips">
                  <span>{formatNumber(job.craftCount)} craft{toNumber(job.craftCount) === 1 ? "" : "s"}</span>
                  <span>{formatNumber(remaining)} effort to craft</span>
                  {experiencePerEffort ? <span>{formatNumber(totalXp)} total XP</span> : null}
                </div>
                <div className="progress-meta"><span>Effort applied</span><span>{formatNumber(progress)} / {formatNumber(total)}</span></div>
                <div className={`progress ${isWorking ? "is-moving" : ""}`}><div style={{ width: `${pct}%` }} /></div>
                <div className="progress-meta"><strong>{pct}%</strong><span>{experiencePerEffort ? `${formatNumber(remainingXp)} XP remaining` : "XP not provided"}</span></div>
                {eligibilityStatus ? <div className={`eligibility-pill ${eligibilityStatus.ok ? "eligible" : eligibilityStatus.pending ? "pending" : "blocked"}`}>{eligibilityStatus.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}{eligibilityStatus.text}</div> : null}
                {contributors.length ? (
                  <div className="contributors">
                    <small>Contributors</small>
                    {contributors.slice(0, 3).map((person) => (
                      <span key={person.contributorEntityId}><strong><TrackedOwnerName name={person.contributorUsername ?? "Unknown"} claim={data.claim} /></strong> {formatNumber(person.totalProgressContributed)} progress - {timeAgo(person.lastContributedAt)}</span>
                    ))}
                  </div>
                ) : <small>No contributions recorded by the API.</small>}
              </section>
            </article>
          );
        })}
      </div>
      <MemberPassiveCrafts members={data.members} refreshToken={refreshToken} />
    </div>
  );
}

function Leaderboard({ claimId, refreshToken }: { claimId: string; refreshToken: number }) {
  const [state, setState] = React.useState<LoadState<AnyRecord>>({ data: null, error: null, loading: true });
  const [professionFilter, setProfessionFilter] = React.useState("All");
  React.useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: null }));
    fetch(`${LOCAL_API}/leaderboard?claimId=${encodeURIComponent(claimId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`leaderboard HTTP ${response.status}`)))
      .then((payload) => setState({ data: payload, error: null, loading: false }))
      .catch((error) => {
        if (!controller.signal.aborted) setState({ data: null, error: error instanceof Error ? error.message : String(error), loading: false });
      });
    return () => controller.abort();
  }, [claimId, refreshToken]);
  const leaderboard = state.data ?? {};
  const summary = leaderboard.summary ?? {};
  const professions: AnyRecord[] = leaderboard.professions ?? [];
  const contributors: AnyRecord[] = leaderboard.contributors ?? [];
  const recent: AnyRecord[] = leaderboard.recent ?? [];
  const filteredContributors = professionFilter === "All"
    ? contributors
    : contributors.filter((entry) => entry.professions?.some?.((profession: AnyRecord) => profession.profession === professionFilter));
  const topContributor = contributors[0];
  const topProfession = professions[0];
  return (
    <div className="panel leaderboard-page">
      <header className="members-topbar leaderboard-topbar">
        <div>
          <h2>Contribution Leaderboard</h2>
          <p>Recorded craft contribution totals for the monitored settlement, grouped by member and profession.</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Trophy size={14} /> {formatNumber(summary.contributorCount)} contributors</span>
            <span><Factory size={14} /> {formatNumber(summary.recordedCrafts)} crafts</span>
            <span>{summary.lastContributedAt ? `Updated ${timeAgo(summary.lastContributedAt)}` : "No history yet"}</span>
          </div>
        </div>
      </header>
      <div className="summary-grid leaderboard-summary">
        <MiniStat icon={<Trophy />} label="Recorded Contribution" value={formatNumber(summary.totalProgress)} />
        <MiniStat icon={<TrendingUp />} label="Estimated XP" value={formatNumber(summary.totalXp)} />
        <MiniStat icon={<Users />} label="Top Contributor" value={topContributor?.name ?? "None yet"} />
        <MiniStat icon={<GraduationCap />} label="Top Profession" value={topProfession?.profession ?? "None yet"} />
      </div>
      <section className="dashboard-card leaderboard-card">
        <header className="dashboard-card-title">
          <span><Trophy size={14} /> Member standings</span>
          <label className="inline-field leaderboard-filter"><span>Profession</span>
            <select className="select-control" value={professionFilter} onChange={(event) => setProfessionFilter(event.target.value)}>
              <option value="All">All professions</option>
              {professions.map((profession) => <option key={profession.profession} value={profession.profession}>{profession.profession}</option>)}
            </select>
          </label>
        </header>
        {state.loading ? <div className="empty-state"><RefreshCw /> Loading contribution history...</div> : null}
        {state.error ? <div className="error">Failed to load leaderboard: {state.error}</div> : null}
        {!state.loading && !state.error && !contributors.length ? (
          <div className="empty-state"><Trophy />No craft contributions have been recorded yet. The leaderboard starts filling as settlement craft contribution data is observed during refreshes.</div>
        ) : null}
        {filteredContributors.length ? (
          <DataTable
            rows={filteredContributors}
            columns={[
              ["Member", (entry) => <strong>{entry.name}</strong>],
              ["Progress", (entry) => formatNumber(entry.totalProgress)],
              ["Estimated XP", (entry) => formatNumber(entry.totalXp)],
              ["Crafts", (entry) => formatNumber(entry.craftCount)],
              ["Top professions", (entry) => (
                <div className="leaderboard-profession-tags">
                {(entry.professions ?? []).slice(0, 3).map((profession: AnyRecord) => <span key={profession.profession}>{profession.profession} <b>{formatNumber(profession.progress)}</b></span>)}
                </div>
              )],
              ["Last contribution", (entry) => entry.lastContributedAt ? timeAgo(entry.lastContributedAt) : "Unknown"],
            ]}
          />
        ) : null}
      </section>
      <div className="leaderboard-grid">
        <section className="dashboard-card leaderboard-card">
          <header className="dashboard-card-title"><span><GraduationCap size={14} /> Profession totals</span></header>
          <div className="leaderboard-profession-list">
            {professions.map((profession) => (
              <article key={profession.profession}>
                <div>
                  <strong>{profession.profession}</strong>
                  <small>{formatNumber(profession.contributorCount)} contributor{toNumber(profession.contributorCount) === 1 ? "" : "s"} - {formatNumber(profession.craftCount)} craft records</small>
                </div>
                <span>{formatNumber(profession.totalProgress)}</span>
                <em>Top: {profession.topContributor || "Unknown"}</em>
              </article>
            ))}
            {!professions.length ? <div className="empty-state compact"><GraduationCap />No profession totals yet.</div> : null}
          </div>
        </section>
        <section className="dashboard-card leaderboard-card">
          <header className="dashboard-card-title"><span><Activity size={14} /> Recent recorded contributions</span></header>
          <div className="leaderboard-recent-list">
            {recent.slice(0, 12).map((entry, index) => (
              <article key={`${entry.contributorId}-${entry.craftLabel}-${index}`}>
                <span className="activity-dot" />
                <div>
                  <strong>{entry.contributorName}</strong>
                  <small>{entry.profession || "Unknown profession"} - {entry.craftLabel} at {entry.structureName}</small>
                </div>
                <span>{formatNumber(entry.totalProgress)}</span>
                <time>{entry.lastContributedAt ? timeAgo(entry.lastContributedAt) : "Unknown"}</time>
              </article>
            ))}
            {!recent.length ? <div className="empty-state compact"><Activity />No recent contribution rows yet.</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function bitcraftMapUrl(playerIds: string[], mapMarker: MapFocus, flyTo = false, resourceIds: string[] = [], regionIds: string[] = [], enemyIds: string[] = []) {
  const params = new URLSearchParams();
  const sortedPlayers = playerIds.filter(Boolean).sort();
  const sortedResources = resourceIds.filter(Boolean).sort((a, b) => toNumber(a) - toNumber(b));
  const sortedEnemies = enemyIds.filter(Boolean).sort((a, b) => toNumber(a) - toNumber(b));
  const sortedRegions = regionIds.filter(Boolean).sort((a, b) => toNumber(a) - toNumber(b));
  if (sortedPlayers.length) params.set("playerId", sortedPlayers.join(","));
  if (sortedResources.length) params.set("resourceId", sortedResources.join(","));
  if (sortedEnemies.length) params.set("enemyId", sortedEnemies.join(","));
  if (sortedRegions.length) params.set("regionId", sortedRegions.join(","));
  const queryString = params.toString().replaceAll("%2C", ",");
  const query = queryString ? `?${queryString}` : "";
  const waypoint = mapMarker ? {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        popupText: mapMarker.name,
        iconName: "waypoint",
        turnLayerOn: MAP_DEFAULT_LAYERS,
        ...(flyTo ? { flyTo: [mapMarker.locationZ, mapMarker.locationX], zoomTo: 2 } : { noPan: true }),
      },
      geometry: { type: "Point", coordinates: [mapMarker.locationX, mapMarker.locationZ] },
    }],
  } : null;
  return `https://bitcraftmap.com/${query}${waypoint ? `#${encodeURIComponent(JSON.stringify(waypoint))}` : ""}`;
}

function mapResourceToken(entry: AnyRecord): string {
  const kind = String(entry.mapKind ?? "resource");
  return kind === "enemy" ? `enemy:${entry.mapId ?? entry.enemyType ?? entry.id}` : `resource:${entry.mapId ?? entry.id}`;
}

function normalizeMapResourceToken(token: string): string {
  const value = String(token ?? "").trim();
  if (!value) return "";
  return value.includes(":") ? value : `resource:${value}`;
}

function mapResourceCategory(resource: AnyRecord): string {
  const tag = String(resource.tag ?? "");
  if (resource.mapKind === "enemy") return "Huntable Animal";
  if (MAP_CATEGORY_SET.has(tag)) return tag;
  return "";
}

function MapPanel({ data, focus, onClearFocus }: { data: ReturnType<typeof normalizeData>; focus: MapFocus; onClearFocus: () => void }) {
  const [selectedIds, setSelectedIds] = usePersistedState<string[] | null>("map.players", null);
  const [selectedResources, setSelectedResources] = usePersistedState<string[]>("map.resources", []);
  const [resourceSearch, setResourceSearch] = usePersistedState("map.resource-search", "");
  const [resourceTier, setResourceTier] = usePersistedState("map.resource-tier", "All");
  const [resourceCategory, setResourceCategory] = usePersistedState("map.resource-category", "All");
  const [resourceRegions, setResourceRegions] = usePersistedState<string[]>("map.regions", data.claim.regionId != null ? [String(data.claim.regionId)] : []);
  const [resourcePanelCollapsed, setResourcePanelCollapsed] = usePersistedState("map.resource-finder-collapsed", false);
  const [resources, setResources] = React.useState<AnyRecord[]>([]);
  const [resourceError, setResourceError] = React.useState("");
  const settlementRegionId = String(data.claim.regionId ?? "");
  const activeRegions = useActiveRegions(settlementRegionId);
  const roster = data.players;
  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`${LOCAL_API}/map/catalog`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`map catalog HTTP ${response.status}`)))
      .then((catalogPayload) => {
        const resourceRows: AnyRecord[] = unwrap<AnyRecord[]>(catalogPayload, "resources", [])
          .filter((resource) => resource?.id != null && resource?.name)
          .map((resource) => ({ ...resource, mapKind: "resource", mapId: String(resource.id), mapSortOrder: toNumber(resource.id) }));
        const creatureRows: AnyRecord[] = unwrap<AnyRecord[]>(catalogPayload, "creatures", [])
          .filter((creature) => creature?.enemyType != null && creature?.name && (creature.huntable === true || String(creature.tag ?? "").toLowerCase().includes("animal")))
          .map((creature) => ({ ...creature, id: `enemy:${creature.enemyType}`, mapKind: "enemy", mapId: String(creature.enemyType), mapSortOrder: 100000 + toNumber(creature.enemyType), tag: "Huntable Animal" }));
        setResources([...resourceRows, ...creatureRows].sort((a, b) => toNumber(a.mapSortOrder) - toNumber(b.mapSortOrder) || String(a.name).localeCompare(String(b.name))));
        setResourceError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResourceError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, []);
  const defaultSelection = React.useMemo(() => {
    const online = roster.filter((player) => player.signedIn).map((player) => String(player.entityId)).filter(Boolean);
    return new Set(online.length ? online : roster.map((player) => String(player.entityId)).filter(Boolean));
  }, [roster]);
  const current = React.useMemo(() => selectedIds === null ? defaultSelection : new Set(selectedIds), [defaultSelection, selectedIds]);
  const defaultFocus = data.claim.locationX != null && data.claim.locationZ != null ? {
    name: data.claim.name ?? "Monitored settlement",
    locationX: toNumber(data.claim.locationX),
    locationZ: toNumber(data.claim.locationZ),
  } : null;
  const normalizedSelectedResources = React.useMemo(() => selectedResources.map(normalizeMapResourceToken).filter(Boolean), [selectedResources]);
  const resourceByToken = React.useMemo(() => new Map(resources.map((resource) => [mapResourceToken(resource), resource])), [resources]);
  const resourceCategories = React.useMemo(() => MAP_CATEGORY_ORDER.filter((category) => resources.some((resource) => mapResourceCategory(resource) === category)), [resources]);
  const resourceTiers = React.useMemo(() => unique(resources.map((resource) => String(resource.tier ?? "")).filter(Boolean)).sort((a, b) => toNumber(a) - toNumber(b)), [resources]);
  const regionOptions = React.useMemo(() => activeRegionOptions(activeRegions, settlementRegionId, resourceRegions.length === 1 ? resourceRegions[0] : ""), [activeRegions, settlementRegionId, resourceRegions]);
  const mapMarker = focus ?? defaultFocus;
  const mapRegionIds = resourceRegions.length ? resourceRegions : regionOptions.map((region) => region.regionId);
  const selectedResourceIds = React.useMemo(() => normalizedSelectedResources.filter((token) => token.startsWith("resource:")).map((token) => token.slice("resource:".length)), [normalizedSelectedResources]);
  const selectedEnemyIds = React.useMemo(() => normalizedSelectedResources.filter((token) => token.startsWith("enemy:")).map((token) => token.slice("enemy:".length)), [normalizedSelectedResources]);
  const mapUrl = React.useMemo(() => bitcraftMapUrl([...current], mapMarker, Boolean(focus), selectedResourceIds, mapRegionIds, selectedEnemyIds), [current, focus, mapMarker, selectedResourceIds.join(","), selectedEnemyIds.join(","), mapRegionIds.join(",")]);
  const focusKey = focus ? `${focus.name}:${focus.locationX}:${focus.locationZ}` : "";
  React.useEffect(() => {
    if (focus) updateQueryState({ mapName: focus.name, mapX: String(focus.locationX), mapZ: String(focus.locationZ) });
  }, [focusKey]);
  const visibleResources = React.useMemo(() => {
    const query = resourceSearch.trim().toLowerCase();
    return resources.filter((resource) => {
      const name = String(resource.name ?? "");
      const tag = mapResourceCategory(resource);
      if (query && !`${name} ${tag}`.toLowerCase().includes(query)) return false;
      if (resourceTier !== "All" && String(resource.tier ?? "") !== resourceTier) return false;
      if (resourceCategory !== "All" && tag !== resourceCategory) return false;
      return true;
    }).sort((a, b) => {
      if (resourceCategory !== "All") return toNumber(a.tier) - toNumber(b.tier) || String(a.name).localeCompare(String(b.name));
      return toNumber(a.mapSortOrder) - toNumber(b.mapSortOrder) || String(a.name).localeCompare(String(b.name));
    });
  }, [resources, resourceSearch, resourceTier, resourceCategory]);
  function setResourceRegion(value: string) {
    setResourceRegions(value === "All" ? [] : [value]);
  }
  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev === null ? [...defaultSelection] : prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const nextIds = [...next].sort();
      return nextIds;
    });
  }
  function toggleResource(token: string) {
    const normalizedToken = normalizeMapResourceToken(token);
    setSelectedResources((prev) => {
      const next = new Set(prev.map(normalizeMapResourceToken).filter(Boolean));
      if (next.has(normalizedToken)) next.delete(normalizedToken);
      else next.add(normalizedToken);
      return [...next].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    });
  }
  function toggleAll() {
    const nextIds = current.size === roster.length ? [] : roster.map((player) => String(player.entityId)).filter(Boolean).sort();
    setSelectedIds(nextIds);
  }
  function resetMapFilters() {
    setSelectedIds(null);
    setSelectedResources([]);
    setResourceSearch("");
    setResourceTier("All");
    setResourceCategory("All");
    setResourceRegions(settlementRegionId ? [settlementRegionId] : []);
    onClearFocus();
  }
  const onlineCount = roster.filter((player) => player.signedIn).length;
  const currentFrameUrl = mapUrl;
  return (
    <div className={`panel map-panel full-height ${focus ? "has-focus" : ""}`}>
      <header className="members-topbar map-topbar">
        <div>
          <h2>World Map</h2>
          <p>Live player and resource tracking via bitcraftmap.com</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Users size={14} /> {formatNumber(onlineCount)} online</span>
            <span>{formatNumber(roster.length)} members total</span>
          </div>
          <a className="toolbar-button" href={currentFrameUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open full map</a>
        </div>
      </header>
      {focus ? (
        <div className="map-focus">
          <MapPin size={17} />
          <div><strong>{focus.name}</strong><span>{focus.locationX}, {focus.locationZ}</span></div>
          <button className="mini-action" onClick={onClearFocus}>Clear</button>
        </div>
      ) : null}
      <div className="player-pills">
        <button className={current.size === roster.length ? "active" : ""} onClick={toggleAll}>All</button>
        <button onClick={resetMapFilters}>Clear filters</button>
        {roster.map((player) => {
          const id = String(player.entityId);
          return <button key={id} className={current.has(id) ? "active" : ""} onClick={() => toggle(id)} title={player.signedIn ? `Online - ${formatDuration(player.sessionSeconds)}` : "Offline"}><span className={`online-dot ${player.signedIn ? "is-online" : ""}`} />{player.username}{current.has(id) ? <MapPin size={12} /> : null}</button>;
        })}
      </div>
      <div className={`map-workspace ${resourcePanelCollapsed ? "resources-collapsed" : ""}`}>
        <aside className={`map-resource-panel ${resourcePanelCollapsed ? "collapsed" : ""}`}>
          <div className="map-resource-heading">
            <Search size={16} />
            <div><strong>Resource Finder</strong><span>{selectedResources.length ? `${formatNumber(selectedResources.length)} tracked` : "Track resources on the map"}</span></div>
            <button className="icon-button" type="button" onClick={() => setResourcePanelCollapsed((current) => !current)} title={resourcePanelCollapsed ? "Expand resource finder" : "Collapse resource finder"} aria-label={resourcePanelCollapsed ? "Expand resource finder" : "Collapse resource finder"}>
              {resourcePanelCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
          </div>
          {!resourcePanelCollapsed ? <><div className="map-resource-controls">
            <label className="field"><span>Region</span><select className="select-control map-region-select" value={resourceRegions.length === 1 ? resourceRegions[0] : "All"} onChange={(event) => setResourceRegion(event.target.value)}><option value="All">All regions</option>{regionOptions.map((region) => <option key={region.regionId} value={region.regionId}>{regionOptionLabel(region.regionId, regionOptions, settlementRegionId)}</option>)}</select></label>
            <label className="field"><span>Tier</span><select className="select-control" value={resourceTier} onChange={(event) => setResourceTier(event.target.value)}><option>All</option>{resourceTiers.map((tier) => <option key={tier}>{tier}</option>)}</select></label>
            <label className="field"><span>Category</span><select className="select-control" value={resourceCategory} onChange={(event) => setResourceCategory(event.target.value)}><option>All</option>{resourceCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
            <SearchBox value={resourceSearch} onChange={setResourceSearch} placeholder="Find resources" />
          </div>
          {selectedResources.length ? (
            <div className="map-selected-resources">
              {selectedResources.map((id) => {
                const token = normalizeMapResourceToken(id);
                const resource = resourceByToken.get(token);
                return <button key={id} onClick={() => toggleResource(id)}>{resource?.name ?? `Resource ${id}`}<X size={12} /></button>;
              })}
            </div>
          ) : null}
          {resourceError ? <div className="error">Resources unavailable: {resourceError}</div> : null}
          <div className="map-resource-list">
            {visibleResources.map((resource) => {
              const id = mapResourceToken(resource);
              const active = normalizedSelectedResources.includes(id);
              const iconUrl = bitjitaIconUrl(resource);
              return <button key={id} className={active ? "active" : ""} onClick={() => toggleResource(id)}>
                <span className="map-resource-icon">{iconUrl ? <img src={iconUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <MapPin size={15} />}</span>
                <strong>{resource.name}</strong>
                {resource.tier != null ? <TierBadge tier={resource.tier} /> : null}
                <small>{resource.mapKind === "enemy" ? "Animal" : mapResourceCategory(resource) || resource.tag || "Resource"}</small>
              </button>;
            })}
            {!visibleResources.length ? <p className="legend">{resources.length ? "No resources match these filters." : "Loading resources from BitJita..."}</p> : null}
          </div></> : null}
        </aside>
        <iframe key={currentFrameUrl} className="map-frame" src={currentFrameUrl} title="BitCraft World Map" />
      </div>
    </div>
  );
}

function sanitizeActivityLog(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => String(item).replaceAll("\u00c2\u00b7", "-").replaceAll("\u00e2\u20ac\u201d", "-"))
    .filter((item) => !/changed from \d+ to 0$/.test(item) && !/changed from 0 to \d+$/.test(item))
    .slice(0, 100);
}

const ACTIVITY_FILTERS = [
  ["all", "All"],
  ["storage", "Storage"],
  ["treasury", "Treasury"],
  ["supplies", "Supplies"],
  ["market", "Market"],
  ["members", "Members"],
  ["buildings", "Structures"],
] as const;

function signedDelta(after: unknown, before: unknown, suffix = ""): string {
  const delta = toNumber(after) - toNumber(before);
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${formatNumber(Math.abs(delta))}${suffix}`;
}

function activitySummary(item: AnyRecord): string {
  if (item.event_type === "storage") return item.summary ?? "-";
  let metadata: AnyRecord = {};
  try {
    metadata = JSON.parse(item.metadata_json ?? item.metadataJson ?? "{}");
  } catch {
    metadata = {};
  }
  if (metadata.before != null && metadata.after != null) {
    if (item.event_type === "treasury") return `${signedDelta(metadata.after, metadata.before, "g")} to treasury`;
    if (item.event_type === "supplies") return `${signedDelta(metadata.after, metadata.before)} supplies`;
    if (item.event_type === "members") return `${signedDelta(metadata.after, metadata.before)} members`;
    if (item.event_type === "buildings") return `${signedDelta(metadata.after, metadata.before)} structures`;
    if (item.event_type === "market") return `${signedDelta(metadata.after, metadata.before)} market listings`;
  }
  return item.summary ?? "-";
}

function activityMetadata(item: AnyRecord): AnyRecord {
  try {
    return JSON.parse(item.metadata_json ?? item.metadataJson ?? "{}");
  } catch {
    return {};
  }
}

function activityActorName(item: AnyRecord): string {
  const metadata = activityMetadata(item);
  if (metadata.actorName) return String(metadata.actorName);
  if (!String(item.event_type ?? "").includes("market")) return "";
  return String(metadata.ownerUsername ?? metadata.owner ?? metadata.sellerUsername ?? "");
}

function activityContainerName(item: AnyRecord): string {
  return String(activityMetadata(item).containerName ?? "");
}

function activityStyle(item: AnyRecord): { label: string; tone: string; icon: React.ReactNode } {
  const eventType = String(item.event_type ?? "");
  if (eventType.includes("market")) return { label: "Market", tone: "market", icon: <ShoppingCart size={18} /> };
  switch (eventType) {
    case "storage": return { label: "Storage", tone: "storage", icon: <Box size={18} /> };
    case "treasury": return { label: "Treasury", tone: "treasury", icon: <CircleDollarSign size={18} /> };
    case "supplies": return { label: "Supplies", tone: "supplies", icon: <Package size={18} /> };
    case "members": return { label: "Members", tone: "members", icon: <Users size={18} /> };
    case "buildings": return { label: "Structures", tone: "buildings", icon: <Building2 size={18} /> };
    default: return { label: "Update", tone: "default", icon: <Activity size={18} /> };
  }
}

function ActivityPanel({ activity, activityTotal, claimId, error }: { activity: AnyRecord[]; activityTotal: number; claimId: string; error: string | null }) {
  const [filter, setFilter] = usePersistedState<(typeof ACTIVITY_FILTERS)[number][0]>("activity.filter", "all");
  const [memberFilter, setMemberFilter] = usePersistedState("activity.member", "All");
  const [compact, setCompact] = usePersistedState("activity.compact", true);
  const [members, setMembers] = React.useState<AnyRecord[]>([]);
  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/claims/${claimId}/members`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`members HTTP ${response.status}`)))
      .then((payload) => setMembers(unwrap<AnyRecord[]>(payload, "members", [])))
      .catch(() => undefined);
    return () => controller.abort();
  }, [claimId]);
  const combined = [...activity].sort((a, b) => timestampMs(b.occurred_at ?? b.occurredAt) - timestampMs(a.occurred_at ?? a.occurredAt) || toNumber(b.id) - toNumber(a.id));
  const memberOptions = unique(members.map((member) => String(member.userName ?? member.username ?? "")).filter(Boolean)).sort((a, b) => a.localeCompare(b));
  React.useEffect(() => {
    if (memberFilter !== "All" && !memberOptions.includes(memberFilter)) setMemberFilter("All");
  }, [memberFilter, memberOptions.join("|")]);
  const memberActivity = memberFilter === "All" ? combined : combined.filter((item) => activityActorName(item).toLowerCase() === memberFilter.toLowerCase());
  const baseFiltered = filter === "all" ? memberActivity : memberActivity.filter((item) => String(item.event_type ?? "").includes(filter));
  const filtered = compact ? compactActivity(baseFiltered) : baseFiltered;
  const filterCounts = new Map(ACTIVITY_FILTERS.map(([id]) => [id, id === "all" ? memberActivity.length : memberActivity.filter((item) => String(item.event_type ?? "").includes(id)).length]));
  const storageMoves = memberActivity.filter((item) => item.event_type === "storage").length;
  const settlementChanges = memberActivity.length - storageMoves;
  const latestEvent = memberActivity[0]?.occurred_at ?? memberActivity[0]?.occurredAt;
  const scopeLabel = memberFilter === "All" ? "settlement" : memberFilter;
  return (
    <div className="panel activity-panel">
      <header className="members-topbar activity-topbar">
        <div>
          <h2>Activity</h2>
          <p>A live audit trail of settlement updates and owned-storage movements.</p>
        </div>
        <div className="dashboard-top-meta" aria-label="Activity status">
          <div className="dashboard-meta-cluster">
            <span><Activity size={15} /> {formatNumber(memberActivity.length)} recent events</span>
            <span>{latestEvent ? `Last event ${timeAgo(latestEvent)}` : "Awaiting activity"}</span>
          </div>
          <div className="dashboard-meta-cluster">
            <span>{memberFilter === "All" ? "All members" : memberFilter}</span>
            <span>{filter === "all" ? "All categories" : ACTIVITY_FILTERS.find(([id]) => id === filter)?.[1]}</span>
          </div>
        </div>
      </header>
      {error ? <div className="error">Local history unavailable: {error}</div> : null}
      <div className="activity-overview">
        <MiniStat icon={<Activity />} label={memberFilter === "All" ? "Total History" : "Member Events"} value={formatNumber(memberFilter === "All" ? activityTotal : memberActivity.length)} title={memberFilter === "All" ? `${formatNumber(combined.length)} recent events loaded` : `Attributed to ${memberFilter}`} />
        <MiniStat icon={<Box />} label="Storage Moves" value={formatNumber(storageMoves)} title="Settlement containers only" />
        <MiniStat icon={<Building2 />} label={memberFilter === "All" ? "System Changes" : "Other Changes"} value={formatNumber(settlementChanges)} title={memberFilter === "All" ? "Within loaded history" : "Not attributed to members"} />
        <MiniStat icon={<RefreshCw />} label="Latest Event" value={latestEvent ? timeAgo(latestEvent) : "-"} title={latestEvent ? dateLabel(latestEvent) : "Awaiting activity"} />
      </div>
      <section className="production-command-panel activity-command-panel" aria-label="Activity filters">
        <div className="activity-command-head">
          <strong><Activity size={16} /> Activity Filters</strong>
          <span>Showing {filtered.length} of {memberActivity.length} recent {scopeLabel} events{memberFilter === "All" && activityTotal > combined.length ? ` - ${formatNumber(activityTotal)} retained` : ""}</span>
        </div>
        <div className="activity-filter-grid">
          <label className="field">
            <span>Member</span>
            <select className="select-control" value={memberFilter} onChange={(event) => { setMemberFilter(event.target.value); trackAnalyticsEvent("activity_member_filter_used", { scope: event.target.value === "All" ? "all_members" : "member" }); }}>
              <option value="All">All members</option>
              {memberOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <div className="activity-filters" role="group" aria-label="Activity categories">
            {ACTIVITY_FILTERS.map(([id, label]) => (
              <button key={id} className={filter === id ? "active" : ""} onClick={() => { setFilter(id); trackAnalyticsEvent("activity_category_filter_used", { category: id }); }}>
                <span>{label}</span>
                <strong>{filterCounts.get(id) ?? 0}</strong>
              </button>
            ))}
          </div>
        </div>
        <div className="activity-options">
          <label className="check-control"><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} /> Combine repeated treasury changes</label>
          <span>{memberFilter !== "All" ? "Member filtering only includes attributed storage and market events." : "Activity is limited to monitored settlement history."}</span>
        </div>
      </section>
      <div className="activity-timeline">
        {filtered.length ? filtered.map((item) => {
          const display = activityStyle(item);
          return (
            <article className={`activity-event ${display.tone}`} key={item.id ?? `${item.occurred_at}-${item.summary}`}>
              <div className="activity-event-icon">{display.icon}</div>
              <div className="activity-event-body">
                <header><span>{display.label}</span><time>{timeAgo(item.occurred_at ?? item.occurredAt)}</time></header>
                <p>{activitySummary(item)}</p>
                {activityContainerName(item) ? <small><Box size={12} /> {activityContainerName(item)}</small> : null}
              </div>
              <time className="activity-event-date">{dateLabel(item.occurred_at ?? item.occurredAt)}</time>
            </article>
          );
        }) : <div className="empty-state activity-empty"><Activity />{combined.length ? "No activity matches this filter." : "No activity has been returned yet."}</div>}
      </div>
    </div>
  );
}

function compactActivity(items: AnyRecord[]): AnyRecord[] {
  const output: AnyRecord[] = [];
  let treasuryGroup: AnyRecord[] = [];
  const flush = () => {
    if (!treasuryGroup.length) return;
    if (treasuryGroup.length === 1) {
      output.push(treasuryGroup[0]);
      treasuryGroup = [];
      return;
    }
    const first = treasuryGroup[0];
    const last = treasuryGroup[treasuryGroup.length - 1];
    const total = treasuryGroup.reduce((sum, item) => {
      try {
        const meta = JSON.parse(item.metadata_json ?? "{}");
        return sum + (toNumber(meta.after) - toNumber(meta.before));
      } catch {
        return sum;
      }
    }, 0);
    output.push({ id: `treasury-${first.id}-${last.id}`, event_type: "treasury", occurred_at: first.occurred_at, summary: `${total >= 0 ? "+" : "-"}${formatNumber(Math.abs(total))}g to treasury across ${treasuryGroup.length} refreshes` });
    treasuryGroup = [];
  };
  for (const item of items) {
    if (item.event_type === "treasury") treasuryGroup.push(item);
    else {
      flush();
      output.push(item);
    }
  }
  flush();
  return output;
}

function diffSnapshot(prev: AnyRecord, curr: AnyRecord): string[] {
  const changes = [];
  for (const key of ["members", "buildings", "market"]) {
    if (prev[key] !== curr[key]) changes.push(`${key} changed from ${prev[key]} to ${curr[key]}`);
  }
  if (toNumber(prev.claim?.supplies) !== toNumber(curr.claim?.supplies)) changes.push(`Supplies changed to ${formatNumber(curr.claim?.supplies)}`);
  if (toNumber(prev.claim?.treasury) !== toNumber(curr.claim?.treasury)) changes.push(`Treasury changed to ${formatNumber(curr.claim?.treasury)}g`);
  return changes.length ? changes : ["No tracked changes detected"];
}

function applyTheme(theme: Partial<typeof DEFAULT_THEME>) {
  for (const [key, , cssVar] of THEME_FIELDS) {
    const value = theme[key] ?? DEFAULT_THEME[key];
    document.documentElement.style.setProperty(cssVar, value);
  }
  const bg = theme.bg ?? DEFAULT_THEME.bg;
  const gold = theme.gold ?? DEFAULT_THEME.gold;
  const activeColor = theme.activeColor ?? DEFAULT_THEME.activeColor;
  const activeBg = theme.activeBg ?? DEFAULT_THEME.activeBg;
  const gradientTop = theme.gradientTop ?? DEFAULT_THEME.gradientTop;
  const gradientMid = theme.gradientMid ?? DEFAULT_THEME.gradientMid;
  const gradientBase = theme.gradientBase ?? DEFAULT_THEME.gradientBase;
  const gradientTopStop = clampThemeNumber(theme.gradientTopStop, 0, 100, DEFAULT_THEME.gradientTopStop);
  const gradientMidStop = clampThemeNumber(theme.gradientMidStop, 0, 100, DEFAULT_THEME.gradientMidStop);
  const gradientFadeStop = clampThemeNumber(theme.gradientFadeStop, 0, 100, DEFAULT_THEME.gradientFadeStop);
  const gradientHeight = clampThemeNumber(theme.gradientHeight, 12, 72, DEFAULT_THEME.gradientHeight);
  document.documentElement.style.setProperty("--theme-gradient-top-stop", `${gradientTopStop}%`);
  document.documentElement.style.setProperty("--theme-gradient-mid-stop", `${gradientMidStop}%`);
  document.documentElement.style.setProperty("--theme-gradient-fade-stop", `${gradientFadeStop}%`);
  document.documentElement.style.setProperty("--theme-gradient-height", `${gradientHeight}vh`);
  document.documentElement.style.setProperty("--gold-dim", `color-mix(in srgb, ${activeBg || gold} 48%, transparent)`);
  document.documentElement.style.setProperty("--focus-border", activeColor);
  document.documentElement.style.setProperty("--focus-ring", `color-mix(in srgb, ${activeBg || activeColor} 42%, transparent)`);
  document.documentElement.style.setProperty("--command-page-gradient", `linear-gradient(180deg, ${gradientTop} ${gradientTopStop}%, ${gradientMid} ${gradientMidStop}%, ${gradientBase}00 ${gradientFadeStop}%) top / 100% ${gradientHeight}vh no-repeat, ${gradientBase || bg}`);
}

function toastItemFromActivity(event: AnyRecord): AnyRecord | null {
  const metadata = activityMetadata(event);
  const raw = metadata.raw && typeof metadata.raw === "object" ? metadata.raw as AnyRecord : {};
  const itemName = metadata.itemName ?? metadata.item_name ?? raw.itemName ?? raw.name ?? event.item_name;
  const itemId = metadata.itemId ?? metadata.item_id ?? raw.itemId ?? raw.item_id;
  const iconAssetName = metadata.iconAssetName ?? metadata.icon_asset_name ?? raw.iconAssetName ?? raw.icon_asset_name ?? raw.iconAddress ?? raw.icon_address;
  if (!itemName && !itemId && !iconAssetName) return null;
  const tier = metadata.tier ?? metadata.itemTier ?? raw.tier ?? raw.itemTier;
  const rarity = metadata.rarity ?? metadata.itemRarityStr ?? raw.rarity ?? raw.itemRarityStr;
  return {
    id: itemId,
    itemId,
    itemType: metadata.itemType ?? metadata.item_type ?? raw.itemType ?? raw.item_type,
    name: itemName ?? "Market item",
    itemName: itemName ?? "Market item",
    tier,
    itemTier: tier,
    rarity,
    itemRarityStr: rarity,
    iconAssetName,
  };
}

function ToastVisual({ notice }: { notice: ToastNotice }) {
  const item = notice.item ?? null;
  const tier = toNumber(item?.tier ?? item?.itemTier);
  if (item && (bitjitaIconUrl(item) || item.name || item.itemName)) {
    return (
      <span className={`toast-item-icon ${tier >= 1 && tier <= 10 ? `tier-framed tier-${tier}` : ""}`} aria-hidden="true">
        <ItemIcon item={item} />
      </span>
    );
  }
  return <span className="toast-icon" aria-hidden="true">{notice.kind === "market" ? <ShoppingCart size={17} /> : <Factory size={17} />}</span>;
}

function ToastStack({ notices, onDismiss }: { notices: ToastNotice[]; onDismiss: (id: string) => void }) {
  return (
    <section className="toast-stack" aria-live="polite" aria-label="Notifications">
      {notices.map((notice) => (
        <article className={`toast ${notice.kind}`} key={notice.id}>
          <ToastVisual notice={notice} />
          <div>
            <strong>{notice.title}</strong>
            <p>{notice.body}</p>
          </div>
          <button onClick={() => onDismiss(notice.id)} aria-label="Dismiss notification"><X size={14} /></button>
        </article>
      ))}
    </section>
  );
}

function NotificationDrawer({ notices, onClose, onOpenNotice }: { notices: ToastNotice[]; onClose: () => void; onOpenNotice: (notice: ToastNotice) => void }) {
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="notice-drawer" role="dialog" aria-modal="true" aria-label="Recent notifications" onClick={(event) => event.stopPropagation()}>
        <header><h2><Bell size={18} /> Notifications</h2><button onClick={onClose} aria-label="Close notifications"><X size={16} /></button></header>
        {notices.length ? <div className="notice-list">{notices.map((notice) => (
          <button key={notice.id} className={notice.read ? "" : "unread"} onClick={() => onOpenNotice(notice)}>
            <ToastVisual notice={notice} />
            <strong>{notice.title}</strong>
            <small>{notice.body}</small>
            <time>{notice.occurredAt ? timeAgo(notice.occurredAt) : ""}</time>
          </button>
        ))}</div> : <p className="legend">Notifications for sales, listings and production will appear here.</p>}
      </aside>
    </div>
  );
}

function CommandPalette({ data, onClose, onNavigate, onSelectMember }: { data: ReturnType<typeof normalizeData>; onClose: () => void; onNavigate: (panel: ActivePanel, marketTab?: string) => void; onSelectMember: (id: string) => void }) {
  const [query, setQuery] = React.useState("");
  const q = query.toLowerCase().trim();
  const commands = [
    ...NAV.map(([id, label, Icon]) => ({ key: `page-${id}`, label, description: "Open page", icon: <Icon size={15} />, run: () => onNavigate(id) })),
    { key: "price-finder", label: "Price Finder", description: "Find a listing price", icon: <CircleDollarSign size={15} />, run: () => onNavigate("market", "pricing") },
    { key: "buy-order-finder", label: "Buy Order Finder", description: "Find active buy orders", icon: <ShoppingBag size={15} />, run: () => onNavigate("market", "buy-orders") },
    { key: "craft-calculator", label: "Craft Calculator", description: "Calculate recipe chains", icon: <Calculator size={15} />, run: () => onNavigate("craftcalc") },
    ...data.members.map((member: AnyRecord) => ({
      key: `member-${member.playerEntityId}`,
      label: String(member.userName ?? member.username ?? "Member"),
      description: "Open member details",
      icon: <User size={15} />,
      run: () => { onSelectMember(String(member.playerEntityId)); onNavigate("members"); },
    })),
  ].filter((command) => !q || `${command.label} ${command.description}`.toLowerCase().includes(q)).slice(0, 12);
  React.useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose]);
  return (
    <div className="command-overlay" onClick={onClose}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Quick navigation" onClick={(event) => event.stopPropagation()}>
        <label><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Navigate or find a member..." /></label>
        <div>{commands.map((command) => <button key={command.key} onClick={() => { command.run(); onClose(); }}>{command.icon}<strong>{command.label}</strong><span>{command.description}</span></button>)}</div>
      </section>
    </div>
  );
}

function HelpCenter({ version, onClose, onPrivacy, onTerms }: { version: string; onClose: () => void; onPrivacy: () => void; onTerms: () => void }) {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <CircleHelp size={19} />
            <h2 id="help-title">Claim Monitor Help</h2>
          </div>
          <button onClick={onClose} aria-label="Close help"><X size={16} /></button>
        </header>
        <div className="beta-notice"><strong>Beta - Work in progress</strong><span>This application is actively being developed. Data display and features may change as accuracy and coverage improve.</span></div>
        <p className="help-intro">Track settlement operations, production opportunities, member professions and skills, storage, regional context, and market history using public BitCraft data.</p>
        <div className="help-links">
          <a href={`${GITHUB_REPOSITORY}#readme`} target="_blank" rel="noreferrer">
            <strong>Application Guide</strong>
            <span>Read the full feature and deployment overview</span>
            <ExternalLink size={14} />
          </a>
          <a href={`${GITHUB_REPOSITORY}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">
            <strong>Version {version}</strong>
            <span>View the latest changes and release notes</span>
            <ExternalLink size={14} />
          </a>
          <a href={`${GITHUB_REPOSITORY}/issues`} target="_blank" rel="noreferrer">
            <strong>Report Bugs & Request Features</strong>
            <span>Found an issue or have an idea? Let us know on GitHub Issues.</span>
            <ExternalLink size={14} />
          </a>
          <button className="help-link-button" onClick={() => { onClose(); onPrivacy(); }}>
            <strong>Privacy & Analytics</strong>
            <span>See what anonymous usage data may be measured</span>
            <Shield size={14} />
          </button>
          <button className="help-link-button" onClick={() => { onClose(); onTerms(); }}>
            <strong>Legal Terms</strong>
            <span>Read usage terms for the public settlement monitor</span>
            <FileText size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

function TermsContent({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <section className="terms-section">
        <h3>Application Terms</h3>
        <p>This is an unofficial fan-made settlement tool for BitCraft players. It is provided as-is for community use, testing and development. Data may be delayed, incomplete, unavailable or inaccurate, so do not rely on it as the only source for important settlement decisions.</p>
        <p>The app is not affiliated with Clockwork Labs. BitCraft&trade; is a trademark of Clockwork Labs, Inc. Data is provided by the BitJita API.</p>
      </section>
      <section className="terms-section">
        <h3>Public Data</h3>
        <p>The selected settlement, dashboard history and market activity are based on public BitJita API data. Visitors tracking the same settlement use the same server-side history records so the app does not create per-user duplicate settlement data.</p>
        <p>Browser preferences, including the selected settlement and optional BitCraft Sync URL, are stored in this browser. The Sync URL is not required to use the app.</p>
      </section>
      {!compact ? <p className="help-intro">Questions, bug reports and feature requests can be raised through the GitHub Issues link in this app.</p> : null}
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <p className="help-intro">With your permission, this site uses first-party analytics cookies to understand which pages and tools are valuable and how long sections are used. This information is genuinely helpful while the app is being developed.</p>
      <p className="help-intro">Analytics record a random browser identifier, visits to app sections and high-level feature actions. They do not record typed search text, private credentials, the optional BitCraft Sync URL, or database contents.</p>
      <p className="help-intro">The settlement you choose is stored in this browser and may be sent to the server to refresh shared public history for that settlement.</p>
      <p className="help-intro">Consent and analytics cookies last for up to 180 days. Raw usage events are retained for up to 90 days. You can change your preference in the app at any time; declining removes the analytics identifier from this browser.</p>
    </>
  );
}

function DedicatedLegalPage({ type }: { type: "terms" | "privacy" }) {
  const isTerms = type === "terms";
  return (
    <main className="legal-page">
      <section className="legal-document">
        <header>
          <div>
            {isTerms ? <FileText size={22} /> : <Shield size={22} />}
            <h1>{isTerms ? "Terms of Use" : "Privacy Policy"}</h1>
          </div>
          <a className="toolbar-button" href="/"><ExternalLink size={14} /> Open app</a>
        </header>
        <p className="help-intro">Timbersteel Claim Monitor - version {APP_VERSION}</p>
        {isTerms ? <TermsContent /> : <PrivacyContent />}
        <footer>
          <span>Unofficial fan-made tool. Not affiliated with Clockwork Labs. BitCraft&trade; is a trademark of Clockwork Labs, Inc.</span>
          <span>Data provided by the <a href="https://bitjita.com/docs/api">BitJita API</a>. Source available on <a href={GITHUB_REPOSITORY}>GitHub</a>.</span>
        </footer>
      </section>
    </main>
  );
}

function TermsDialog({ onClose, onPrivacy }: { onClose: () => void; onPrivacy: () => void }) {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog terms-dialog" role="dialog" aria-modal="true" aria-labelledby="terms-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <FileText size={19} />
            <h2 id="terms-title">Legal & Bot Terms</h2>
          </div>
          <button onClick={onClose} aria-label="Close legal terms"><X size={16} /></button>
        </header>
        <TermsContent compact />
        <div className="toolbar">
          <a className="toolbar-button primary" href="/terms" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open dedicated page</a>
          <button className="toolbar-button" onClick={() => { onClose(); onPrivacy(); }}><Shield size={14} /> Privacy details</button>
        </div>
      </section>
    </div>
  );
}

function PrivacyDialog({ consent, onConsent, onClose }: { consent: AnalyticsConsent; onConsent: (choice: Exclude<AnalyticsConsent, null>) => void; onClose: () => void }) {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <Shield size={19} />
            <h2 id="privacy-title">Privacy & Analytics</h2>
          </div>
          <button onClick={onClose} aria-label="Close privacy information"><X size={16} /></button>
        </header>
        <div className={`analytics-status ${consent === "accepted" ? "enabled" : ""}`}>
          <strong>Usage analytics {consent === "accepted" ? "accepted" : consent === "declined" ? "declined" : "not selected"}</strong>
          <span>{consent === "accepted" ? "This browser is helping development by sharing anonymous feature usage." : "This browser is not currently contributing usage analytics."}</span>
        </div>
        <PrivacyContent />
        <div className="privacy-actions">
          <button className="toolbar-button primary" onClick={() => onConsent("accepted")}>Accept Analytics</button>
          <button className="toolbar-button" onClick={() => onConsent("declined")}>Decline</button>
          <a className="toolbar-button" href="/privacy" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open dedicated page</a>
        </div>
      </section>
    </div>
  );
}

function UserSettingsDialog({
  density,
  onDensityChange,
  toastSettings,
  onToastSettingsChange,
  theme,
  onThemeChange,
  onResetSettings,
  onClose,
}: {
  density: "comfortable" | "compact";
  onDensityChange: (density: "comfortable" | "compact") => void;
  toastSettings: UserToastSettings;
  onToastSettingsChange: (settings: UserToastSettings) => void;
  theme: ThemeSettings;
  onThemeChange: (theme: ThemeSettings) => void;
  onResetSettings: () => void;
  onClose: () => void;
}) {
  const [settingsSection, setSettingsSection] = React.useState<"theme" | "preferences" | "data">("preferences");
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  const [themeExpanded, setThemeExpanded] = React.useState(false);
  const [customTheme, setCustomTheme] = React.useState<ThemeSettings>(() => loadSavedCustomTheme());
  const [customThemeStatus, setCustomThemeStatus] = React.useState("");
  const [lastThemeChoice, setLastThemeChoice] = React.useState("");
  const themeFingerprint = JSON.stringify(theme);
  const customThemeFingerprint = JSON.stringify(customTheme);
  const matchedBuiltInPreset = THEME_PRESETS.find((preset) => JSON.stringify(preset.theme) === themeFingerprint)?.id;
  const customThemeMatches = customThemeFingerprint === themeFingerprint;
  const activePreset = lastThemeChoice === "custom" && customThemeMatches
    ? "custom"
    : matchedBuiltInPreset ?? (customThemeMatches ? "custom" : "custom-editing");
  const fieldLabel = (key: ThemeColorKey) => THEME_FIELDS.find(([fieldKey]) => fieldKey === key)?.[1] ?? key;
  const setThemeValue = (key: ThemeColorKey, value: string) => onThemeChange({ ...theme, [key]: value });
  const rangeFieldLabel = (key: ThemeRangeKey) => THEME_RANGE_FIELD_CONFIG[key].label;
  const setThemeRangeValue = (key: ThemeRangeKey, value: string) => {
    const config = THEME_RANGE_FIELD_CONFIG[key];
    onThemeChange({ ...theme, [key]: clampThemeNumber(value, config.min, config.max, DEFAULT_THEME[key]) });
  };
  const previewGradient = `linear-gradient(180deg, ${theme.gradientTop} ${theme.gradientTopStop}%, ${theme.gradientMid} ${theme.gradientMidStop}%, ${theme.gradientBase} ${theme.gradientFadeStop}%)`;
  const saveCustomTheme = () => {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify({ schema: "timbersteel-local-theme", version: 2, theme }));
    setCustomTheme(theme);
    setLastThemeChoice("custom");
    setThemeExpanded(false);
    setCustomThemeStatus("Custom theme saved. You can now switch between presets and Custom.");
  };
  const openCustomTheme = () => {
    onThemeChange(customTheme);
    setLastThemeChoice("custom");
    setThemeExpanded(true);
    setCustomThemeStatus(customThemeFingerprint === JSON.stringify(DEFAULT_THEME) ? "Custom starts from the default theme until you save your own." : "");
  };
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <Settings size={19} />
            <h2 id="settings-title">User Settings</h2>
          </div>
          <button onClick={onClose} aria-label="Close user settings"><X size={16} /></button>
        </header>
        <div className="settings-shell">
          <nav className="settings-section-tabs" aria-label="Settings sections">
            {([
              ["theme", "Theme", Star],
              ["preferences", "Preferences", Bell],
              ["data", "Local data", HardDrive],
            ] as const).map(([id, label, Icon]) => (
              <button key={id} className={settingsSection === id ? "active" : ""} onClick={() => setSettingsSection(id)}>
                <Icon size={15} /><span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-grid">
          {settingsSection === "theme" ? <section className={`settings-theme-section ${themeExpanded ? "expanded" : ""}`}>
            <div className="settings-section-heading">
              <div>
                <h3>Theme</h3>
                <p className="legend">Saved locally for this browser. Presets apply instantly and advanced controls can be fine-tuned below.</p>
              </div>
              <div className="settings-heading-actions">
                <button className="toolbar-button" onClick={() => { onThemeChange(DEFAULT_THEME); setLastThemeChoice("default"); setThemeExpanded(false); }}><RefreshCw size={14} /> Reset Default</button>
                {themeExpanded ? <button className="toolbar-button primary" onClick={saveCustomTheme}><Save size={14} /> Save Custom</button> : null}
              </div>
            </div>
            <div className="theme-preset-grid">
              {THEME_PRESETS.map((preset) => (
                <button className={activePreset === preset.id ? "active" : ""} key={preset.id} onClick={() => { onThemeChange(preset.theme); setLastThemeChoice(preset.id); setThemeExpanded(false); }}>
                  <span className="theme-preset-swatches" aria-hidden="true">
                    <i style={{ background: preset.theme.bg }} />
                    <i style={{ background: preset.theme.panel }} />
                    <i style={{ background: preset.theme.gold }} />
                  </span>
                  <strong>{preset.label}</strong>
                  <small>{preset.description}</small>
                </button>
              ))}
              <button className={`theme-custom-preset ${activePreset === "custom" || themeExpanded ? "active" : ""}`} onClick={openCustomTheme}>
                <span className="theme-preset-swatches" aria-hidden="true">
                  <i style={{ background: customTheme.gradientBase }} />
                  <i style={{ background: customTheme.cardTop }} />
                  <i style={{ background: customTheme.activeColor }} />
                </span>
                <strong>Custom</strong>
                <small>Open the editor and use your saved custom theme.</small>
              </button>
            </div>
            {customThemeStatus ? <p className="theme-share-status">{customThemeStatus}</p> : null}
            <div className="theme-editor-layout" hidden={!themeExpanded}>
              <div className="theme-field-groups">
                <div className="theme-field-group">
                  <strong>Gradient Shape</strong>
                  <div className="theme-range-grid">
                    {THEME_GRADIENT_RANGE_FIELDS.map((key) => {
                      const config = THEME_RANGE_FIELD_CONFIG[key];
                      return (
                        <label className="theme-range-field" key={key}>
                          <span>{rangeFieldLabel(key)}</span>
                          <input
                            aria-label={rangeFieldLabel(key)}
                            type="range"
                            min={config.min}
                            max={config.max}
                            value={theme[key]}
                            onChange={(event) => setThemeRangeValue(key, event.target.value)}
                          />
                          <span className="theme-range-value">
                            <input
                              aria-label={`${rangeFieldLabel(key)} value`}
                              type="number"
                              min={config.min}
                              max={config.max}
                              value={theme[key]}
                              onChange={(event) => setThemeRangeValue(key, event.target.value)}
                            />
                            <em>{config.unit}</em>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {THEME_FIELD_GROUPS.map((group) => (
                  <div className="theme-field-group" key={group.title}>
                    <strong>{group.title}</strong>
                    <div className="theme-grid">
                      {group.keys.map((key) => (
                        <label className="color-field" key={key}>
                          <span>{fieldLabel(key)}</span>
                          <code>{theme[key]}</code>
                          <input aria-label={fieldLabel(key)} type="color" value={theme[key]} onInput={(event) => setThemeValue(key, event.currentTarget.value)} onChange={(event) => setThemeValue(key, event.target.value)} />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="theme-preview-card" style={{ background: previewGradient, borderColor: theme.border, color: theme.text }}>
                <aside style={{ background: `linear-gradient(180deg, ${theme.sidebar}, ${theme.gradientBase})`, borderColor: theme.border }}>
                  <b style={{ color: theme.activeColor }}>Timbersteel</b>
                  <span style={{ color: theme.muted }}>Claim Monitor</span>
                  <em style={{ borderColor: theme.activeBorder, color: theme.activeColor, background: theme.activeBg }}>Dashboard</em>
                </aside>
                <main>
                  <header>
                    <span style={{ color: theme.cardTitle }}>Theme Preview</span>
                    <strong style={{ color: theme.cardValue }}>Dashboard</strong>
                  </header>
                  <article style={{ background: `linear-gradient(180deg, ${theme.cardTop}, ${theme.cardBottom})`, borderColor: theme.border }}>
                    <div style={{ background: theme.iconBg, color: theme.activeColor }}>
                      <Shield size={16} />
                    </div>
                    <span style={{ color: theme.cardTitle }}>Supply Status</span>
                    <b style={{ color: theme.cardValue }}>47d 6h</b>
                    <small style={{ color: theme.good }}>Healthy runway</small>
                  </article>
                  <article style={{ background: `linear-gradient(180deg, ${theme.cardTop}, ${theme.cardBottom})`, borderColor: theme.border }}>
                    <div style={{ background: theme.iconBg, color: theme.activeColor }}>
                      <Activity size={16} />
                    </div>
                    <span style={{ color: theme.cardTitle }}>Recent Activity</span>
                    <b style={{ color: theme.cardValue }}>5 events</b>
                    <small style={{ color: theme.danger }}>1 needs review</small>
                  </article>
                </main>
                <p style={{ color: theme.muted }}>Preview shows page gradient, sidebar, cards, borders, text, accent and status colours.</p>
                <div className="theme-preview-progress" style={{ background: theme.panel2 }}>
                  <i style={{ background: `linear-gradient(90deg, ${theme.good}, #56d5ff)` }} />
                </div>
              </div>
            </div>
          </section> : null}
          {settingsSection === "preferences" ? <section>
            <h3>Display Density</h3>
            <div className="segmented-control">
              <button className={density === "comfortable" ? "active" : ""} onClick={() => onDensityChange("comfortable")}>Comfortable</button>
              <button className={density === "compact" ? "active" : ""} onClick={() => onDensityChange("compact")}>Compact</button>
            </div>
          </section> : null}
          {settingsSection === "preferences" ? <section>
            <h3>Notifications</h3>
            {([["marketListings", "New market listings"], ["marketSales", "Confirmed market sales"], ["production", "Production starts and completions"]] as const).map(([key, label]) => (
              <label className="toggle-row" key={key}><input type="checkbox" checked={toastSettings[key]} onChange={(event) => onToastSettingsChange({ ...toastSettings, [key]: event.target.checked })} /><span>{label}</span></label>
            ))}
          </section> : null}
          {settingsSection === "data" ? <section>
            <h3>Reset</h3>
            <p className="legend">Reset this browser's local app preferences. Admin settings and settlement data are not affected.</p>
            <button className="toolbar-button" onClick={onResetSettings}><RefreshCw size={14} /> Reset my settings</button>
          </section> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function CookieBanner({ onConsent, onPrivacy }: { onConsent: (choice: Exclude<AnalyticsConsent, null>) => void; onPrivacy: () => void }) {
  return (
    <section className="cookie-banner" role="dialog" aria-label="Analytics cookies">
      <div>
        <strong>Help improve Claim Monitor</strong>
        <p>We would like to use analytics cookies to see which pages and tools are useful. This data is genuinely helpful for development, so please accept if you are happy to help.</p>
        <button className="cookie-details" onClick={onPrivacy}>Privacy & Analytics details</button>
      </div>
      <div className="cookie-actions">
        <button className="toolbar-button primary" onClick={() => onConsent("accepted")}>Accept Analytics</button>
        <button className="toolbar-button" onClick={() => onConsent("declined")}>Decline</button>
      </div>
    </section>
  );
}

type SettlementSearchResult = {
  entityId: string;
  name: string;
  owner?: string;
  regionName?: string;
  regionId?: string;
  tier?: string | number;
};

function readLocalString(key: string, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveLocalMonitorSettings(claimId: string, syncUrl: string) {
  localStorage.setItem(LOCAL_CLAIM_ID_STORAGE_KEY, claimId);
  localStorage.setItem(LOCAL_SYNC_URL_STORAGE_KEY, syncUrl);
}

function validOptionalSyncUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" && parsed.hostname === "bitcraftsync.app";
  } catch {
    return false;
  }
}

function SettlementSetupDialog({
  open,
  currentClaimId,
  currentSyncUrl,
  mode = "dialog",
  onSave,
}: {
  open: boolean;
  currentClaimId: string;
  currentSyncUrl: string;
  mode?: "dialog" | "page";
  onSave: (claimId: string, syncUrl: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [manualClaimId, setManualClaimId] = React.useState(currentClaimId);
  const [syncUrlDraft, setSyncUrlDraft] = React.useState(currentSyncUrl);
  const [results, setResults] = React.useState<SettlementSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    setManualClaimId(currentClaimId);
    setSyncUrlDraft(currentSyncUrl);
  }, [currentClaimId, currentSyncUrl, open]);
  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${LOCAL_API}/claims/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Settlement search failed");
        setResults(Array.isArray(body.claims) ? body.claims : []);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  if (!open) return null;
  const syncUrlInvalid = !validOptionalSyncUrl(syncUrlDraft);
  const canSaveManual = /^\d{8,}$/.test(manualClaimId.trim()) && !syncUrlInvalid;
  const hasSearch = query.trim().length >= 2;
  const chooseSettlement = (settlement: SettlementSearchResult) => {
    const id = String(settlement.entityId ?? "").trim();
    if (!id) return;
    onSave(id, syncUrlDraft.trim());
  };
  const content = (
    <section className="help-dialog settlement-setup-dialog onboarding-dialog" role={mode === "dialog" ? "dialog" : "region"} aria-modal={mode === "dialog" ? "true" : undefined} aria-labelledby="settlement-setup-title" onClick={(event) => event.stopPropagation()}>
      <div className="onboarding-hero">
        <span className="onboarding-mark"><Shield size={23} /></span>
        <div>
          <p>Public Settlement Monitor</p>
          <h2 id="settlement-setup-title">Track any BitCraft settlement</h2>
          <span>Choose a settlement once and this browser will open straight into its live operations view.</span>
        </div>
      </div>
      <div className="settlement-setup-body">
        <div className="onboarding-intro">
          <article>
            <Database size={17} />
            <strong>Shared public history</strong>
            <span>Market, activity and production snapshots are collected server-side for selected settlements, so people watching the same settlement share the same records.</span>
          </article>
          <article>
            <HardDrive size={17} />
            <strong>Browser-local setup</strong>
            <span>Your chosen settlement and optional BitCraft Sync link are saved only in this browser. No login or admin account is needed.</span>
          </article>
          <article>
            <Search size={17} />
            <strong>Start with a settlement</strong>
            <span>Search by name, pick the right result, or paste a settlement ID if the search API cannot find it.</span>
          </article>
        </div>
        <div className="onboarding-setup-grid">
          <div className="onboarding-card onboarding-card-primary">
            <div className="onboarding-card-heading">
              <span>Step 1</span>
              <h3>Find your settlement</h3>
            </div>
            <label className="field">
              <span>Search settlements</span>
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type at least 2 characters" />
            </label>
            <div className={`settlement-search-results ${!hasSearch ? "is-empty" : ""}`}>
              {!hasSearch ? <p className="legend">Results from BitJita will appear here.</p> : null}
              {loading ? <p className="legend">Searching settlements...</p> : null}
              {error ? <p className="error">{error}</p> : null}
              {!loading && hasSearch && !results.length && !error ? <p className="legend">No settlements found. Paste a settlement ID below if you know it.</p> : null}
              {results.map((settlement) => (
                <button type="button" key={settlement.entityId} onClick={() => chooseSettlement(settlement)}>
                  <strong>{settlement.name || `Settlement ${settlement.entityId}`}</strong>
                  <span>{[settlement.owner ? `Owner ${settlement.owner}` : "", settlement.regionName || (settlement.regionId ? `Region ${settlement.regionId}` : ""), settlement.tier ? `T${settlement.tier}` : ""].filter(Boolean).join(" | ")}</span>
                </button>
              ))}
            </div>
            <label className="field">
              <span>Settlement ID fallback</span>
              <input value={manualClaimId} onChange={(event) => setManualClaimId(event.target.value)} placeholder="Paste a claim or settlement ID" />
            </label>
          </div>
          <div className="onboarding-card">
            <div className="onboarding-card-heading">
              <span>Step 2</span>
              <h3>Add Sync link</h3>
            </div>
            <p className="legend">Optional. Add a BitCraft Sync URL if you want the embedded materials board available from the Sync page.</p>
            <label className="field">
              <span>BitCraft Sync URL</span>
              <input value={syncUrlDraft} onChange={(event) => setSyncUrlDraft(event.target.value)} placeholder="https://bitcraftsync.app/s/..." />
            </label>
            {syncUrlInvalid ? <p className="error">BitCraft Sync URL must be a bitcraftsync.app HTTPS link, or left blank.</p> : null}
            <div className="onboarding-note">
              <CheckCircle2 size={15} />
              <span>You can skip this now and add it later from the Sync page.</span>
            </div>
          </div>
        </div>
      </div>
      <div className="help-actions onboarding-actions">
        <span>{canSaveManual ? "Ready to open the dashboard." : "Choose a search result or enter a valid settlement ID to continue."}</span>
        <button className="toolbar-button primary" disabled={!canSaveManual} onClick={() => onSave(manualClaimId.trim(), syncUrlDraft.trim())}><Save size={14} /> Start Monitoring</button>
      </div>
    </section>
  );
  if (mode === "page") return <main className="onboarding-page">{content}</main>;
  return <div className="help-overlay settlement-setup-overlay">{content}</div>;
}

function AppSkeleton() {
  return <div className="panel app-skeleton"><div className="skeleton-line title" /><div className="skeleton-grid">{[0, 1, 2, 3].map((id) => <div key={id} />)}</div><div className="skeleton-block" /><div className="skeleton-block short" /></div>;
}

function ApiStatusBanner({ warnings, lastUpdated }: { warnings: string[]; lastUpdated: Date | null }) {
  const uniqueWarnings = unique(warnings).slice(0, 6);
  if (!uniqueWarnings.length) return null;
  return (
    <section className="api-status-banner" role="status" aria-live="polite">
      <span className="api-status-icon"><AlertTriangle size={18} /></span>
      <div className="api-status-copy">
        <strong>Data refresh issue</strong>
        <span>Showing the latest successful data. Some details may be stale until the next successful refresh.</span>
        <small>{lastUpdated ? `Last successful refresh ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Waiting for a successful refresh."}</small>
      </div>
      <details className="api-status-details">
        <summary>Details</summary>
        <ul>
          {uniqueWarnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      </details>
    </section>
  );
}

function ApiErrorState({ message }: { message: string }) {
  return (
    <section className="api-error-state" role="alert">
      <span className="api-error-icon"><AlertTriangle size={22} /></span>
      <div>
        <h2>Unable to refresh BitJita data</h2>
        <p>BitJita may be having a temporary issue. The app will recover automatically when the next refresh succeeds.</p>
        <details>
          <summary>Technical detail</summary>
          <code>{message}</code>
        </details>
      </div>
    </section>
  );
}

function DashboardApp() {
  const [active, setActive] = usePersistedState<ActivePanel>("navigation.page", "dashboard");
  const mainRef = React.useRef<HTMLElement | null>(null);
  const defaultPageAppliedRef = React.useRef(false);
  const savedPageRef = React.useRef(hasPersistedState("navigation.page") || Boolean(urlPanel()));
  const [appSettings, setAppSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS);
  const [claimId, setClaimId] = React.useState(() => readLocalString(LOCAL_CLAIM_ID_STORAGE_KEY));
  const [syncUrl, setSyncUrl] = React.useState(() => readLocalString(LOCAL_SYNC_URL_STORAGE_KEY));
  const [settlementSetupOpen, setSettlementSetupOpen] = React.useState(() => !readLocalString(LOCAL_CLAIM_ID_STORAGE_KEY));
  const [browserTheme, setBrowserTheme] = usePersistedState<ThemeSettings>("theme.local", DEFAULT_THEME);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [historyRefreshToken, setHistoryRefreshToken] = React.useState(0);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [mapFocus, setMapFocus] = usePersistedState<MapFocus>("map.focus", urlMapFocus());
  const [selectedMemberId, setSelectedMemberId] = usePersistedState("production.member", "All");
  const [toasts, setToasts] = React.useState<ToastNotice[]>([]);
  const [notificationLog, setNotificationLog] = usePersistedState<ToastNotice[]>("notifications.log", []);
  const [userToastSettings, setUserToastSettings] = usePersistedState<UserToastSettings>("user.notifications", DEFAULT_USER_TOAST_SETTINGS);
  const [density, setDensity] = usePersistedState<"comfortable" | "compact">("layout.density", "comfortable");
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState("layout.sidebarCollapsed", false);
  const [sidebarGroups, setSidebarGroups] = usePersistedState<Record<string, boolean>>("layout.sidebarGroups", DEFAULT_SIDEBAR_GROUPS);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [userSettingsOpen, setUserSettingsOpen] = React.useState(false);
  const [privacyOpen, setPrivacyOpen] = React.useState(false);
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [consent, setConsent] = React.useState<AnalyticsConsent>(() => readAnalyticsConsent());
  const [noticeOpen, setNoticeOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const toastTimersRef = React.useRef<Map<string, number>>(new Map());
  const activityNoticeIdsRef = React.useRef<Set<string> | null>(null);
  const activityNoticeClaimRef = React.useRef(claimId);
  const craftQueueRef = React.useRef<{ claimId: string; jobs: Map<string, AnyRecord> } | null>(null);
  const state = useBitjitaData(refreshToken, claimId, active);
  const data = React.useMemo(() => {
    const normalized = normalizeData(state.data);
    return { ...normalized, raw: state.data };
  }, [state.data]);
  const localHistory = useLocalHistory(refreshToken + historyRefreshToken, claimId, active);
  const selectedProductionMember = selectedMemberId === "All" ? null : data.members.find((member: AnyRecord) => String(member.playerEntityId) === selectedMemberId) ?? null;
  analyticsConsent = consent;
  const dismissToast = React.useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer != null) window.clearTimeout(timer);
    toastTimersRef.current.delete(id);
    setToasts((current) => current.filter((notice) => notice.id !== id));
  }, []);
  const saveMonitorSettings = React.useCallback((nextClaimId: string, nextSyncUrl: string) => {
    saveLocalMonitorSettings(nextClaimId, nextSyncUrl);
    setClaimId(nextClaimId);
    setSyncUrl(nextSyncUrl);
    setSettlementSetupOpen(false);
    setActive("dashboard");
    updateQueryState({ page: "dashboard" });
    setRefreshToken((x) => x + 1);
    setHistoryRefreshToken((x) => x + 1);
  }, [setActive]);
  const saveSyncUrl = React.useCallback((nextSyncUrl: string) => {
    localStorage.setItem(LOCAL_SYNC_URL_STORAGE_KEY, nextSyncUrl);
    setSyncUrl(nextSyncUrl);
  }, []);
  const navigate = React.useCallback((panel: ActivePanel, marketTab?: string, nextMapFocus?: MapFocus) => {
    setActive(panel);
    const activeMapFocus = panel === "map" ? nextMapFocus ?? mapFocus : null;
    updateQueryState({
      page: panel,
      tab: panel === "market" ? marketTab ?? null : null,
      item: panel === "market" ? new URLSearchParams(window.location.search).get("item") : null,
      itemName: panel === "market" ? new URLSearchParams(window.location.search).get("itemName") : null,
      itemType: panel === "market" ? new URLSearchParams(window.location.search).get("itemType") : null,
      region: panel === "market" ? new URLSearchParams(window.location.search).get("region") : null,
      buyItem: panel === "market" ? new URLSearchParams(window.location.search).get("buyItem") : null,
      buyItemName: panel === "market" ? new URLSearchParams(window.location.search).get("buyItemName") : null,
      buyItemType: panel === "market" ? new URLSearchParams(window.location.search).get("buyItemType") : null,
      buyRegion: panel === "market" ? new URLSearchParams(window.location.search).get("buyRegion") : null,
      mapName: activeMapFocus?.name ?? null,
      mapX: activeMapFocus ? String(activeMapFocus.locationX) : null,
      mapZ: activeMapFocus ? String(activeMapFocus.locationZ) : null,
    });
  }, [mapFocus, setActive]);
  const pushToast = React.useCallback((title: string, body: string, kind: ToastKind, item?: AnyRecord | null) => {
    const id = `${Date.now()}-${Math.random()}`;
    const notice: ToastNotice = { id, title, body, kind, occurredAt: new Date().toISOString(), read: false, destination: kind === "market" ? "market" : "production", item: item ?? null };
    setToasts((current) => [...current, notice].slice(-4));
    setNotificationLog((current) => [notice, ...current].slice(0, 80));
    const timer = window.setTimeout(() => {
      toastTimersRef.current.delete(id);
      setToasts((current) => current.filter((notice) => notice.id !== id));
    }, 7000);
    toastTimersRef.current.set(id, timer);
  }, [setNotificationLog]);
  React.useEffect(() => () => {
    for (const timer of toastTimersRef.current.values()) window.clearTimeout(timer);
    toastTimersRef.current.clear();
  }, []);
  React.useEffect(() => {
    if (String(active) === "buildings" || String(active) === "overview") {
      setActive("dashboard");
      updateQueryState({ page: "dashboard" });
    }
  }, [active, setActive]);
  React.useEffect(() => {
    const rawPanel = new URLSearchParams(window.location.search).get("page");
    if (rawPanel === "buildings" || rawPanel === "overview") updateQueryState({ page: "dashboard" });
    const requested = urlPanel();
    const requestedMapFocus = urlMapFocus();
    if (requestedMapFocus) setMapFocus(requestedMapFocus);
    if (requested) setActive(requested);
    function restoreFromHistory() {
      const panel = urlPanel();
      const historyMapFocus = urlMapFocus();
      if (historyMapFocus) setMapFocus(historyMapFocus);
      if (panel) setActive(panel);
    }
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, [setActive, setMapFocus]);
  React.useEffect(() => {
    function openCommands(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditing = Boolean(target?.closest("input, textarea, select, [contenteditable='true']"));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      } else if (event.key === "/" && !isEditing) {
        event.preventDefault();
        setCommandOpen(true);
      }
    }
    window.addEventListener("keydown", openCommands);
    return () => window.removeEventListener("keydown", openCommands);
  }, []);
  React.useEffect(() => {
    fetch(`${LOCAL_API}/config`)
      .then((response) => response.ok ? response.json() : null)
      .then((config) => {
        if (!config) return;
        const next = normalizeAppSettings(config);
        setAppSettings(next);
        if (!defaultPageAppliedRef.current && !savedPageRef.current) {
          defaultPageAppliedRef.current = true;
          setActive(next.defaultPage);
        }
      })
      .catch(() => undefined);
  }, []);
  React.useEffect(() => {
    applyTheme(browserTheme);
  }, [browserTheme]);
  React.useEffect(() => {
    if (consent !== "accepted") return;
    trackAnalyticsEvent("page_view", undefined, undefined, active);
    const enteredAt = Date.now();
    let recorded = false;
    const recordDuration = () => {
      if (recorded) return;
      recorded = true;
      const durationSeconds = Math.round((Date.now() - enteredAt) / 1000);
      if (durationSeconds > 0) trackAnalyticsEvent("page_duration", undefined, durationSeconds, active);
    };
    window.addEventListener("pagehide", recordDuration);
    return () => {
      window.removeEventListener("pagehide", recordDuration);
      recordDuration();
    };
  }, [active, consent]);
  React.useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [active]);
  React.useEffect(() => {
    const timer = window.setInterval(() => setRefreshToken((x) => x + 1), appSettings.refreshSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [appSettings.refreshSeconds]);
  React.useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) return;
    const favicon = appSettings.branding.favicon;
    link.href = favicon ? `${favicon.url}?v=${encodeURIComponent(favicon.updatedAt)}` : "/favicon.svg";
    link.type = favicon?.contentType ?? "image/svg+xml";
  }, [appSettings.branding.favicon]);
  React.useEffect(() => {
    if (state.data) setLastUpdated(new Date());
  }, [state.data]);
  React.useEffect(() => {
    if (selectedMemberId !== "All" && state.data && !selectedProductionMember) setSelectedMemberId("All");
  }, [selectedMemberId, selectedProductionMember, state.data]);
  React.useEffect(() => {
    if (activityNoticeClaimRef.current !== claimId) {
      activityNoticeClaimRef.current = claimId;
      activityNoticeIdsRef.current = null;
    }
    if (!localHistory.refreshToken) return;
    const knownIds = localHistory.activity.map((event) => String(event.id));
    if (activityNoticeIdsRef.current == null) {
      activityNoticeIdsRef.current = new Set(knownIds);
      return;
    }
    const notable = new Set(["market_new_listing", "market_sale", "market_sale_confirmed"]);
    const unseen = localHistory.activity
      .filter((event) => !activityNoticeIdsRef.current?.has(String(event.id)) && notable.has(String(event.event_type)))
      .slice(0, 3)
      .reverse();
    for (const id of knownIds) activityNoticeIdsRef.current.add(id);
    for (const event of unseen) {
      const isListing = event.event_type === "market_new_listing";
      if (isListing && (!appSettings.toastSettings.marketListings || !userToastSettings.marketListings)) continue;
      if (!isListing && (!appSettings.toastSettings.marketSales || !userToastSettings.marketSales)) continue;
      pushToast(isListing ? "New market listing" : "Market sale", activitySummary(event), "market", toastItemFromActivity(event));
    }
  }, [appSettings.toastSettings.marketListings, appSettings.toastSettings.marketSales, claimId, localHistory.activity, localHistory.refreshToken, pushToast, userToastSettings.marketListings, userToastSettings.marketSales]);
  React.useEffect(() => {
    if (!state.data) return;
    const current = new Map<string, AnyRecord>(data.crafts.map((job: AnyRecord) => [String(job.entityId ?? `${job.buildingName}-${job.recipeId}`), job]));
    const previous = craftQueueRef.current;
    if (!previous || previous.claimId !== claimId) {
      craftQueueRef.current = { claimId, jobs: current };
      return;
    }
    if (!appSettings.toastSettings.production || !userToastSettings.production) {
      craftQueueRef.current = { claimId, jobs: current };
      return;
    }
    const started = [...current.entries()].filter(([id]) => !previous.jobs.has(id)).slice(0, 2);
    const completed = [...previous.jobs.entries()].filter(([id]) => !current.has(id)).slice(0, 2);
    for (const [, job] of started) {
      pushToast("Craft started", `${craftDisplayName(job, data.raw?.crafts)} - ${job.buildingName ?? "Settlement production"}`, "production", craftOutputItem(job, data.raw?.crafts));
    }
    for (const [, job] of completed) {
      pushToast("Craft completed", `${craftDisplayName(job, state.data?.crafts)} - ${job.buildingName ?? "Settlement production"}`, "production", craftOutputItem(job, state.data?.crafts));
    }
    craftQueueRef.current = { claimId, jobs: current };
  }, [appSettings.toastSettings.production, claimId, data.crafts, data.raw?.crafts, pushToast, state.data, userToastSettings.production]);
  React.useEffect(() => {
    if (!claimId || !state.data) return;
    const controller = new AbortController();
    async function refreshSharedHistory() {
      try {
        const response = await fetch(`${LOCAL_API}/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ claimId }),
          signal: controller.signal,
        });
        if (response.ok) setHistoryRefreshToken((x) => x + 1);
      } catch {
        // Live BitJita data remains usable if shared history refresh is unavailable.
      }
    }
    refreshSharedHistory();
    return () => controller.abort();
  }, [claimId, refreshToken, state.data]);

  if (!claimId) {
    return <SettlementSetupDialog open currentClaimId="" currentSyncUrl="" mode="page" onSave={saveMonitorSettings} />;
  }

  const panels: Record<string, React.ReactNode> = {
    dashboard: <Dashboard data={data} activity={localHistory.activity} snapshots={localHistory.snapshots} dashboardSummary={localHistory.dashboard} lastUpdated={lastUpdated} onNavigate={navigate} />,
    leaderboard: <Leaderboard claimId={claimId} refreshToken={refreshToken} />,
    members: <Members data={data} selectedMemberId={selectedMemberId} onSelectMember={setSelectedMemberId} onMemberDetailsOpened={() => trackAnalyticsEvent("member_details_opened")} />,
    skills: <Skills data={data} />,
    production: <Production data={data} refreshToken={refreshToken} selectedMemberId={selectedMemberId} onSelectMember={setSelectedMemberId} />,
    publiccrafts: <div className="panel public-craft-page"><PublicCraftFinder refreshToken={refreshToken} monitoredRegionId={String(data.claim.regionId ?? "")} monitoredOwnerName={getTrackedOwnerName(data.claim)} defaultRegionId={appSettings.defaultRegion} onShowMap={(focus) => { setMapFocus(focus); navigate("map", undefined, focus); }} /></div>,
    craftcalc: <CraftCalculatorPage />,
    inventory: <Inventory data={data} />,
    construction: <Construction data={data} />,
    research: <Research data={data} />,
    market: <Market data={data} history={localHistory.market} claimId={claimId} />,
    empire: <Region data={data} />,
    map: <MapPanel data={data} focus={mapFocus} onClearFocus={() => { setMapFocus(null); updateQueryState({ mapName: null, mapX: null, mapZ: null }); }} />,
    sync: <SyncPanel syncUrl={syncUrl} onSyncUrlSaved={saveSyncUrl} />,
    activity: <ActivityPanel activity={localHistory.activity} activityTotal={localHistory.activityTotal} claimId={claimId} error={localHistory.error} />,
  };
  const activePanel = panels[active] ?? panels.dashboard;
  const partialErrors = Array.isArray(data.raw?.partialErrors) ? data.raw.partialErrors.map((error) => String(error)) : [];
  const apiWarnings = [
    ...(state.error ? [`Main BitJita refresh failed: ${state.error}`] : []),
    ...partialErrors,
  ];

  return (
    <div className={`app-shell density-${density} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="app-sidebar">
        <div className="brand">
          {appSettings.branding.logo ? <img src={`${appSettings.branding.logo.url}?v=${encodeURIComponent(appSettings.branding.logo.updatedAt)}`} alt="" /> : <Shield />}
          <div title={data.claim.name ?? "Settlement"}><h1>{data.claim.name ?? "Settlement"}</h1><span>Claim Monitor</span></div>
          <button className="sidebar-toggle" type="button" onClick={() => setSidebarCollapsed((current) => !current)} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <a className="discord-cta" href="https://discord.gg/ET4bteqbG5" target="_blank" rel="noreferrer" title="Join the community Discord">
          <MessageCircle size={17} />
          <span>Join Discord</span>
          <ExternalLink size={13} />
        </a>
        <nav aria-label="Main navigation">
          {NAV_GROUPS.map((group) => {
            const hasActivePage = group.items.some(([id]) => active === id);
            const isOpen = sidebarGroups[group.id] ?? true;
            const showItems = isOpen || hasActivePage;
            return (
              <section className={`sidebar-section ${showItems ? "" : "is-collapsed"} ${hasActivePage ? "has-active" : ""}`} key={group.id}>
                <button
                  className="sidebar-section-title"
                  type="button"
                  aria-expanded={showItems}
                  onClick={() => setSidebarGroups((current) => ({ ...current, [group.id]: !(current[group.id] ?? true) }))}
                >
                  <span>{group.label}</span>
                  <ArrowDown size={12} aria-hidden="true" />
                </button>
                <div className="sidebar-section-items">
                  {group.items.map(([id, label, Icon]) => (
                    <a
                      key={id}
                      className={active === id ? "active" : ""}
                      href={panelHref(id)}
                      title={label}
                      onClick={(event) => {
                        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                        event.preventDefault();
                        navigate(id);
                      }}
                    >
                      <Icon size={16} /><span className="nav-label">{label}</span>
                    </a>
                  ))}
                </div>
              </section>
            );
          })}
        </nav>
        <div className="refresh-status" title={`Data refreshes automatically every ${appSettings.refreshSeconds} seconds`}>
          <span className={`refresh-dot ${state.loading && state.data ? "refreshing" : ""}`} />
          <span>
            <small>{state.loading && state.data ? "Refreshing" : "Last refresh"}</small>
            <time>{lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Waiting..."}</time>
          </span>
        </div>
      </aside>
      <main ref={mainRef}>
        {!claimId ? <AppSkeleton /> : state.loading && !state.data ? <AppSkeleton /> : state.error && !state.data ? <ApiErrorState message={state.error} /> : (
          <>
            <ApiStatusBanner warnings={apiWarnings} lastUpdated={lastUpdated} />
            <div className="page-view" key={active}>{activePanel}</div>
          </>
        )}
      <footer className="app-footer">
          <div className="footer-links">
            <span className="footer-copy">
              &copy; {new Date().getFullYear()} claim-monitor.com - unofficial fan-made tool.
            </span>
            <a href="https://bitjita.com/docs/api" target="_blank" rel="noreferrer">Data: BitJita API</a>
            <a href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer"><ExternalLink size={13} /> GitHub</a>
            <a href={`${GITHUB_REPOSITORY}/issues`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Feature Requests</a>
            <BuyMeCoffeeButton />
            <button className="footer-link" onClick={() => setPrivacyOpen(true)}><Shield size={13} /> Privacy & Analytics</button>
            <button className="footer-link" onClick={() => setTermsOpen(true)}><FileText size={13} /> Terms</button>
            <a href="https://bitcraftmap.com/" target="_blank" rel="noreferrer"><ExternalLink size={13} /> BitCraft Map</a>
          </div>
        </footer>
      </main>
      <div className="floating-actions" aria-label="Application tools">
        <button onClick={() => setSettlementSetupOpen(true)} aria-label="Change settlement" title="Change settlement"><MapPin size={18} /></button>
        <button onClick={() => setUserSettingsOpen(true)} aria-label="Browser settings" title="Browser settings"><Settings size={18} /></button>
        <button className="notification-button" onClick={() => { setNoticeOpen(true); setNotificationLog((current) => current.map((notice) => ({ ...notice, read: true }))); }} aria-label="Updates" title="Updates"><Bell size={18} />{notificationLog.some((notice) => !notice.read) ? <b>{notificationLog.filter((notice) => !notice.read).length}</b> : null}</button>
        <button className="floating-help" onClick={() => setHelpOpen(true)} aria-label="Help and application information" title="Help and application information">?</button>
      </div>
      <ToastStack notices={toasts} onDismiss={dismissToast} />
      {noticeOpen ? <NotificationDrawer notices={notificationLog} onClose={() => setNoticeOpen(false)} onOpenNotice={(notice) => { setNoticeOpen(false); navigate(notice.destination ?? "activity"); }} /> : null}
      {commandOpen ? <CommandPalette data={data} onClose={() => setCommandOpen(false)} onNavigate={(panel, tab) => navigate(panel, tab)} onSelectMember={setSelectedMemberId} /> : null}
      <SettlementSetupDialog open={settlementSetupOpen} currentClaimId={claimId} currentSyncUrl={syncUrl} onSave={saveMonitorSettings} />
      {userSettingsOpen ? <UserSettingsDialog density={density} onDensityChange={setDensity} toastSettings={{ ...DEFAULT_USER_TOAST_SETTINGS, ...userToastSettings }} onToastSettingsChange={setUserToastSettings} theme={{ ...DEFAULT_THEME, ...browserTheme }} onThemeChange={setBrowserTheme} onResetSettings={() => { clearBrowserLocalSettings(); window.location.reload(); }} onClose={() => setUserSettingsOpen(false)} /> : null}
      {helpOpen ? <HelpCenter version={APP_VERSION} onClose={() => setHelpOpen(false)} onPrivacy={() => setPrivacyOpen(true)} onTerms={() => setTermsOpen(true)} /> : null}
      {consent == null && !privacyOpen ? <CookieBanner onConsent={(choice) => { setAnalyticsPreference(choice); setConsent(choice); }} onPrivacy={() => setPrivacyOpen(true)} /> : null}
      {privacyOpen ? <PrivacyDialog consent={consent} onConsent={(choice) => { setAnalyticsPreference(choice); setConsent(choice); setPrivacyOpen(false); }} onClose={() => setPrivacyOpen(false)} /> : null}
      {termsOpen ? <TermsDialog onClose={() => setTermsOpen(false)} onPrivacy={() => setPrivacyOpen(true)} /> : null}
    </div>
  );
}

function App() {
  const dedicatedLegalPath = window.location.pathname === "/terms" ? "terms" : window.location.pathname === "/privacy" ? "privacy" : null;
  if (dedicatedLegalPath) return <DedicatedLegalPage type={dedicatedLegalPath} />;
  return <DashboardApp />;
}

createRoot(document.getElementById("root")!).render(<App />);
