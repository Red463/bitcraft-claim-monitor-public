import React from "react";
import {
  Activity,
  Archive,
  Database,
  FileWarning,
  KeyRound,
  LogOut,
  RefreshCw,
  Save,
  Server,
  Settings,
  Shield,
  Trash2,
  Users,
} from "lucide-react";

import type { AnyRecord } from "../../main-app-data";
import type { AppSettings } from "../../types/settings";
import { dateLabel, formatNumber, timeAgo } from "../../utils/format";
import { AdminPopupsSection } from "./AdminPopupsSection";
import "../../styles/admin.css";
import "../../styles/server-health.css";

const API = "/api/local";
const PUBLIC_PAGE_FLAGS: Array<[keyof AppSettings["pageFlags"], string]> = [
  ["dashboard", "Dashboard"],
  ["leaderboard", "Leaderboard"],
  ["members", "Members"],
  ["skills", "Professions"],
  ["craft-monitor", "Craft Monitor"],
  ["planning", "Craft Planning"],
  ["inventory", "Inventory"],
  ["construction", "Construction"],
  ["research", "Research"],
  ["settlement-market", "Local Market"],
  ["market", "Market"],
  ["region", "Region"],
  ["empires", "Empires"],
  ["map", "Map"],
  ["activity", "Activity"],
  ["publiccrafts", "Public Craft Finder"],
];

type AdminTab = "operations" | "claims" | "plans" | "settings" | "administrators" | "analytics" | "data" | "audit";

const TABS: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: "operations", label: "Operations", icon: Activity },
  { id: "claims", label: "Active settlements", icon: Server },
  { id: "plans", label: "Shared plans", icon: FileWarning },
  { id: "settings", label: "Public settings", icon: Settings },
  { id: "administrators", label: "Administrators", icon: Users },
  { id: "analytics", label: "Analytics", icon: Activity },
  { id: "data", label: "Data & backups", icon: Database },
  { id: "audit", label: "Audit", icon: Shield },
];

export type AdminPanelProps = {
  settings: AppSettings;
  members?: AnyRecord[];
  onSettingsSaved: (settings: AppSettings) => void;
  botOnly?: boolean;
  headingLevel?: 1 | 2;
  onAuthChanged?: (auth: AnyRecord) => void;
};

function valueLabel(value: unknown) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function DataPairs({ value }: { value: AnyRecord | null }) {
  if (!value) return <p className="legend">No data returned.</p>;
  return (
    <div className="stats-grid">
      {Object.entries(value).slice(0, 18).map(([key, entry]) => (
        <article className="stat-card" key={key}>
          <span>{key.replaceAll("_", " ")}</span>
          <strong title={valueLabel(entry)}>{valueLabel(entry)}</strong>
        </article>
      ))}
    </div>
  );
}

export function AdminPanel({
  settings,
  onSettingsSaved,
  headingLevel = 2,
  onAuthChanged,
}: AdminPanelProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const [auth, setAuth] = React.useState<AnyRecord | null>(null);
  const [tab, setTab] = React.useState<AdminTab>("operations");
  const [data, setData] = React.useState<AnyRecord | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [draft, setDraft] = React.useState<AppSettings>(settings);
  const [newAdmin, setNewAdmin] = React.useState({ discordId: "", displayName: "", role: "admin" });

  const api = React.useCallback(async (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    headers.set("content-type", "application/json");
    if (options.method && options.method !== "GET" && auth?.csrfToken) {
      headers.set("x-csrf-token", String(auth.csrfToken));
    }
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    return body as AnyRecord;
  }, [auth?.csrfToken]);

  const loadAuth = React.useCallback(async () => {
    const response = await fetch(`${API}/admin/me`);
    const next = await response.json();
    setAuth(next);
    onAuthChanged?.(next);
    return next as AnyRecord;
  }, [onAuthChanged]);

  const loadTab = React.useCallback(async (selected: AdminTab) => {
    const endpoint: Record<AdminTab, string> = {
      operations: "/admin/status",
      claims: "/admin/claims",
      plans: "/admin/craft-plans?includeArchived=1",
      settings: "/admin/settings",
      administrators: "/admin/users",
      analytics: "/admin/analytics?days=30",
      data: "/admin/backups",
      audit: "/admin/audit?limit=150",
    };
    setLoading(true);
    setMessage("");
    try {
      setData(await api(endpoint[selected]));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  React.useEffect(() => {
    let active = true;
    void loadAuth().then((next) => {
      if (!active) return;
      setLoading(false);
      if (next.authenticated) void loadTab(tab);
    }).catch((error) => {
      if (active) {
        setMessage(error instanceof Error ? error.message : String(error));
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  React.useEffect(() => setDraft(settings), [settings]);
  React.useEffect(() => {
    if (auth?.authenticated) void loadTab(tab);
  }, [tab]);

  async function mutate(path: string, options: RequestInit, success: string) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(path, options);
      setMessage(success);
      await loadTab(tab);
      return result;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function uploadBranding(type: "logo" | "favicon", file: File | null) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Unable to read branding file"));
        reader.readAsDataURL(file);
      });
      const result = await api("/admin/branding", {
        method: "POST",
        body: JSON.stringify({ type, dataUrl }),
      });
      setDraft((current) => ({ ...current, branding: result.branding ?? current.branding }));
      setMessage(`${type === "logo" ? "Logo" : "Favicon"} uploaded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function rotateAdminPlanKey(plan: AnyRecord) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api(`/admin/craft-plans/${encodeURIComponent(String(plan.planId))}/rotate-key`, {
        method: "POST",
        body: "{}",
      });
      const recoveryUrl = new URL("/", window.location.origin);
      recoveryUrl.searchParams.set("claimId", String(plan.claimId));
      recoveryUrl.searchParams.set("planId", String(plan.planId));
      recoveryUrl.hash = `plan-edit=${encodeURIComponent(String(result.editKey ?? ""))}`;
      setMessage(`Edit key rotated. Recovery URL (shown once): ${recoveryUrl}`);
      await loadTab(tab);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !auth) {
    return <section className="panel admin-login"><KeyRound size={28} /><Heading>Checking administrator session…</Heading></section>;
  }

  if (!auth?.authenticated) {
    const loginUrl = String(auth?.discordLoginUrl ?? `${API}/admin/auth/discord/start?returnTo=${encodeURIComponent("/?page=admin")}`);
    return (
      <section className="panel admin-login">
        <Shield size={32} />
        <Heading>Administrator sign-in</Heading>
        <p>Discord is used only to authenticate approved operators. Public visitors do not need an account.</p>
        {auth?.discordLoginEnabled
          ? <a className="toolbar-button primary" href={loginUrl}>Continue with Discord</a>
          : <p className="error">The dedicated administrator OAuth application is not configured.</p>}
        {message ? <p className="error">{message}</p> : null}
      </section>
    );
  }

  const role = String(auth.user?.role ?? "viewer");
  const canChange = role === "owner" || role === "admin";
  const plans: AnyRecord[] = Array.isArray(data?.plans) ? data.plans : [];
  const reports: AnyRecord[] = Array.isArray(data?.reports) ? data.reports : [];
  const activeClaims: AnyRecord[] = Array.isArray(data?.activeClaims) ? data.activeClaims : [];
  const users: AnyRecord[] = Array.isArray(data?.users) ? data.users : [];
  const backups: AnyRecord[] = Array.isArray(data?.backups) ? data.backups : [];
  const auditRows: AnyRecord[] = Array.isArray(data?.auditLog) ? data.auditLog : [];

  return (
    <section className="panel admin-panel">
      <header className="members-topbar admin-topbar">
        <div>
          <span className="eyebrow">Protected console</span>
          <Heading>Settlement Monitor Admin</Heading>
          <p>{auth.user?.username} · {role}</p>
        </div>
        <button className="toolbar-button" onClick={() => void mutate("/admin/logout", { method: "POST", body: "{}" }, "")}>
          <LogOut size={15} /> Sign out
        </button>
      </header>

      <nav className="admin-tabs" aria-label="Admin sections">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>

      {message ? <p className={message.toLowerCase().includes("error") ? "error" : "legend"} role="status">{message}</p> : null}
      {loading ? <p className="legend">Loading…</p> : null}

      {!loading && tab === "operations" ? (
        <div className="admin-section-stack">
          <div className="split-header">
            <div><h3>Server and collection status</h3><p className="legend">Runtime, request budgets, collectors, and persisted records.</p></div>
            <button className="toolbar-button" onClick={() => void loadTab(tab)}><RefreshCw size={14} /> Refresh</button>
          </div>
          <DataPairs value={data} />
        </div>
      ) : null}

      {!loading && tab === "claims" ? (
        <div className="admin-section-stack">
          <div className="split-header">
            <div><h3>Claim directory and active collection</h3><p className="legend">Only recently interested settlements receive server-backed history collection.</p></div>
            {canChange ? <button disabled={busy} className="toolbar-button primary" onClick={() => void mutate("/admin/claims/refresh", { method: "POST", body: "{}" }, "Claim directory refreshed.")}><RefreshCw size={14} /> Refresh directory</button> : null}
          </div>
          <DataPairs value={data?.directory ?? null} />
          <div className="table-wrap"><table><thead><tr><th>Settlement</th><th>Last interest</th><th>Last success</th><th>Lag</th><th>Gaps</th></tr></thead><tbody>
            {activeClaims.map((claim) => <tr key={claim.claimId}><td>{claim.claimName ?? `Claim ${claim.claimId}`} <small>#{claim.claimId}</small></td><td>{timeAgo(claim.lastInterestAt)}</td><td>{timeAgo(claim.coverage?.lastSuccessAt)}</td><td>{valueLabel(claim.coverage?.lagSeconds)}</td><td>{valueLabel(claim.coverage?.gaps)}</td></tr>)}
          </tbody></table></div>
        </div>
      ) : null}

      {!loading && tab === "plans" ? (
        <div className="admin-section-stack">
          <h3>Shared-plan moderation</h3>
          {reports.length ? <p className="error">{reports.length} open abuse report{reports.length === 1 ? "" : "s"}</p> : <p className="legend">No open abuse reports.</p>}
          {reports.length ? <div className="table-wrap"><table><thead><tr><th>Report</th><th>Plan</th><th>Reason</th><th>Submitted</th><th /></tr></thead><tbody>
            {reports.map((report) => <tr key={report.reportId}><td>#{report.reportId}</td><td>{report.planId}<br /><small>Settlement #{report.claimId}</small></td><td>{report.reason}{report.details ? <><br /><small>{report.details}</small></> : null}</td><td>{dateLabel(report.createdAt)}</td><td className="table-actions">
              {canChange ? <button className="toolbar-button" onClick={() => void mutate(`/admin/craft-plan-reports/${report.reportId}/resolve`, { method: "POST", body: "{}" }, "Report resolved.")}>Resolve</button> : null}
              {canChange ? <button className="toolbar-button" onClick={() => void mutate(`/admin/craft-plan-reports/${report.reportId}/dismiss`, { method: "POST", body: "{}" }, "Report dismissed.")}>Dismiss</button> : null}
            </td></tr>)}
          </tbody></table></div> : null}
          <div className="table-wrap"><table><thead><tr><th>Plan</th><th>Settlement</th><th>Revision</th><th>Updated</th><th>Status</th><th /></tr></thead><tbody>
            {plans.map((plan) => <tr key={plan.planId}><td><strong>{plan.title}</strong><br /><small>{plan.planId}</small></td><td>#{plan.claimId}</td><td>{plan.revision}</td><td>{dateLabel(plan.updatedAt)}</td><td>{plan.archivedAt ? "Archived" : "Active"}</td><td className="table-actions">
              {canChange && !plan.archivedAt ? <button className="icon-button" title="Archive" onClick={() => void mutate(`/admin/craft-plans/${encodeURIComponent(plan.planId)}/archive`, { method: "POST", body: "{}" }, "Plan archived.")}><Archive size={14} /></button> : null}
              {canChange ? <button className="icon-button" title="Rotate edit key" onClick={() => void rotateAdminPlanKey(plan)}><KeyRound size={14} /></button> : null}
              {role === "owner" ? <button className="icon-button danger" title="Hard delete" onClick={() => window.confirm(`Permanently delete ${plan.planId}?`) && void mutate(`/admin/craft-plans/${encodeURIComponent(plan.planId)}?confirm=${encodeURIComponent(plan.planId)}`, { method: "DELETE", body: "{}" }, "Plan deleted.")}><Trash2 size={14} /></button> : null}
            </td></tr>)}
          </tbody></table></div>
        </div>
      ) : null}

      {!loading && tab === "settings" ? (
        <>
        <form className="admin-section-stack" onSubmit={(event) => {
          event.preventDefault();
          void (async () => {
            const result = await mutate("/admin/settings", { method: "PUT", body: JSON.stringify(draft) }, "Public settings saved.");
            if (result) {
              setDraft(result as AppSettings);
              onSettingsSaved(result as AppSettings);
            }
          })();
        }}>
          <h3>Public application settings</h3>
          <p className="legend">These defaults apply to anonymous visitors. Settlement choice and personal display preferences stay in each browser.</p>
          <div className="form-grid">
            <label>Default page<select value={draft.defaultPage} onChange={(event) => setDraft((current) => ({ ...current, defaultPage: event.target.value as AppSettings["defaultPage"] }))}><option value="dashboard">Dashboard</option><option value="members">Members</option><option value="market">Market</option><option value="map">Map</option></select></label>
            <label>Default region<input inputMode="numeric" value={draft.defaultRegion ?? ""} onChange={(event) => setDraft((current) => ({ ...current, defaultRegion: event.target.value }))} placeholder="Optional region ID" /></label>
            <label>Browser refresh (seconds)<input type="number" min="15" max="300" value={draft.refreshSeconds} onChange={(event) => setDraft((current) => ({ ...current, refreshSeconds: Number(event.target.value) }))} /></label>
            <label>Collector interval (seconds)<input type="number" min="15" max="300" value={draft.serverRefreshSeconds} onChange={(event) => setDraft((current) => ({ ...current, serverRefreshSeconds: Number(event.target.value) }))} /></label>
            <label>History retention (days)<input type="number" min="7" max="730" value={draft.historyRetentionDays} onChange={(event) => setDraft((current) => ({ ...current, historyRetentionDays: Number(event.target.value) }))} /></label>
            <label>Confirmed trade retention (days)<input type="number" min="30" max="1460" value={draft.tradeRetentionDays} onChange={(event) => setDraft((current) => ({ ...current, tradeRetentionDays: Number(event.target.value) }))} /></label>
          </div>
          <label className="field"><span>Public announcement</span><textarea value={draft.announcement} maxLength={1000} onChange={(event) => setDraft((current) => ({ ...current, announcement: event.target.value }))} placeholder="Optional message shown above public pages" /></label>
          <label className="toggle-line"><span>Maintenance mode</span><input type="checkbox" checked={draft.maintenanceMode} onChange={(event) => setDraft((current) => ({ ...current, maintenanceMode: event.target.checked }))} /></label>
          <div className="form-card">
            <h4>Public page availability</h4>
            <div className="form-grid">
              {PUBLIC_PAGE_FLAGS.map(([page, label]) => <label className="toggle-line compact-toggle" key={page}><span>{label}</span><input type="checkbox" checked={draft.pageFlags[page] !== false} onChange={(event) => setDraft((current) => ({ ...current, pageFlags: { ...current.pageFlags, [page]: event.target.checked } }))} /></label>)}
            </div>
          </div>
          <div className="form-card">
            <h4>Branding and default theme</h4>
            <div className="form-grid">
              <label>Logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={!canChange || busy} onChange={(event) => void uploadBranding("logo", event.target.files?.[0] ?? null)} /></label>
              <label>Favicon<input type="file" accept="image/png,image/svg+xml,image/x-icon" disabled={!canChange || busy} onChange={(event) => void uploadBranding("favicon", event.target.files?.[0] ?? null)} /></label>
              {(["bg", "sidebar", "panel", "text", "gold"] as const).map((key) => <label key={key}>{key}<input type="color" value={draft.theme[key]} onChange={(event) => setDraft((current) => ({ ...current, theme: { ...current.theme, [key]: event.target.value } }))} /></label>)}
            </div>
          </div>
          {canChange ? <button disabled={busy} className="toolbar-button primary" type="submit"><Save size={14} /> Save settings</button> : null}
        </form>
        <AdminPopupsSection api={api} />
        </>
      ) : null}

      {!loading && tab === "administrators" ? (
        <div className="admin-section-stack">
          <h3>Administrators</h3>
          {role === "owner" ? <form className="form-grid" onSubmit={(event) => {
            event.preventDefault();
            void mutate("/admin/users", { method: "POST", body: JSON.stringify(newAdmin) }, "Administrator added.");
          }}>
            <label>Discord user ID<input required inputMode="numeric" value={newAdmin.discordId} onChange={(event) => setNewAdmin((current) => ({ ...current, discordId: event.target.value }))} /></label>
            <label>Display name<input required value={newAdmin.displayName} onChange={(event) => setNewAdmin((current) => ({ ...current, displayName: event.target.value }))} /></label>
            <label>Role<select value={newAdmin.role} onChange={(event) => setNewAdmin((current) => ({ ...current, role: event.target.value }))}><option value="admin">Admin</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select></label>
            <button disabled={busy} className="toolbar-button primary" type="submit">Add administrator</button>
          </form> : null}
          <div className="table-wrap"><table><thead><tr><th>Name</th><th>Discord ID</th><th>Role</th><th>Active</th><th>Sessions</th><th>Last login</th></tr></thead><tbody>
            {users.map((entry) => <tr key={entry.id}><td>{entry.username}</td><td>{entry.discord_id ?? "—"}</td><td>{entry.roleLabel ?? entry.role}</td><td>{entry.active ? "Yes" : "No"}</td><td>{entry.sessions}</td><td>{dateLabel(entry.last_login_at)}</td></tr>)}
          </tbody></table></div>
        </div>
      ) : null}

      {!loading && tab === "analytics" ? <div className="admin-section-stack"><h3>30-day public usage</h3><DataPairs value={data?.totals ?? data} /></div> : null}

      {!loading && tab === "data" ? (
        <div className="admin-section-stack">
          <div className="split-header"><div><h3>Database backups</h3><p className="legend">Manual backups are stored separately from release artifacts.</p></div>{canChange ? <button className="toolbar-button primary" onClick={() => void mutate("/admin/backups", { method: "POST", body: "{}" }, "Backup created.")}>Create backup</button> : null}</div>
          <div className="table-wrap"><table><thead><tr><th>Backup</th><th>Size</th><th>Created</th><th /></tr></thead><tbody>{backups.map((backup) => <tr key={backup.name}><td>{backup.name}</td><td>{formatNumber(Number(backup.size ?? 0), 0)} bytes</td><td>{dateLabel(backup.createdAt ?? backup.mtime)}</td><td><a href={`${API}/admin/backup?name=${encodeURIComponent(backup.name)}`}>Download</a></td></tr>)}</tbody></table></div>
          <p><a href={`${API}/admin/export?name=claim_directory&format=csv`}>Export claim directory CSV</a></p>
        </div>
      ) : null}

      {!loading && tab === "audit" ? (
        <div className="admin-section-stack"><h3>Administrator audit history</h3><div className="table-wrap"><table><thead><tr><th>Time</th><th>Administrator</th><th>Action</th><th>Details</th></tr></thead><tbody>{auditRows.map((entry) => <tr key={entry.id}><td>{dateLabel(entry.occurred_at)}</td><td>{entry.username ?? entry.user_id}</td><td>{entry.action}</td><td><small>{entry.details_json ?? "—"}</small></td></tr>)}</tbody></table></div></div>
      ) : null}
    </section>
  );
}
