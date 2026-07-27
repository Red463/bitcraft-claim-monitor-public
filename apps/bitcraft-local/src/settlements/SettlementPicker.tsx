import React from "react";
import { ArrowRight, Building2, MapPinned, Search, X } from "lucide-react";
import { validSettlementId } from "./settlementSelection";
import "./settlement-picker.css";

type DirectoryClaim = {
  claimId: string;
  name: string;
  regionId: string | null;
  regionName: string | null;
  tier: number | null;
  ownerName: string | null;
};

export function SettlementPicker({
  currentClaimId,
  mode,
  onCancel,
  onSelect,
}: {
  currentClaimId: string;
  mode: "welcome" | "switch";
  onCancel?: () => void;
  onSelect: (claim: DirectoryClaim) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [regionId, setRegionId] = React.useState("");
  const [claims, setClaims] = React.useState<DirectoryClaim[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [selectingId, setSelectingId] = React.useState("");

  React.useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ q: query, limit: "50" });
        if (regionId.trim()) params.set("regionId", regionId.trim());
        const response = await fetch(`/api/local/claims/search?${params}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to search settlements");
        setClaims(Array.isArray(payload.claims) ? payload.claims : []);
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, regionId]);

  async function choose(claimId: string) {
    const id = validSettlementId(claimId);
    if (!id) return;
    setSelectingId(id);
    setError("");
    try {
      const response = await fetch(`/api/local/claims/${encodeURIComponent(id)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to validate that settlement");
      onSelect(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSelectingId("");
    }
  }

  const numericSearch = validSettlementId(query);
  return (
    <div className={`settlement-picker-layer ${mode === "welcome" ? "is-welcome" : ""}`} role="dialog" aria-modal="true" aria-labelledby="settlement-picker-title">
      <section className="settlement-picker">
        {mode === "switch" && onCancel ? (
          <button className="settlement-picker-close" type="button" onClick={onCancel} aria-label="Close settlement switcher"><X size={18} /></button>
        ) : null}
        <header>
          <span className="settlement-picker-mark"><Building2 size={26} /></span>
          <div>
            <p className="eyebrow">{mode === "welcome" ? "Welcome to" : "Change settlement"}</p>
            <h1 id="settlement-picker-title">BitCraft Settlement Monitor</h1>
            <p>{mode === "welcome"
              ? "Monitor the dashboard, members, professions, production, construction, markets and activity for any public BitCraft settlement."
              : "Choose another settlement. Current requests will be cancelled and settlement-specific views will reset safely."}</p>
          </div>
        </header>
        <div className="settlement-picker-controls">
          <label>
            <span>Settlement name or claim ID</span>
            <span className="settlement-search-input"><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search every settlement…" /></span>
          </label>
          <label>
            <span>Region ID <small>(optional)</small></span>
            <span className="settlement-region-input"><MapPinned size={17} /><input inputMode="numeric" value={regionId} onChange={(event) => setRegionId(event.target.value.replace(/\D/g, ""))} placeholder="All regions" /></span>
          </label>
        </div>
        {error ? <p className="settlement-picker-error" role="alert">{error}</p> : null}
        <div className="settlement-results" aria-busy={loading}>
          {loading ? <p className="settlement-picker-status">Searching the settlement directory…</p> : null}
          {!loading && numericSearch && !claims.some((claim) => claim.claimId === numericSearch) ? (
            <button className="settlement-result direct-id" type="button" onClick={() => void choose(numericSearch)} disabled={Boolean(selectingId)}>
              <span><strong>Claim #{numericSearch}</strong><small>Validate this claim ID directly</small></span><ArrowRight size={17} />
            </button>
          ) : null}
          {!loading ? claims.map((claim) => (
            <button className={`settlement-result ${claim.claimId === currentClaimId ? "is-current" : ""}`} type="button" key={claim.claimId} onClick={() => void choose(claim.claimId)} disabled={Boolean(selectingId)}>
              <span className="settlement-result-main">
                <strong>{claim.name}</strong>
                <small>Claim #{claim.claimId}{claim.ownerName ? ` · Owner ${claim.ownerName}` : ""}</small>
              </span>
              <span className="settlement-result-meta">
                <small>{claim.regionName ? `${claim.regionName} · ` : ""}Region {claim.regionId ?? "unknown"}</small>
                <strong>{claim.tier == null ? "Tier unknown" : `Tier ${claim.tier}`}</strong>
              </span>
              <ArrowRight size={17} />
            </button>
          )) : null}
          {!loading && !claims.length && !numericSearch ? <p className="settlement-picker-status">No settlements match this search. Try a name, numeric claim ID, or remove the region filter.</p> : null}
        </div>
        <footer>
          <span>No account is required. Your selected settlement and preferences stay in this browser.</span>
          <a href="https://bitjita.com/docs/api" target="_blank" rel="noreferrer">Settlement data is provided by BitJita.</a>
        </footer>
      </section>
    </div>
  );
}
