export type CoveragePresentation = null | {
  tone: "warning";
  summary: string;
  detail: string;
};

function finiteNonNegative(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function validTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toLocaleString();
}

export function coveragePresentation(
  coverage: Record<string, unknown> | null,
  now = Date.now(),
): CoveragePresentation {
  void now;
  if (!coverage || typeof coverage !== "object") return null;
  const lastSuccess = validTimestamp(coverage.lastSuccessAt);
  const lagSeconds = finiteNonNegative(coverage.lagSeconds);
  const dataGaps = finiteNonNegative(coverage.dataGaps);
  const hasCollectionStart = validTimestamp(coverage.collectionStart) !== null;
  const hasUsableSignal = hasCollectionStart || lastSuccess !== null || lagSeconds !== null || dataGaps !== null;
  if (!hasUsableSignal) return null;

  if (!lastSuccess) {
    return {
      tone: "warning",
      summary: "History collection is starting",
      detail: "No successful collection has completed yet.",
    };
  }

  const lagMinutes = Math.max(0, Math.round((lagSeconds ?? 0) / 60));
  const gapCount = Math.max(0, Math.floor(dataGaps ?? 0));
  if (lagMinutes <= 15 && gapCount === 0) return null;

  const reasons = [];
  if (lagMinutes > 15) reasons.push(`${lagMinutes}m lag`);
  if (gapCount > 0) reasons.push(`${gapCount} data gap${gapCount === 1 ? "" : "s"}`);
  return {
    tone: "warning",
    summary: "History collection needs attention",
    detail: `Last successful collection ${lastSuccess}. ${reasons.join(" · ")}.`,
  };
}
