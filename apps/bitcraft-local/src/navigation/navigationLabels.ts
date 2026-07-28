export function settlementNavigationLabel(claimName: unknown): string {
  return String(claimName ?? "").trim() || "Claim";
}

export function settlementMarketTitle(claimName: unknown): string {
  return `${settlementNavigationLabel(claimName)} Market`;
}
