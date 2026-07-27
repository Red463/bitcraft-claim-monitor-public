import type { AnyRecord } from "../main-app-data";

export type LocalDealWatch = {
  id: string;
  regionId: string;
  itemId: string;
  itemType: number;
  itemName: string;
  tier?: number | null;
  rarity?: string;
  iconAssetName?: string;
  thresholdPercent: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastAlertAt?: string;
  lastAveragePrice?: number | null;
  lastListingPrice?: number | null;
};

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function watchId(value: Partial<LocalDealWatch>) {
  return `${String(value.regionId ?? "")}:${number(value.itemType)}:${String(value.itemId ?? "")}`;
}

export function marketWatchStorageKey(claimId: string) {
  return `claim-monitor.settlement.${String(claimId).trim()}.marketWatches`;
}

export function normalizeLocalDealWatches(value: unknown): LocalDealWatch[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((entry: AnyRecord) => {
    const now = new Date().toISOString();
    const watch = {
      ...entry,
      regionId: String(entry.regionId ?? "").trim(),
      itemId: String(entry.itemId ?? "").trim(),
      itemType: number(entry.itemType) === 1 ? 1 : 0,
      itemName: String(entry.itemName ?? "Unknown item").trim().slice(0, 120),
      thresholdPercent: Math.max(1, Math.min(95, number(entry.thresholdPercent) || 30)),
      enabled: entry.enabled !== false,
      createdAt: String(entry.createdAt ?? now),
      updatedAt: String(entry.updatedAt ?? now),
    };
    return { ...watch, id: watchId(watch) } as LocalDealWatch;
  }).filter((entry) => entry.regionId && entry.itemId);
}

export function upsertLocalDealWatch(current: LocalDealWatch[], value: Partial<LocalDealWatch>) {
  const now = new Date().toISOString();
  const next = normalizeLocalDealWatches([{ ...value, createdAt: value.createdAt ?? now, updatedAt: now }])[0];
  if (!next) return current;
  return [next, ...current.filter((entry) => entry.id !== next.id)].slice(0, 50);
}

export function evaluateDealWatch(
  watch: Pick<LocalDealWatch, "thresholdPercent">,
  prices: { averagePrice: number; lowestListingPrice: number },
) {
  const averagePrice = number(prices.averagePrice);
  const lowestListingPrice = number(prices.lowestListingPrice);
  const thresholdPrice = averagePrice * (1 - Math.max(1, Math.min(95, number(watch.thresholdPercent))) / 100);
  return {
    triggered: averagePrice > 0 && lowestListingPrice > 0 && lowestListingPrice < thresholdPrice,
    averagePrice,
    lowestListingPrice,
    thresholdPrice,
  };
}
