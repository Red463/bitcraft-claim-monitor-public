import React from "react";
import "./styles/app-chrome.css";
import "./styles/user-settings.css";
import "./styles/notifications.css";
import "./styles/app-popups.css";
import "./styles/first-run-tour.css";
import {
  ArrowDown,
  Bell,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  KeyRound,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Shield,
  ChevronsUpDown,
  X,
} from "lucide-react";
import packageJson from "../package.json";
import { useBitjitaData } from "./api/bitjita";
import { useLocalHistory, useNotificationActivity } from "./api/localHistory";
import { ApiErrorState, ApiStatusBanner, AppSkeleton, RefreshStatus, type ApiStatusDiagnostics } from "./components/main/AppChrome";
import { RouteLoadingState } from "./components/main/RouteLoadingState";
import { CommandPalette } from "./components/main/CommandPalette";
import { NotificationDrawer, ToastStack } from "./components/main/Notifications";
import { AppPopupManager } from "./components/main/AppPopupManager";
import { UserSettingsDialog } from "./components/main/UserSettingsDialog";
import { BuyMeCoffeeButton, DiscordIcon } from "./components/main/SupportLinks";
import { CookieBanner, DedicatedLegalPage, HelpCenter, PrivacyDialog, TermsDialog } from "./components/main/LegalDialogs";
import { FirstRunTourManager } from "./components/main/FirstRunTourManager";
import { useBrowserNotificationSmoke } from "./notifications/useBrowserNotificationSmoke";
import { useBrowserNotificationSources } from "./notifications/useBrowserNotificationSources";
import { useToastNotifications } from "./notifications/useToastNotifications";
import { normalizeUserToastSettings } from "./notifications/userToastSettings";
import { clearBrowserLocalSettings, hasPersistedState, usePersistedState } from "./hooks/usePersistedState";
import { toNumber, type AnyRecord } from "./main-app-data";
import { DEFAULT_SETTINGS, DEFAULT_USER_TOAST_SETTINGS } from "./settingsDefaults";
import { canonicalPanel, DEFAULT_SIDEBAR_GROUPS, NAV, NAV_GROUPS, panelHref, updateQueryState, urlPanel } from "./navigation";
import { settlementNavigationLabel } from "./navigation/navigationLabels";
import { readAnalyticsConsent, setAnalyticsPreference, syncAnalyticsConsent, trackAnalyticsEvent, type AnalyticsConsent } from "./utils/analytics";
import {
  normalizeReleaseBuildId,
  readLastLoadedReleaseBuild,
  releaseUpdateDecision,
  writeLastLoadedReleaseBuild,
} from "./utils/releaseUpdate";
import { normalizeAppSettings } from "./utils/appSettings";
import { getTrackedOwnerName } from "./utils/ownership";
import { normalizeData } from "./utils/normalize";
import { urlMapFocus } from "./utils/mapFocus";
import type { ActivePanel } from "./types/app";
import type { AppSettings, UserToastSettings } from "./types/settings";
import type { MapFocus } from "./pages/map/mapUtils";
import { applyTheme, DEFAULT_THEME, type ThemeSettings } from "./theme";
import { ManualRefreshProvider, type ManualRefreshRequest } from "./refresh/ManualRefreshContext";
import { cooldownRemainingMs, createManualRefreshRequest, createManualRefreshTaskCoordinator, manualRefreshApplies } from "./refresh/manualRefresh.mjs";
import { SettlementPicker } from "./settlements/SettlementPicker";
import {
  SELECTED_SETTLEMENT_STORAGE_KEY,
  initialSettlementId,
  resetSettlementScopedPreferences,
  settlementShareHref,
  shouldShowAnalyticsPrompt,
  validSettlementId,
} from "./settlements/settlementSelection";

/*
 * Top-level browser application shell.
 *
 * This module coordinates the public claim monitor, the admin console, and the
 * focused modules, but cross-cutting state remains here because routing,
 * persisted browser settings, analytics consent, notifications, and the
 * current BitJita payload all need to meet in one place.
 */

const API = "/api/bitjita";
const LOCAL_API = "/api/local";
const GITHUB_REPOSITORY = "https://github.com/Red463/bitcraft-claim-monitor-public";
const CHANGELOG_URL = `${GITHUB_REPOSITORY}/blob/main/CHANGELOG.md`;
const DISCORD_URL = "https://discord.gg/ET4bteqbG5";
const APP_VERSION = packageJson.version;
const RELEASE_UPDATED_NOTICE_MS = 8_000;
const VISUALLY_HIDDEN_STYLE: React.CSSProperties = { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clipPath: "inset(50%)", whiteSpace: "nowrap", border: 0 };

type ManualRefreshState = {
  requestId: string;
  status: "idle" | "refreshing" | "complete";
  pendingTasks: string[];
  errors: string[];
};

const HISTORY_BACKED_PAGES = new Set(["dashboard", "leaderboard", "settlement-market", "market", "activity", "planning"]);

function CollectionCoverage({ claimId, page }: { claimId: string; page: string }) {
  const [coverage, setCoverage] = React.useState<AnyRecord | null>(null);
  React.useEffect(() => {
    if (!claimId || !HISTORY_BACKED_PAGES.has(page)) {
      setCoverage(null);
      return;
    }
    const controller = new AbortController();
    fetch(`${LOCAL_API}/claims/${encodeURIComponent(claimId)}/coverage`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!controller.signal.aborted) setCoverage(payload);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCoverage(null);
      });
    return () => controller.abort();
  }, [claimId, page]);
  if (!coverage) return null;
  const lagMinutes = Math.max(0, Math.round(toNumber(coverage.lagSeconds) / 60));
  return (
    <div className={`api-status-banner ${toNumber(coverage.dataGaps) > 0 || lagMinutes > 15 ? "warning" : ""}`} role="status">
      <strong>History coverage</strong>
      <span>Collecting since {coverage.collectionStart ? new Date(coverage.collectionStart).toLocaleString() : "first successful refresh"}</span>
      <span>Last success {coverage.lastSuccessAt ? new Date(coverage.lastSuccessAt).toLocaleString() : "pending"}</span>
      <span>{lagMinutes}m lag · {toNumber(coverage.dataGaps)} data gap{toNumber(coverage.dataGaps) === 1 ? "" : "s"}</span>
    </div>
  );
}

const Dashboard = React.lazy(() => import("./pages/DashboardPage").then(({ Dashboard }) => ({ default: Dashboard })));
const Leaderboard = React.lazy(() => import("./pages/LeaderboardPage").then(({ Leaderboard }) => ({ default: Leaderboard })));
const Members = React.lazy(() => import("./pages/MembersPage").then(({ Members }) => ({ default: Members })));
const Skills = React.lazy(() => import("./pages/SkillsPage").then(({ Skills }) => ({ default: Skills })));
const Production = React.lazy(() => import("./pages/ProductionPage").then(({ Production }) => ({ default: Production })));
const CraftPlanningPage = React.lazy(() => import("./pages/CraftPlanningPage").then(({ CraftPlanningPage }) => ({ default: CraftPlanningPage })));
const Inventory = React.lazy(() => import("./pages/InventoryPage").then(({ Inventory }) => ({ default: Inventory })));
const Construction = React.lazy(() => import("./pages/ConstructionPage").then(({ Construction }) => ({ default: Construction })));
const Research = React.lazy(() => import("./pages/ResearchPage").then(({ Research }) => ({ default: Research })));
const Market = React.lazy(() => import("./pages/MarketPage").then(({ Market }) => ({ default: Market })));
const SettlementMarket = React.lazy(() => import("./pages/SettlementMarketPage").then(({ SettlementMarket }) => ({ default: SettlementMarket })));
const Region = React.lazy(() => import("./pages/RegionPage").then(({ Region }) => ({ default: Region })));
const Empires = React.lazy(() => import("./pages/EmpiresPage").then(({ Empires }) => ({ default: Empires })));
const ActivityPanel = React.lazy(() => import("./pages/ActivityPage").then(({ ActivityPanel }) => ({ default: ActivityPanel })));
const PublicCraftFinder = React.lazy(() => import("./pages/PublicCraftFinderPage").then(({ PublicCraftFinder }) => ({ default: PublicCraftFinder })));
const MapPanel = React.lazy(() => import("./pages/MapPage").then(({ MapPanel }) => ({ default: MapPanel })));
const AdminPanel = React.lazy(() => import("./components/admin/AdminPanel").then(({ AdminPanel }) => ({ default: AdminPanel })));

class RouteErrorBoundary extends React.Component<{ routeKey: string; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previousProps: { routeKey: string }) {
    if (this.state.failed && previousProps.routeKey !== this.props.routeKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="empty-state route-error-state" role="alert">
        <strong>This page could not be loaded.</strong>
        <span>Check your connection, then try again.</span>
        <button className="toolbar-button primary" onClick={() => window.location.reload()}>Try again</button>
      </section>
    );
  }
}

function hasProductionPayload(raw: AnyRecord | null): boolean {
  return Boolean(raw && Object.prototype.hasOwnProperty.call(raw, "crafts"));
}

function browserInitialSettlementId(): string {
  const saved = validSettlementId(window.localStorage.getItem(SELECTED_SETTLEMENT_STORAGE_KEY));
  const shared = validSettlementId(new URLSearchParams(window.location.search).get("claimId"));
  if (shared && saved && shared !== saved) {
    const accepted = window.confirm(`This link monitors settlement #${shared}. Switch from your saved settlement #${saved}?`);
    if (!accepted) {
      window.history.replaceState(window.history.state, "", settlementShareHref(window.location.href, saved));
      return saved;
    }
  }
  return initialSettlementId({
    search: window.location.search,
    readStorage: (key) => window.localStorage.getItem(key),
  });
}

/**
 * Main public application route.
 *
 * This component owns public navigation, BitJita refreshes, browser-local
 * preferences, notifications, and page composition.
 */
function DashboardApp() {
  const [active, setActive] = usePersistedState<ActivePanel>("navigation.page", "dashboard");
  const [routeSearch, setRouteSearch] = React.useState(() => window.location.search);
  const mainRef = React.useRef<HTMLElement | null>(null);
  const navigationRef = React.useRef<HTMLElement | null>(null);
  const mobileNavigationTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const mobileNavigationWasOpenRef = React.useRef(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = React.useState(false);
  const [mobileFloatingActionsOpen, setMobileFloatingActionsOpen] = React.useState(false);
  const [routeStatus, setRouteStatus] = React.useState("");
  const [isNarrowViewport, setIsNarrowViewport] = React.useState(() => window.matchMedia("(max-width: 920px)").matches);
  const [collapsedNavTooltip, setCollapsedNavTooltip] = React.useState<{ label: string; left: number; top: number } | null>(null);
  React.useEffect(() => {
    const narrowViewport = window.matchMedia("(max-width: 920px)");
    const updateNarrowViewport = () => {
      setIsNarrowViewport(narrowViewport.matches);
      if (narrowViewport.matches) setMobileFloatingActionsOpen(false);
    };
    narrowViewport.addEventListener("change", updateNarrowViewport);
    return () => narrowViewport.removeEventListener("change", updateNarrowViewport);
  }, []);
  const defaultPageAppliedRef = React.useRef(false);
  const savedPageRef = React.useRef(hasPersistedState("navigation.page") || Boolean(urlPanel()));
  const [appSettings, setAppSettings] = React.useState<AppSettings>(DEFAULT_SETTINGS);
  const [appBuildId, setAppBuildId] = React.useState("");
  const appBuildIdRef = React.useRef("");
  const releaseUpdateBuildIdRef = React.useRef("");
  const [releaseUpdateBuildId, setReleaseUpdateBuildId] = React.useState("");
  const [releaseUpdatedNotice, setReleaseUpdatedNotice] = React.useState(false);
  const [adminAuth, setAdminAuth] = React.useState<AnyRecord>({ authenticated: false });
  const [claimId, setClaimId] = React.useState(browserInitialSettlementId);
  const [selectedClaim, setSelectedClaim] = React.useState<AnyRecord | null>(null);
  const [settlementPickerOpen, setSettlementPickerOpen] = React.useState(() => !initialSettlementId({
    search: window.location.search,
    readStorage: (key) => window.localStorage.getItem(key),
  }));
  const [browserTheme, setBrowserTheme] = usePersistedState<ThemeSettings>("theme.local", DEFAULT_THEME);
  const [refreshToken, setRefreshToken] = React.useState(0);
  const [historyAutoRefreshToken, setHistoryAutoRefreshToken] = React.useState(0);
  const [notificationRefreshToken, setNotificationRefreshToken] = React.useState(0);
  const [historyRefreshToken, setHistoryRefreshToken] = React.useState(0);
  const [manualRefreshRequest, setManualRefreshRequest] = React.useState<ManualRefreshRequest | null>(null);
  const [manualRefreshState, setManualRefreshState] = React.useState<ManualRefreshState>({ requestId: "", status: "idle", pendingTasks: [], errors: [] });
  const [manualRefreshClock, setManualRefreshClock] = React.useState(() => Date.now());
  const manualRefreshSequenceRef = React.useRef(0);
  const manualRefreshCompletionRef = React.useRef("");
  const manualRefreshCoordinator = React.useMemo(() => createManualRefreshTaskCoordinator({
    onStateChange: (nextState: ManualRefreshState) => setManualRefreshState(nextState),
  }), []);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [mapFocus, setMapFocus] = usePersistedState<MapFocus>("map.focus", urlMapFocus());
  const [selectedMemberId, setSelectedMemberId] = usePersistedState("production.member", "All");
  const resetNotificationsRef = React.useRef<() => void>(() => undefined);
  const selectSettlement = React.useCallback((claim: AnyRecord) => {
    const nextClaimId = validSettlementId(claim?.claimId ?? claim?.entityId ?? claim?.id);
    if (!nextClaimId) return;
    if (claimId && claimId !== nextClaimId) {
      resetSettlementScopedPreferences((key) => window.localStorage.removeItem(key));
      resetNotificationsRef.current();
    }
    window.localStorage.setItem(SELECTED_SETTLEMENT_STORAGE_KEY, nextClaimId);
    window.history.replaceState(window.history.state, "", settlementShareHref(window.location.href, nextClaimId));
    setSelectedClaim(claim);
    setClaimId(nextClaimId);
    setSelectedMemberId("All");
    setMapFocus(null);
    setLastUpdated(null);
    setRefreshToken((current) => current + 1);
    setHistoryRefreshToken((current) => current + 1);
    setNotificationRefreshToken((current) => current + 1);
    setSettlementPickerOpen(false);
  }, [claimId, setMapFocus, setSelectedMemberId]);
  const [userToastSettings, setUserToastSettings] = usePersistedState<UserToastSettings>("user.notifications", DEFAULT_USER_TOAST_SETTINGS);
  const normalizedUserToastSettings = React.useMemo(() => normalizeUserToastSettings(userToastSettings), [userToastSettings]);
  const { toasts, notificationLog, dismissToast, pushToast, markNotificationLogRead, resetNotifications } = useToastNotifications({ soundSettings: normalizedUserToastSettings });
  resetNotificationsRef.current = resetNotifications;
  const appBuildLabel = React.useMemo(() => {
    const shortBuildId = appBuildId.trim().slice(0, 7);
    return shortBuildId ? `v${APP_VERSION} - ${shortBuildId}` : `v${APP_VERSION}`;
  }, [appBuildId]);
  const [density, setDensity] = usePersistedState<"comfortable" | "compact">("layout.density", "comfortable");
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistedState("layout.sidebarCollapsed", false);
  const [sidebarGroups, setSidebarGroups] = usePersistedState<Record<string, boolean>>("layout.sidebarGroups", DEFAULT_SIDEBAR_GROUPS);
  const [floatingActionsCollapsed, setFloatingActionsCollapsed] = usePersistedState("layout.floatingActionsCollapsed", false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [tourVisible, setTourVisible] = React.useState(false);
  const [tourReplayToken, setTourReplayToken] = React.useState(0);
  const [userSettingsOpen, setUserSettingsOpen] = React.useState(false);
  const [privacyOpen, setPrivacyOpen] = React.useState(false);
  const [termsOpen, setTermsOpen] = React.useState(false);
  const [consent, setConsent] = React.useState<AnalyticsConsent>(() => readAnalyticsConsent());
  const [noticeOpen, setNoticeOpen] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const showCollapsedNavTooltip = React.useCallback((anchor: HTMLAnchorElement, label: string) => {
    if (!sidebarCollapsed || mobileNavigationOpen) return;
    const rect = anchor.getBoundingClientRect();
    setCollapsedNavTooltip({ label, left: rect.right + 10, top: rect.top + rect.height / 2 });
  }, [mobileNavigationOpen, sidebarCollapsed]);
  React.useEffect(() => {
    setCollapsedNavTooltip(null);
  }, [active, mobileNavigationOpen, sidebarCollapsed]);
  React.useEffect(() => {
    if (!collapsedNavTooltip) return;
    const navigation = navigationRef.current;
    const clearCollapsedNavTooltip = () => setCollapsedNavTooltip(null);
    window.addEventListener("resize", clearCollapsedNavTooltip);
    navigation?.addEventListener("scroll", clearCollapsedNavTooltip);
    return () => {
      window.removeEventListener("resize", clearCollapsedNavTooltip);
      navigation?.removeEventListener("scroll", clearCollapsedNavTooltip);
    };
  }, [collapsedNavTooltip]);
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = mobileNavigationOpen ? "hidden" : previousOverflow;
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileNavigationOpen]);
  React.useEffect(() => {
    if (!mobileNavigationOpen && mobileNavigationWasOpenRef.current) mobileNavigationTriggerRef.current?.focus();
    mobileNavigationWasOpenRef.current = mobileNavigationOpen;
  }, [mobileNavigationOpen]);
  React.useEffect(() => {
    if (!mobileNavigationOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavigationOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileNavigationOpen]);
  const trackManualRefreshPromise = React.useCallback(<T,>(taskKey: string, promise: Promise<T>): Promise<T> => {
    const activeRequest = manualRefreshApplies(manualRefreshRequest, active) ? manualRefreshRequest : null;
    if (!activeRequest) return promise;
    const finish = manualRefreshCoordinator.beginTask(activeRequest.id, taskKey);
    return promise
      .then((result) => {
        finish();
        return result;
      })
      .catch((error) => {
        finish(error);
        throw error;
      });
  }, [active, manualRefreshCoordinator, manualRefreshRequest]);
  React.useEffect(() => {
    if (!claimId) {
      setSelectedClaim(null);
      setSettlementPickerOpen(true);
      return;
    }
    const controller = new AbortController();
    fetch(`${LOCAL_API}/claims/${encodeURIComponent(claimId)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to validate the selected settlement");
        setSelectedClaim(payload);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSelectedClaim(null);
        setClaimId("");
        window.localStorage.removeItem(SELECTED_SETTLEMENT_STORAGE_KEY);
        window.history.replaceState(window.history.state, "", settlementShareHref(window.location.href, ""));
        setSettlementPickerOpen(true);
      });
    return () => controller.abort();
  }, [claimId]);
  React.useEffect(() => {
    if (!claimId) return;
    let controller = new AbortController();
    const heartbeat = () => {
      if (document.visibilityState === "hidden") return;
      controller.abort();
      controller = new AbortController();
      void fetch(`${LOCAL_API}/claims/${encodeURIComponent(claimId)}/interest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
      }).catch(() => undefined);
    };
    heartbeat();
    const timer = window.setInterval(heartbeat, 2 * 60 * 1000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [claimId]);
  const state = useBitjitaData(refreshToken, claimId, active, manualRefreshRequest, trackManualRefreshPromise);
  const data = React.useMemo(() => ({ ...normalizeData(state.data), raw: state.data }), [state.data]);
  const localHistory = useLocalHistory(historyAutoRefreshToken + historyRefreshToken, claimId, active, manualRefreshRequest, trackManualRefreshPromise);
  const notificationActivity = useNotificationActivity(notificationRefreshToken, claimId);
  const dealAlertSource = React.useMemo(() => ({ alerts: [], unread: 0, loading: false, error: null, userKey: "", refreshToken: 0 }), []);
  const selectedProductionMember = selectedMemberId === "All" ? null : data.members.find((member: AnyRecord) => String(member.playerEntityId) === selectedMemberId) ?? null;
  syncAnalyticsConsent(consent);
  const refreshAdminAuth = React.useCallback(async () => {
    try {
      const response = await fetch(`${LOCAL_API}/admin/me`);
      if (!response.ok) {
        setAdminAuth({ authenticated: false });
        return;
      }
      setAdminAuth(await response.json());
    } catch {
      setAdminAuth({ authenticated: false });
    }
  }, []);
  const syncRouteSearch = React.useCallback(() => setRouteSearch(window.location.search), []);
  const navigate = React.useCallback((panel: ActivePanel, marketTab?: string, nextMapFocus?: MapFocus) => {
    setActive(panel);
    const activeMapFocus = panel === "map" ? nextMapFocus ?? mapFocus : null;
    updateQueryState({
      page: panel,
      tab: panel === "market" || panel === "settlement-market" ? marketTab ?? null : null,
      item: panel === "market" ? new URLSearchParams(window.location.search).get("item") : null,
      itemName: panel === "market" ? new URLSearchParams(window.location.search).get("itemName") : null,
      itemType: panel === "market" ? new URLSearchParams(window.location.search).get("itemType") : null,
      region: panel === "market" ? new URLSearchParams(window.location.search).get("region") : null,
      buyItem: panel === "market" ? new URLSearchParams(window.location.search).get("buyItem") : null,
      buyItemName: panel === "market" ? new URLSearchParams(window.location.search).get("buyItemName") : null,
      buyItemType: panel === "market" ? new URLSearchParams(window.location.search).get("buyItemType") : null,
      buyRegion: panel === "market" ? new URLSearchParams(window.location.search).get("buyRegion") : null,
      label: activeMapFocus?.name ?? null,
      x: activeMapFocus ? String(activeMapFocus.locationX) : null,
      z: activeMapFocus ? String(activeMapFocus.locationZ) : null,
      mapName: null,
      mapX: null,
      mapZ: null,
      regionId: panel === "map" ? activeMapFocus?.regionId ?? null : null,
    }, "push");
    setRouteSearch(window.location.search);
    const label = NAV.find(([id]) => id === panel)?.[1] ?? "Dashboard";
    setRouteStatus("");
    window.requestAnimationFrame(() => {
      if (mainRef.current) mainRef.current.scrollTop = 0;
      window.scrollTo(0, 0);
      mainRef.current?.focus();
      setRouteStatus(`${label} page loaded`);
    });
  }, [mapFocus, setActive]);
  useBrowserNotificationSmoke({ active, pushToast });


  React.useEffect(() => {
    const canonicalActive = canonicalPanel(String(active));
    if (canonicalActive && canonicalActive !== active) {
      setActive(canonicalActive);
      updateQueryState({ page: canonicalActive });
    }
  }, [active, setActive]);
  React.useEffect(() => {
    const rawPanel = new URLSearchParams(window.location.search).get("page");
    const requested = urlPanel();
    if (requested && rawPanel !== requested) updateQueryState({ page: requested });
    const requestedMapFocus = urlMapFocus();
    if (requestedMapFocus) setMapFocus(requestedMapFocus);
    if (requested) setActive(requested);
    else if (rawPanel) {
      setActive("dashboard");
      updateQueryState({ page: "dashboard" });
    }
    function restoreFromHistory() {
      setRouteStatus("");
      setRouteSearch(window.location.search);
      const historyClaimId = validSettlementId(new URLSearchParams(window.location.search).get("claimId"));
      if (historyClaimId && historyClaimId !== claimId) {
        void fetch(`${LOCAL_API}/claims/${encodeURIComponent(historyClaimId)}`)
          .then(async (response) => {
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "Settlement not found");
            selectSettlement(payload);
          })
          .catch(() => setSettlementPickerOpen(true));
      }
      const rawHistoryPanel = new URLSearchParams(window.location.search).get("page");
      const panel = urlPanel();
      if (panel && rawHistoryPanel !== panel) updateQueryState({ page: panel });
      const historyMapFocus = urlMapFocus();
      if (historyMapFocus) setMapFocus(historyMapFocus);
      if (panel) setActive(panel);
    }
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, [claimId, selectSettlement, setActive, setMapFocus]);
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
    let cancelled = false;
    function reloadForReleaseUpdate() {
      window.location.reload();
    }
    function rememberBuildId(buildId: string) {
      appBuildIdRef.current = buildId;
      if (!cancelled) setAppBuildId(buildId);
    }
    function showReleaseUpdate(buildId: string) {
      releaseUpdateBuildIdRef.current = buildId;
      if (!cancelled) setReleaseUpdateBuildId(buildId);
    }
    async function checkReleaseBuild() {
      try {
        const response = await fetch(`${LOCAL_API}/health`, { cache: "no-store" });
        const nextBuildId = normalizeReleaseBuildId(response.ok ? await response.json() : null);
        const lastLoadedBuildId = readLastLoadedReleaseBuild(window.localStorage);
        const decision = releaseUpdateDecision({
          currentBuildId: appBuildIdRef.current,
          lastLoadedBuildId,
          nextBuildId,
          documentHidden: document.hidden,
        });
        if (decision === "remember") {
          rememberBuildId(nextBuildId);
          writeLastLoadedReleaseBuild(window.localStorage, nextBuildId);
        }
        if (decision === "updated") {
          rememberBuildId(nextBuildId);
          writeLastLoadedReleaseBuild(window.localStorage, nextBuildId);
          if (!cancelled) setReleaseUpdatedNotice(true);
        }
        if (decision === "prompt") showReleaseUpdate(nextBuildId);
        if (decision === "reload") reloadForReleaseUpdate();
      } catch {
        // A failed release check should not interrupt the dashboard.
      }
    }
    function handleReleaseVisibility() {
      if (document.hidden && releaseUpdateBuildIdRef.current) {
        reloadForReleaseUpdate();
        return;
      }
      void checkReleaseBuild();
    }
    void checkReleaseBuild();
    const timer = window.setInterval(checkReleaseBuild, 60_000);
    document.addEventListener("visibilitychange", handleReleaseVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleReleaseVisibility);
    };
  }, []);
  React.useEffect(() => {
    if (!releaseUpdatedNotice) return undefined;
    const timer = window.setTimeout(() => setReleaseUpdatedNotice(false), RELEASE_UPDATED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [releaseUpdatedNotice]);
  React.useEffect(() => {
    fetch(`${LOCAL_API}/config`)
      .then((response) => response.ok ? response.json() : null)
      .then((config) => {
        if (!config) return;
        const next = normalizeAppSettings(config);
        setAppSettings(next);
        if (!defaultPageAppliedRef.current && !savedPageRef.current && next.defaultPage !== "admin") {
          defaultPageAppliedRef.current = true;
          setActive(next.defaultPage);
          updateQueryState({ page: next.defaultPage });
        }
      })
      .catch(() => undefined);
  }, []);
  React.useEffect(() => {
    refreshAdminAuth().catch(() => undefined);
  }, [refreshAdminAuth]);
  React.useEffect(() => {
    applyTheme(browserTheme);
  }, [browserTheme]);
  React.useEffect(() => {
    if (consent !== "accepted") return;
    // Analytics are first-party and consent-gated. Duration is sent on page exit
    // so feature usage can be measured without tracking identifiable users.
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
    const label = NAV.find(([id]) => id === active)?.[1] ?? "Dashboard";
    document.title = `${label} — BitCraft Settlement Monitor`;
  }, [active]);
  React.useEffect(() => {
    const intervalMs = appSettings.refreshSeconds * 1000;
    const visibleBump = (setter: React.Dispatch<React.SetStateAction<number>>) => {
      if (document.visibilityState !== "hidden") setter((x) => x + 1);
    };
    const timers: number[] = [];
    const schedule = (setter: React.Dispatch<React.SetStateAction<number>>, delayMs: number) => {
      const start = window.setTimeout(() => {
        visibleBump(setter);
        timers.push(window.setInterval(() => visibleBump(setter), intervalMs));
      }, delayMs);
      timers.push(start);
    };
    schedule(setRefreshToken, 0);
    schedule(setHistoryAutoRefreshToken, Math.min(5000, Math.floor(intervalMs * 0.25)));
    schedule(setNotificationRefreshToken, Math.min(10000, Math.floor(intervalMs * 0.5)));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [appSettings.refreshSeconds]);
  React.useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) return;
    const favicon = appSettings.branding.favicon;
    link.href = favicon ? `${favicon.url}?v=${encodeURIComponent(favicon.updatedAt)}` : "/favicon.svg";
    link.type = favicon?.contentType ?? "image/svg+xml";
  }, [appSettings.branding.favicon]);
  React.useEffect(() => {
    if (!state.data) return;
    const serverTime = state.updatedAt ?? state.data.serverFreshness?.lastSuccessAt ?? state.data.serverFreshness?.collectedAt ?? state.data.serverFreshness?.cachedAt;
    setLastUpdated(serverTime ? new Date(serverTime) : new Date());
  }, [state.data, state.updatedAt]);
  React.useEffect(() => {
    if (selectedMemberId !== "All" && state.data && !selectedProductionMember) setSelectedMemberId("All");
  }, [selectedMemberId, selectedProductionMember, state.data]);
  useBrowserNotificationSources({
    claimId,
    appToastSettings: appSettings.toastSettings,
    userToastSettings: normalizedUserToastSettings,
    notificationActivity,
    dealAlerts: dealAlertSource,
    productionCrafts: data.crafts,
    productionCraftCatalog: data.raw?.crafts ?? state.data?.crafts,
    hasProductionData: hasProductionPayload(state.data),
    pushToast,
  });
  React.useEffect(() => {
    if (active !== "dashboard" || !appSettings.browserSnapshotsEnabled || !state.data || !data.claim?.entityId) return;
    const controller = new AbortController();
    async function record() {
      try {
        const response = await fetch(`${LOCAL_API}/snapshot`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            claimId,
            claim: data.claim,
            membersCount: data.members.length,
            buildingsCount: data.buildings.length,
            market: data.market,
          }),
          signal: controller.signal,
        });
        if (response.ok) setHistoryRefreshToken((x) => x + 1);
      } catch {
        // The app can still run without the local history server.
      }
    }
    record();
    return () => controller.abort();
  }, [active, appSettings.browserSnapshotsEnabled, claimId, state.data, data.claim, data.members.length, data.buildings.length, data.market]);

  const panels: Record<string, React.ReactNode> = {
    dashboard: <Dashboard data={data} activity={localHistory.activity} marketHistory={localHistory.market} dashboardSummary={localHistory.dashboard} lastUpdated={lastUpdated} selectedPlanId={String(window.localStorage.getItem(`claim-monitor.settlement.${claimId}.selectedPlan`) ?? "")} onNavigate={navigate} />,
    leaderboard: <Leaderboard claimId={claimId} refreshToken={refreshToken} data={data} />,
    members: <Members data={data} selectedMemberId={selectedMemberId} onSelectMember={setSelectedMemberId} onMemberDetailsOpened={() => trackAnalyticsEvent("member_details_opened")} />,
    skills: <Skills data={data} />,
    "craft-monitor": <Production data={data} refreshToken={refreshToken} selectedMemberId={selectedMemberId} onSelectMember={setSelectedMemberId} />,
    planning: <CraftPlanningPage claimId={claimId} refreshToken={refreshToken} />,
    publiccrafts: <div className="panel public-craft-page"><PublicCraftFinder refreshToken={refreshToken} monitoredRegionId={String(data.claim.regionId ?? "")} monitoredOwnerName={getTrackedOwnerName(data.claim)} defaultRegionId={appSettings.defaultRegion} onShowMap={(focus) => { setMapFocus(focus); navigate("map", undefined, focus); }} /></div>,
    inventory: <Inventory data={data} />,
    construction: <Construction data={data} />,
    research: <Research data={data} />,
    market: <Market locationSearch={routeSearch} fallbackRegionId={String(data.claim.regionId ?? "")} onQueryStateChange={syncRouteSearch} onNavigate={navigate} onShowMap={(focus, regionId) => { const target = { ...focus, regionId }; setMapFocus(target); navigate("map", undefined, target); }} />,
    "settlement-market": <SettlementMarket data={data} history={localHistory.market} claimId={claimId} locationSearch={routeSearch} listingsLoading={state.loading} listingError={state.error} onQueryStateChange={syncRouteSearch} />,
    region: <Region data={data} />,
    empires: <Empires monitoredRegionId={String(data.claim.regionId ?? "")} />,
    map: <MapPanel data={data} focus={mapFocus} onClearFocus={() => { setMapFocus(null); updateQueryState({ label: null, x: null, z: null, regionId: null, mapName: null, mapX: null, mapZ: null }); }} />,
    activity: <ActivityPanel activity={localHistory.activity} activityTotal={localHistory.activityTotal} claimId={claimId} error={localHistory.error} />,
    admin: <AdminPanel settings={appSettings} members={normalizeData(state.data).members} onAuthChanged={setAdminAuth} onSettingsSaved={(settings) => { setAppSettings(settings); setRefreshToken((x) => x + 1); setHistoryRefreshToken((x) => x + 1); }} />,
  };
  const activePageLabel = NAV.find(([id]) => id === active)?.[1] ?? "This page";
  const configuredPanel = panels[active] ?? panels.dashboard;
  const activePanel = active !== "admin" && appSettings.maintenanceMode
    ? <section className="panel empty-state"><Settings size={34} /><strong>Scheduled maintenance</strong><span>The public monitor is temporarily unavailable. Please try again shortly.</span></section>
    : active !== "admin" && appSettings.pageFlags[active] === false
      ? <section className="panel empty-state"><Shield size={34} /><strong>{activePageLabel} is temporarily unavailable</strong><span>This page has been disabled by the site operator.</span><button className="toolbar-button primary" onClick={() => navigate("dashboard")}>Return to Dashboard</button></section>
      : configuredPanel;
  const manualRefreshIsRefreshing = manualRefreshState.status === "refreshing";
  const manualRefreshCooldownMs = cooldownRemainingMs(manualRefreshRequest?.requestedAt, manualRefreshClock);
  const manualRefreshCooldownSeconds = Math.ceil(manualRefreshCooldownMs / 1000);
  const manualRefreshIsCoolingDown = !manualRefreshIsRefreshing && manualRefreshCooldownMs > 0;
  const manualRefreshHasErrors = manualRefreshState.status === "complete" && manualRefreshState.errors.length > 0;
  const manualRefreshButtonDisabled = manualRefreshIsRefreshing || manualRefreshCooldownMs > 0;
  const manualRefreshButtonLabel = manualRefreshIsRefreshing
    ? `Refreshing ${activePageLabel} data`
    : manualRefreshCooldownMs > 0
      ? `${manualRefreshHasErrors ? "Refresh finished with issues. " : "Data refreshed. "}Refresh available in ${manualRefreshCooldownSeconds} seconds`
      : "Refresh data now";
  const manualRefreshStatusText = manualRefreshIsRefreshing
    ? `${manualRefreshButtonLabel}. Current data remains visible.`
    : manualRefreshState.status === "complete"
      ? manualRefreshHasErrors
        ? `Refresh finished with ${manualRefreshState.errors.length} ${manualRefreshState.errors.length === 1 ? "issue" : "issues"}. Current data remains visible.`
        : "Data refreshed."
      : "";
  const requestManualRefresh = React.useCallback(() => {
    const now = Date.now();
    if (manualRefreshState.status === "refreshing" || cooldownRemainingMs(manualRefreshRequest?.requestedAt, now) > 0) return;
    manualRefreshSequenceRef.current += 1;
    const request = createManualRefreshRequest(active, manualRefreshSequenceRef.current, { now: () => now });
    manualRefreshCoordinator.beginRequest(request.id);
    setManualRefreshClock(now);
    setManualRefreshRequest(request);
    setNotificationRefreshToken((current) => current + 1);
  }, [active, manualRefreshCoordinator, manualRefreshRequest?.requestedAt, manualRefreshState.status]);
  React.useEffect(() => {
    if (!manualRefreshRequest) return undefined;
    const timer = window.setTimeout(() => manualRefreshCoordinator.seal(manualRefreshRequest.id), 0);
    return () => window.clearTimeout(timer);
  }, [manualRefreshCoordinator, manualRefreshRequest]);
  React.useEffect(() => {
    if (!manualRefreshRequest || manualRefreshCooldownMs <= 0) return undefined;
    const timer = window.setInterval(() => setManualRefreshClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [manualRefreshCooldownMs > 0, manualRefreshRequest?.id]);
  React.useEffect(() => {
    if (manualRefreshState.status !== "complete" || !manualRefreshState.requestId || manualRefreshCompletionRef.current === manualRefreshState.requestId) return;
    manualRefreshCompletionRef.current = manualRefreshState.requestId;
    setRouteStatus(manualRefreshState.errors.length > 0 ? "Refresh finished with issues. Current data remains visible." : "Data refreshed.");
  }, [manualRefreshState.errors.length, manualRefreshState.requestId, manualRefreshState.status]);
  const apiWarnings = React.useMemo(() => {
    const partialErrors = Array.isArray(data.raw?.partialErrors) ? data.raw.partialErrors.map((error) => String(error)) : [];
    const staleWarning = state.stale
      ? `Showing cached data${lastUpdated ? ` from ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""} while refresh continues.`
      : "";
    return [
      ...(state.error ? [`Main BitJita refresh failed: ${state.error}`] : []),
      ...(staleWarning ? [staleWarning] : []),
      ...partialErrors,
    ];
  }, [data.raw?.partialErrors, lastUpdated, state.error, state.stale]);
  const apiDiagnostics = React.useMemo<ApiStatusDiagnostics>(() => ({
    appVersion: APP_VERSION,
    page: active,
    claimId,
    url: window.location.href,
    loading: state.loading,
    lastSuccessfulRefresh: lastUpdated?.toISOString() ?? null,
    warningCount: apiWarnings.length,
    dataCounts: {
      members: data.members.length,
      citizens: data.citizens.length,
      crafts: data.crafts.length,
      constructionProjects: Array.isArray(data.construction) ? data.construction.length : toNumber(data.construction?.projects?.length),
      marketListings: data.market.length,
      inventories: Array.isArray(data.inventories?.inventories) ? data.inventories.inventories.length : 0,
      regionClaims: data.region.length,
    },
    warnings: apiWarnings,
  }), [active, apiWarnings, claimId, data.citizens.length, data.construction, data.crafts.length, data.inventories, data.market.length, data.members.length, data.region.length, lastUpdated, state.loading]);

  const mobileNavigationUnavailable = isNarrowViewport && !mobileNavigationOpen;
  const narrowAwareFloatingActionsCollapsed = isNarrowViewport ? !mobileFloatingActionsOpen : floatingActionsCollapsed;
  return (
    <div className={`app-shell density-${density} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <header className="mobile-shell-bar">
        <button type="button" className="mobile-settlement-switcher" onClick={() => setSettlementPickerOpen(true)} aria-label="Change monitored settlement">
          <Building2 size={16} />
          <span><strong className="mobile-shell-brand">{selectedClaim?.name ?? data.claim.name ?? "Choose settlement"}</strong><small className="mobile-shell-route">{activePageLabel}</small></span>
          <ChevronsUpDown size={14} />
        </button>
        <button ref={mobileNavigationTriggerRef} type="button" aria-label="Open navigation" aria-controls="mobile-navigation" aria-expanded={mobileNavigationOpen} onClick={() => setMobileNavigationOpen(true)}>
          <Menu size={18} />
        </button>
      </header>
      {mobileNavigationOpen ? <button type="button" className="mobile-navigation-backdrop" aria-label="Close navigation" onClick={() => setMobileNavigationOpen(false)} /> : null}
      <aside id="mobile-navigation" aria-label="Mobile navigation" aria-hidden={mobileNavigationUnavailable ? true : undefined} inert={mobileNavigationUnavailable ? true : undefined} className={`app-sidebar ${mobileNavigationOpen ? "mobile-open" : ""}`}>
        <button type="button" className="mobile-navigation-close" aria-label="Close navigation" onClick={() => setMobileNavigationOpen(false)}><X size={18} /></button>
        <div className="brand">
          {appSettings.branding.logo ? <img src={`${appSettings.branding.logo.url}?v=${encodeURIComponent(appSettings.branding.logo.updatedAt)}`} alt="" /> : <Shield />}
          <div title={selectedClaim?.name ?? data.claim.name ?? "Settlement"}><h1>{selectedClaim?.name ?? data.claim.name ?? "Settlement"}</h1><span>Settlement Monitor</span></div>
          <button className="sidebar-toggle" type="button" onClick={() => setSidebarCollapsed((current) => !current)} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <div className="sidebar-top-stack">
          <button type="button" className="settlement-switcher-button" onClick={() => setSettlementPickerOpen(true)} aria-label="Change monitored settlement">
            <span className="sidebar-account-avatar"><Building2 size={16} /></span>
            <span className="sidebar-account-copy"><strong>{selectedClaim?.name ?? data.claim.name ?? "Choose settlement"}</strong><small>{claimId ? `Claim #${claimId}${selectedClaim?.regionId ? ` · Region ${selectedClaim.regionId}` : ""}` : "Select a settlement to begin"}</small></span>
            <ChevronsUpDown size={14} />
          </button>
          <a className="discord-cta" href={DISCORD_URL} target="_blank" rel="noreferrer"><DiscordIcon size={18} /><span>Join Discord Server</span><ExternalLink size={13} /></a>
        </div>
        <nav ref={navigationRef} aria-label="Main navigation" data-tour="sidebar-navigation">
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
                  <span>{group.id === "settlement" ? settlementNavigationLabel(data.claim.name) : group.label}</span>
                  <ArrowDown size={12} aria-hidden="true" />
                </button>
                <div className="sidebar-section-items">
                  {group.items.filter(([id]) => appSettings.pageFlags[id] !== false).map(([id, label, Icon]) => {
                    const accessibleLabel = label;
                    return (
                      <a
                        key={id}
                        className={[`nav-destination`, active === id ? "active" : ""].filter(Boolean).join(" ")}
                        href={panelHref(id)}
                        aria-current={active === id ? "page" : undefined}
                        aria-label={label}
                        title={accessibleLabel}
                        onMouseEnter={(event) => showCollapsedNavTooltip(event.currentTarget, accessibleLabel)}
                        onMouseLeave={() => setCollapsedNavTooltip(null)}
                        onFocus={(event) => showCollapsedNavTooltip(event.currentTarget, accessibleLabel)}
                        onBlur={() => setCollapsedNavTooltip(null)}
                        onClick={(event) => {
                          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                          event.preventDefault();
                          navigate(id);
                          setMobileNavigationOpen(false);
                        }}
                      >
                        <Icon size={16} /><span className="nav-label">{label}</span>
                        <span className="collapsed-nav-label" aria-hidden="true">{label}</span>
                      </a>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </nav>
        <RefreshStatus
          loading={state.loading && Boolean(state.data)}
          lastUpdated={lastUpdated}
          collectorStatus={data.raw?.collectorStatus}
          intervalSeconds={appSettings.refreshSeconds}
        />
      </aside>
      {collapsedNavTooltip ? <span className="collapsed-nav-tooltip" aria-hidden="true" style={{ left: collapsedNavTooltip.left, top: collapsedNavTooltip.top }}>{collapsedNavTooltip.label}</span> : null}
      <main ref={mainRef} tabIndex={-1}>
        <p role="status" aria-live="polite" aria-atomic="true" style={VISUALLY_HIDDEN_STYLE}>{routeStatus}</p>
        <p role="status" aria-live="polite" aria-atomic="true" style={VISUALLY_HIDDEN_STYLE}>{manualRefreshStatusText}</p>
        <div className={`page-refresh-line ${state.loading || manualRefreshIsRefreshing ? "is-visible" : ""}`} aria-hidden="true" />
        {state.loading && !state.data ? <AppSkeleton /> : state.error && !state.data ? <ApiErrorState message={state.error} /> : (
          <>
            <ApiStatusBanner warnings={apiWarnings} lastUpdated={lastUpdated} diagnostics={apiDiagnostics} />
            {active !== "admin" && appSettings.announcement ? <div className="api-status-banner" role="status"><strong>Announcement</strong><span>{appSettings.announcement}</span></div> : null}
            <CollectionCoverage claimId={claimId} page={active} />
            <div className="page-view" key={`${claimId}:${active}`}>
              <RouteErrorBoundary routeKey={`${claimId}:${active}`}>
                <React.Suspense fallback={<RouteLoadingState label={activePageLabel} />}>
                  <ManualRefreshProvider page={active} request={manualRefreshRequest} coordinator={manualRefreshCoordinator}>
                    {activePanel}
                  </ManualRefreshProvider>
                </React.Suspense>
              </RouteErrorBoundary>
            </div>
          </>
        )}
      <footer className="app-footer">
          <div className="footer-links">
            <span className="footer-copy">
              &copy; {new Date().getFullYear()} BitCraft Settlement Monitor — unofficial fan-made tool.
            </span>
            <span className="footer-build" title={appBuildId ? `Version ${APP_VERSION}, commit ${appBuildId}` : `Version ${APP_VERSION}`}>
              {appBuildLabel}
            </span>
            <a href="https://bitjita.com/docs/api" target="_blank" rel="noreferrer">Data: BitJita API</a>
            <a href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer"><ExternalLink size={13} /> GitHub</a>
            <a href={`${GITHUB_REPOSITORY}/issues`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Feature Requests</a>
            <BuyMeCoffeeButton />
            <button className="footer-link" onClick={() => setPrivacyOpen(true)}><Shield size={13} /> Privacy & Analytics</button>
            <button className="footer-link" onClick={() => setTermsOpen(true)}><FileText size={13} /> Terms of Use</button>
            <a href="https://bitcraftmap.com/" target="_blank" rel="noreferrer"><ExternalLink size={13} /> BitCraft Map</a>
          </div>
        </footer>
      </main>
      {releaseUpdateBuildId ? (
        <div className="release-update-banner" role="status" aria-live="polite">
          <div>
            <strong>Update available</strong>
            <span>A newer version is ready. Refresh to use the latest app.</span>
          </div>
          <button className="toolbar-button primary" onClick={() => window.location.reload()}>
            <RefreshCw size={14} /> Refresh now
          </button>
        </div>
      ) : releaseUpdatedNotice ? (
        <div className="release-update-banner is-updated" role="status" aria-live="polite">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>
            <strong>App updated</strong>
            <span>
              You're now using the latest version.{" "}
              <a href={CHANGELOG_URL} target="_blank" rel="noreferrer">View changelog</a>
            </span>
          </div>
        </div>
      ) : null}
      <div className={`floating-actions ${narrowAwareFloatingActionsCollapsed ? "floating-actions-collapsed" : ""}`} aria-label="Application tools" data-tour="floating-actions">
        <button
          className="floating-actions-toggle"
          onClick={() => isNarrowViewport ? setMobileFloatingActionsOpen((current) => !current) : setFloatingActionsCollapsed((current) => !current)}
          aria-expanded={!narrowAwareFloatingActionsCollapsed}
          aria-label={narrowAwareFloatingActionsCollapsed ? "Show tools" : "Hide tools"}
          title={narrowAwareFloatingActionsCollapsed ? "Show tools" : "Hide tools"}
        >
          {narrowAwareFloatingActionsCollapsed ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
        </button>
        {adminAuth.authenticated ? <a
          className={`floating-action-item ${active === "admin" ? "active" : ""}`}
          href={panelHref("admin")}
          aria-label="Admin console"
          title="Admin console"
          onClick={(event) => {
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            navigate("admin");
          }}
        >
          <KeyRound size={18} />
        </a> : null}
        <button
          className={`floating-action-item ${
            manualRefreshIsRefreshing ? "is-refreshing" : manualRefreshIsCoolingDown ? "is-cooldown" : ""
          }`}
          onClick={requestManualRefresh}
          aria-label={manualRefreshButtonLabel}
          title={manualRefreshButtonLabel}
          aria-busy={manualRefreshIsRefreshing}
          aria-disabled={manualRefreshButtonDisabled}
          disabled={manualRefreshButtonDisabled}
        >
          {manualRefreshIsCoolingDown ? (
            <span className="refresh-cooldown-countdown" aria-hidden="true">
              {manualRefreshCooldownSeconds}s
            </span>
          ) : (
            <RefreshCw size={18} />
          )}
        </button>
        <button className="floating-action-item" onClick={() => setUserSettingsOpen(true)} aria-label="Browser settings" title="Browser settings"><Settings size={18} /></button>
        <button className="floating-action-item notification-button" onClick={() => { setNoticeOpen(true); markNotificationLogRead(); }} aria-label="Updates" title="Updates"><Bell size={18} />{notificationLog.some((notice) => !notice.read) ? <b>{notificationLog.filter((notice) => !notice.read).length}</b> : null}</button>
        <button className="floating-action-item floating-help" onClick={() => setHelpOpen(true)} aria-label="Help and application information" title="Help and application information">?</button>
      </div>
      {!tourVisible ? <ToastStack notices={toasts} onDismiss={dismissToast} /> : null}
      {noticeOpen ? <NotificationDrawer notices={notificationLog} onClose={() => setNoticeOpen(false)} onOpenNotice={(notice) => { setNoticeOpen(false); navigate(notice.destination ?? "activity"); }} /> : null}
      {commandOpen ? <CommandPalette adminAuthenticated={Boolean(adminAuth.authenticated)} members={data.members} onClose={() => setCommandOpen(false)} onNavigate={(panel, tab) => navigate(panel, tab)} onSelectMember={setSelectedMemberId} /> : null}
      {userSettingsOpen ? <UserSettingsDialog density={density} onDensityChange={setDensity} toastSettings={normalizedUserToastSettings} appToastSettings={appSettings.toastSettings} onToastSettingsChange={(settings) => setUserToastSettings(normalizeUserToastSettings(settings))} theme={{ ...DEFAULT_THEME, ...browserTheme }} onThemeChange={setBrowserTheme} showAdminTools={Boolean(adminAuth.authenticated)} onOpenAdmin={() => { setUserSettingsOpen(false); navigate("admin"); }} onResetSettings={() => { clearBrowserLocalSettings(); window.location.reload(); }} modal onClose={() => setUserSettingsOpen(false)} /> : null}
      {helpOpen ? <HelpCenter activePage={active} version={APP_VERSION} onClose={() => setHelpOpen(false)} onPrivacy={() => setPrivacyOpen(true)} onTerms={() => setTermsOpen(true)} onStartTour={() => { setHelpOpen(false); setTourReplayToken((current) => current + 1); }} /> : null}
      {shouldShowAnalyticsPrompt({ consent, claimId, settlementPickerOpen, privacyOpen })
        ? <CookieBanner onConsent={(choice) => { setAnalyticsPreference(choice); setConsent(choice); }} onPrivacy={() => setPrivacyOpen(true)} />
        : null}
      {privacyOpen ? <PrivacyDialog consent={consent} onConsent={(choice) => { setAnalyticsPreference(choice); setConsent(choice); setPrivacyOpen(false); }} onClose={() => setPrivacyOpen(false)} /> : null}
      {termsOpen ? <TermsDialog onClose={() => setTermsOpen(false)} onPrivacy={() => setPrivacyOpen(true)} /> : null}
      <FirstRunTourManager activePage={active} enabled={Boolean(claimId) && !settlementPickerOpen && active !== "admin" && consent != null && !userSettingsOpen && !helpOpen && !privacyOpen && !termsOpen && !commandOpen && !noticeOpen} replayToken={tourReplayToken} onNavigate={(panel) => navigate(panel)} onVisibilityChange={setTourVisible} />
      <AppPopupManager activePage={active} enabled={active !== "admin" && !tourVisible && !userSettingsOpen && !helpOpen && !privacyOpen && !termsOpen && !commandOpen && !noticeOpen} />
      {settlementPickerOpen ? <SettlementPicker currentClaimId={claimId} mode={claimId ? "switch" : "welcome"} onCancel={claimId ? () => setSettlementPickerOpen(false) : undefined} onSelect={selectSettlement} /> : null}
    </div>
  );
}

function DedicatedLegalApp({ type }: { type: "terms" | "privacy" }) {
  React.useEffect(() => {
    document.title = `${type === "terms" ? "Terms of Use" : "Privacy Policy"} — BitCraft Settlement Monitor`;
  }, [type]);
  return <DedicatedLegalPage type={type} />;
}

export default function App() {
  const dedicatedLegalPath = window.location.pathname === "/terms" ? "terms" : window.location.pathname === "/privacy" ? "privacy" : null;
  // Route-level branching happens before mounting DashboardApp so legal pages
  // do not initialise public page data unnecessarily.
  if (dedicatedLegalPath) return <DedicatedLegalApp type={dedicatedLegalPath} />;
  return <DashboardApp />;
}
