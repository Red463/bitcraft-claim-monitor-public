export const SELECTED_SETTLEMENT_STORAGE_KEY = "claim-monitor.selectedSettlement";

const SETTLEMENT_SCOPED_PREFERENCE_KEYS = [
  "activity.compact",
  "activity.filter",
  "activity.member",
  "activity.search",
  "empires.region",
  "inventory.container",
  "inventory.core-material",
  "inventory.non-empty",
  "inventory.rarity",
  "inventory.tier",
  "inventory.type",
  "leaderboard.tab",
  "map.focus",
  "map.players",
  "map.regions",
  "map.resource-category",
  "map.resource-search",
  "map.resource-tier",
  "map.resources",
  "market.member",
  "market.rarity",
  "market.tier",
  "planning.fishingRoute",
  "planning.targetsCollapsed",
  "production.direction",
  "production.member",
  "production.showPrivateCrafts",
  "production.sort",
  "public-crafts.region",
  "public-crafts.skill",
  "research.tier",
  "settlementMarket.view",
  "skills.adventure-direction",
  "skills.adventure-sort",
  "skills.direction",
  "skills.focus",
  "skills.sort",
] as const;

export function validSettlementId(value: unknown): string {
  const claimId = String(value ?? "").trim();
  return /^\d+$/.test(claimId) ? claimId : "";
}

export function initialSettlementId({
  search,
  readStorage,
}: {
  search: string;
  readStorage: (key: string) => string | null;
}): string {
  const shared = validSettlementId(new URLSearchParams(search).get("claimId"));
  if (shared) return shared;
  return validSettlementId(readStorage(SELECTED_SETTLEMENT_STORAGE_KEY));
}

export function settlementShareHref(currentHref: string, claimId: string): string {
  const url = new URL(currentHref);
  const validId = validSettlementId(claimId);
  if (validId) url.searchParams.set("claimId", validId);
  else url.searchParams.delete("claimId");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function settlementStateKey(claimId: string, key: string): string {
  const validId = validSettlementId(claimId);
  if (!validId) throw new TypeError("A numeric claim ID is required for settlement-scoped state");
  return `settlement.${validId}.${String(key).replace(/^\.+|\.+$/g, "")}`;
}

export function resetSettlementScopedPreferences(removeStorage: (key: string) => void): void {
  for (const key of SETTLEMENT_SCOPED_PREFERENCE_KEYS) {
    removeStorage(`claim-monitor.${key}`);
  }
}
