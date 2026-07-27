import React from "react";
import { Bell, Search, X } from "lucide-react";

import { RarityBadge, TierBadge } from "../../components/main/Badges";
import { ItemIcon, ItemLabel } from "../../components/main/ItemDisplay";
import { useActiveRegions, activeRegionLabel } from "../../hooks/useActiveRegions";
import {
  evaluateDealWatch,
  marketWatchStorageKey,
  normalizeLocalDealWatches,
  type LocalDealWatch,
  upsertLocalDealWatch,
} from "../../market/localDealWatches";
import { toNumber, type AnyRecord } from "../../main-app-data";
import { formatNumber, timeAgo } from "../../utils/format";
import { isMarketableItem } from "../../utils/items";
import type { MarketRefreshProps } from "./globalMarket";

const API = "/api/bitjita";

function readWatches(claimId: string) {
  try {
    return normalizeLocalDealWatches(JSON.parse(localStorage.getItem(marketWatchStorageKey(claimId)) ?? "[]"));
  } catch {
    return [];
  }
}

export function DealWatchlist({ monitoredRegionId }: MarketRefreshProps & {
  monitoredRegionId: string;
}) {
  const claimId = new URLSearchParams(window.location.search).get("claimId") ?? "";
  const activeRegions = useActiveRegions(monitoredRegionId);
  const [regionId, setRegionId] = React.useState(monitoredRegionId);
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<AnyRecord[]>([]);
  const [selectedItem, setSelectedItem] = React.useState<AnyRecord | null>(null);
  const [threshold, setThreshold] = React.useState(30);
  const [watches, setWatches] = React.useState<LocalDealWatch[]>(() => readWatches(claimId));
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    setWatches(readWatches(claimId));
  }, [claimId]);

  const save = React.useCallback((next: LocalDealWatch[]) => {
    const normalized = normalizeLocalDealWatches(next);
    setWatches(normalized);
    localStorage.setItem(marketWatchStorageKey(claimId), JSON.stringify(normalized));
  }, [claimId]);

  React.useEffect(() => {
    if (query.trim().length < 2 || selectedItem?.name === query.trim()) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`${API}/market?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
        .then((payload) => setSuggestions((payload.data?.items ?? []).filter(isMarketableItem).slice(0, 8)))
        .catch(() => {
          if (!controller.signal.aborted) setSuggestions([]);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, selectedItem?.name]);

  React.useEffect(() => {
    if (!claimId || document.visibilityState !== "visible") return;
    let cancelled = false;
    async function check() {
      const checkedAt = new Date().toISOString();
      const next = await Promise.all(watches.map(async (watch) => {
        if (!watch.enabled) return watch;
        try {
          const kind = watch.itemType === 1 ? "cargo" : "items";
          const response = await fetch(`${API}/market/${kind}/${encodeURIComponent(watch.itemId)}/price-history?bucket=1%20day&limit=30&regionId=${encodeURIComponent(watch.regionId)}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = await response.json();
          const stats = payload.stats ?? payload.data?.stats ?? {};
          const averagePrice = toNumber(stats.avg7d ?? stats.average7d ?? stats.avg30d);
          const lowestListingPrice = toNumber(payload.lowestListingPrice ?? payload.data?.lowestListingPrice ?? stats.lowestListingPrice);
          const result = evaluateDealWatch(watch, { averagePrice, lowestListingPrice });
          const alreadyAlerted = watch.lastAveragePrice === averagePrice && watch.lastListingPrice === lowestListingPrice;
          if (result.triggered && !alreadyAlerted && "Notification" in window && Notification.permission === "granted") {
            new Notification(`${watch.itemName} deal in R${watch.regionId}`, {
              body: `${formatNumber(lowestListingPrice)}g is below the ${formatNumber(averagePrice)}g confirmed-trade average.`,
              tag: `market-watch:${claimId}:${watch.id}`,
            });
          }
          return {
            ...watch,
            lastCheckedAt: checkedAt,
            lastAveragePrice: averagePrice || null,
            lastListingPrice: lowestListingPrice || null,
            lastAlertAt: result.triggered && !alreadyAlerted ? checkedAt : watch.lastAlertAt,
            updatedAt: checkedAt,
          };
        } catch {
          return { ...watch, lastCheckedAt: checkedAt };
        }
      }));
      if (!cancelled) save(next);
    }
    void check();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 120_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [claimId, watches.map((watch) => `${watch.id}:${watch.enabled}:${watch.thresholdPercent}`).join("|")]);

  function addWatch() {
    if (!selectedItem || !regionId) return;
    save(upsertLocalDealWatch(watches, {
      regionId,
      itemId: String(selectedItem.id),
      itemType: toNumber(selectedItem.itemType),
      itemName: String(selectedItem.name),
      tier: selectedItem.tier ?? selectedItem.itemTier,
      rarity: selectedItem.rarityStr ?? selectedItem.rarity,
      iconAssetName: selectedItem.iconAssetName ?? selectedItem.assetName,
      thresholdPercent: threshold,
      enabled: true,
    }));
    setSelectedItem(null);
    setQuery("");
    setMessage("Watch saved in this browser.");
  }

  function patchWatch(id: string, patch: Partial<LocalDealWatch>) {
    save(watches.map((watch) => watch.id === id ? { ...watch, ...patch, updatedAt: new Date().toISOString() } : watch));
  }

  return (
    <section className="deal-watchlist-page">
      <section className="deal-watch-add-card">
        <div className="command-filter-header"><span className="command-filter-title"><Bell size={15} /> Browser-local Market watches</span><span>{watches.length} / 50</span></div>
        <p className="legend">Watches stay on this device, are separate for each settlement, and are checked while this tab is open.</p>
        <div className="price-finder-controls deal-watch-add-controls">
          <label className="research-filter-field price-item-search"><span>Item</span><div className="suggestion-anchor">
            <input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedItem(null); }} placeholder="Search market items" />
            {suggestions.length ? <div className="suggestion-menu">{suggestions.map((item) => <button key={`${item.itemType}-${item.id}`} type="button" onClick={() => { setSelectedItem(item); setQuery(String(item.name)); setSuggestions([]); }}><ItemIcon item={item} /><strong>{item.name}</strong>{item.tier ? <TierBadge tier={item.tier} /> : null}{item.rarityStr ? <RarityBadge rarity={item.rarityStr} /> : null}</button>)}</div> : null}
          </div></label>
          <label className="research-filter-field"><span>Region</span><select value={regionId} onChange={(event) => setRegionId(event.target.value)}>{activeRegions.map((region) => <option key={region.regionId} value={String(region.regionId)}>{activeRegionLabel(region, monitoredRegionId)}</option>)}</select></label>
          <label className="research-filter-field"><span>Alert below average</span><div className="unit-input"><input type="number" min={1} max={95} value={threshold} onChange={(event) => setThreshold(Math.max(1, Math.min(95, Number(event.target.value) || 30)))} /><em>%</em></div></label>
        </div>
        <button className="toolbar-button primary" type="button" disabled={!selectedItem || !regionId || watches.length >= 50} onClick={addWatch}><Bell size={15} /> Watch item</button>
        {message ? <span className="legend">{message}</span> : null}
      </section>

      <section className="deal-watchlist-section">
        <h3><Search size={17} /> Saved watches <small>{watches.length} on this device</small></h3>
        {watches.length ? <div className="deal-watch-list">{watches.map((watch) => (
          <article className="deal-watch-row" key={watch.id}>
            <ItemLabel item={{ ...watch, name: watch.itemName }} name={watch.itemName} />
            <div className="deal-watch-meta">
              <div className="deal-watch-fact"><span>Region</span><strong>R{watch.regionId}</strong></div>
              <label className="deal-watch-fact deal-watch-threshold"><span>Below average</span><span><input type="number" min={1} max={95} value={watch.thresholdPercent} onChange={(event) => patchWatch(watch.id, { thresholdPercent: Math.max(1, Math.min(95, Number(event.target.value) || 30)) })} /><em>%</em></span></label>
              <div className="deal-watch-fact"><span>Last checked</span><strong>{watch.lastCheckedAt ? timeAgo(watch.lastCheckedAt) : "Pending"}</strong></div>
              <div className="deal-watch-fact"><span>Last alert</span><strong>{watch.lastAlertAt ? timeAgo(watch.lastAlertAt) : "None"}</strong></div>
            </div>
            <div className="deal-watch-actions"><button className="toolbar-button" onClick={() => patchWatch(watch.id, { enabled: !watch.enabled })}>{watch.enabled ? "Disable" : "Enable"}</button><button className="toolbar-button danger" onClick={() => save(watches.filter((entry) => entry.id !== watch.id))}><X size={14} /> Remove</button></div>
          </article>
        ))}</div> : <div className="deal-watch-empty">No local watches yet.</div>}
      </section>
    </section>
  );
}
