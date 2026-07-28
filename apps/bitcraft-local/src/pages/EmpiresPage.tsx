import React from "react";
import "../styles/empires.css";
import { Castle, Crown, Landmark, Users } from "lucide-react";

import { AsyncState } from "../components/main/AsyncState";
import { AppSkeleton } from "../components/main/AppChrome";
import { DataTable, type DataTableColumn } from "../components/main/DataTable";
import { MiniStat } from "../components/main/Stats";
import { usePersistedState } from "../hooks/usePersistedState";
import type { AnyRecord } from "../main-app-data";
import { useManualRefresh } from "../refresh/ManualRefreshContext";
import { manualRefreshHeaders } from "../refresh/manualRefresh.mjs";
import { dateLabel, formatCompactNumber, formatNumber, timeAgo } from "../utils/format";
import { EmpireDetailsDialog } from "./empires/EmpireDetailsDialog";

const LOCAL_API = "/api/local";

type ActiveRegion = { regionId: string; regionName?: string; source?: string };

function useEmpireRegions(includeRegionId?: string): ActiveRegion[] {
  const { request, trackPromise } = useManualRefresh();
  const [regions, setRegions] = React.useState<ActiveRegion[]>([]);
  React.useEffect(() => {
    const controller = new AbortController();
    const include = includeRegionId && /^\d+$/.test(String(includeRegionId)) ? `?include=${encodeURIComponent(String(includeRegionId))}` : "";
    const refresh = fetch(`${LOCAL_API}/regions/active${include}`, {
      headers: manualRefreshHeaders(request, "empires"),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`active regions HTTP ${response.status}`)))
      .then((payload) => {
        const rows = Array.isArray(payload.regions) ? payload.regions : [];
        setRegions(rows.map((region: AnyRecord) => ({
          regionId: String(region.regionId ?? ""),
          regionName: String(region.regionName ?? region.name ?? `Region ${region.regionId ?? ""}`),
          source: String(region.source ?? ""),
        })).filter((region: ActiveRegion) => /^\d+$/.test(region.regionId)));
      });
    void trackPromise("empire-regions", refresh).catch(() => {
      if (!controller.signal.aborted && includeRegionId) {
        setRegions([{ regionId: String(includeRegionId), regionName: `Region ${includeRegionId}`, source: "fallback" }]);
      }
    });
    return () => controller.abort();
  }, [includeRegionId, request?.sequence, trackPromise]);
  return regions;
}

function regionLabel(region: ActiveRegion, monitoredRegionId?: string) {
  const suffix = String(region.regionId) === String(monitoredRegionId ?? "") ? " (claim)" : "";
  return `R${region.regionId}${region.regionName ? ` — ${region.regionName}` : ""}${suffix}`;
}

function compactDate(value: unknown): string {
  if (!value) return "—";
  return `${timeAgo(value)} (${dateLabel(value)})`;
}

function coordinates(row: AnyRecord): string {
  const x = row.locationX ?? row.x;
  const z = row.locationZ ?? row.z;
  return x == null || z == null ? "—" : `${formatNumber(Number(x), 0)}, ${formatNumber(Number(z), 0)}`;
}

export function Empires({ monitoredRegionId }: { monitoredRegionId: string; access?: unknown }) {
  const { request, trackPromise } = useManualRefresh();
  const initialRegion = monitoredRegionId && /^\d+$/.test(String(monitoredRegionId)) ? String(monitoredRegionId) : "19";
  const [regionId, setRegionId] = usePersistedState("empires.region", initialRegion);
  const regions = useEmpireRegions(monitoredRegionId);
  const [overview, setOverview] = React.useState<{ data: AnyRecord | null; loading: boolean; error: string | null }>({
    data: null,
    loading: true,
    error: null,
  });
  const [selectedEmpireId, setSelectedEmpireId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (regions.length && !regions.some((region) => region.regionId === regionId)) setRegionId(initialRegion);
  }, [initialRegion, regionId, regions, setRegionId]);

  React.useEffect(() => {
    const controller = new AbortController();
    setOverview((current) => ({ ...current, loading: true, error: null }));
    const refresh = fetch(`${LOCAL_API}/empires?regionId=${encodeURIComponent(regionId)}`, {
      headers: manualRefreshHeaders(request, "empires"),
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Empires HTTP ${response.status}`)))
      .then((payload) => setOverview({ data: payload, loading: false, error: null }));
    void trackPromise("empires-overview", refresh).catch((error) => {
      if (!controller.signal.aborted) {
        setOverview((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    });
    return () => controller.abort();
  }, [regionId, request?.sequence, trackPromise]);

  const rows: AnyRecord[] = overview.data?.empires ?? [];
  const summary = overview.data?.summary ?? {};
  const columns: DataTableColumn[] = [
    ["Empire", (row) => (
      <button type="button" className="empire-details-trigger" onClick={() => setSelectedEmpireId(String(row.entityId ?? row.empireId ?? ""))}>
        {row.name ?? "Unknown empire"}
      </button>
    )],
    ["Leader", (row) => row.leader ?? "—"],
    ["Members", (row) => formatNumber(row.memberCount)],
    ["Territory", (row) => formatNumber(row.territoryChunks)],
    ["Region claims", (row) => formatNumber(row.regionalClaims)],
    ["Treasury", (row) => formatCompactNumber(row.empireCurrencyTreasury)],
    ["Location", (row) => coordinates(row)],
    ["Updated", (row) => compactDate(row.updatedAt)],
  ];

  return (
    <div className="panel empires-page">
      <header className="page-title-row" data-tour="empires-page">
        <div>
          <h2>Empires</h2>
          <p>Regional empire overview with claim and leadership detail.</p>
        </div>
        <div className="page-title-actions">
          <label className="field compact-field">
            <span>Region</span>
            <select className="select-control" value={regionId} onChange={(event) => setRegionId(event.target.value)}>
              {regions.length
                ? regions.map((region) => <option key={region.regionId} value={region.regionId}>{regionLabel(region, monitoredRegionId)}</option>)
                : <option value={regionId}>R{regionId}</option>}
            </select>
          </label>
        </div>
      </header>

      {overview.loading && !overview.data ? <AppSkeleton /> : null}
      {overview.error && !overview.data ? <AsyncState kind="error" title="Unable to load regional empires" detail={overview.error} /> : null}
      {overview.data ? (
        <>
          <div className="stats-grid">
            <MiniStat icon={<Landmark />} label="Regional empires" value={formatNumber(summary.empires)} />
            <MiniStat icon={<Castle />} label="Empire claims" value={formatNumber(summary.regionalClaims)} />
            <MiniStat icon={<Users />} label="Total members" value={formatNumber(summary.totalMembers)} />
            <MiniStat icon={<Crown />} label="Largest empire" value={summary.largestEmpireName ?? "—"} />
          </div>
          {overview.loading ? <AsyncState kind="loading" title="Refreshing regional empires" detail="Current empire rows remain visible." compact /> : null}
          {overview.error ? <AsyncState kind="error" title="Unable to refresh regional empires" detail={overview.error} compact /> : null}
          <section className="dashboard-card table-panel">
            <div className="panel-head"><strong><Landmark size={15} /> Regional empires</strong><span>{overview.loading ? "Refreshing…" : `${formatNumber(rows.length)} shown`}</span></div>
            <DataTable rows={rows} columns={columns} scrollLabel="Regional empires table" emptyState={<AsyncState kind="empty" title="No regional empires returned" detail="Try another active region." compact />} />
          </section>
        </>
      ) : null}

      {selectedEmpireId ? (
        <EmpireDetailsDialog
          empireId={selectedEmpireId}
          regionId={regionId}
          inactiveDays="14"
          onClose={() => setSelectedEmpireId(null)}
        />
      ) : null}
    </div>
  );
}
