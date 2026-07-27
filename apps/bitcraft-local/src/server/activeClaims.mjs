const DEFAULT_ACTIVE_WINDOW_MS = 15 * 60 * 1000;

function validClaimId(value) {
  const claimId = String(value ?? "").trim();
  if (!/^\d+$/.test(claimId)) throw new TypeError("A numeric claim ID is required");
  return claimId;
}

export function createActiveClaimRepository({
  db,
  now = () => new Date().toISOString(),
  activeWindowMs = DEFAULT_ACTIVE_WINDOW_MS,
}) {
  const upsertInterest = db.prepare(`
    INSERT INTO monitored_claims (claim_id, first_interest_at, last_interest_at)
    VALUES (?, ?, ?)
    ON CONFLICT(claim_id) DO UPDATE SET last_interest_at = excluded.last_interest_at
  `);

  function registerInterest(value) {
    const claimId = validClaimId(value);
    const current = now();
    upsertInterest.run(claimId, current, current);
    return get(claimId);
  }

  function get(value) {
    const claimId = validClaimId(value);
    const row = db.prepare("SELECT * FROM monitored_claims WHERE claim_id = ?").get(claimId);
    if (!row) return null;
    return {
      claimId: row.claim_id,
      firstInterestAt: row.first_interest_at,
      lastInterestAt: row.last_interest_at,
      lastCollectedAt: row.last_collected_at,
      lastSuccessAt: row.last_success_at,
      lastError: row.last_error,
    };
  }

  function active({ limit = 25 } = {}) {
    const cutoff = new Date(Date.parse(now()) - activeWindowMs).toISOString();
    const safeLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 25));
    return db.prepare(`
      SELECT * FROM monitored_claims
      WHERE last_interest_at >= ?
      ORDER BY
        CASE WHEN last_collected_at IS NULL THEN 0 ELSE 1 END,
        last_collected_at ASC,
        last_interest_at DESC,
        claim_id ASC
      LIMIT ?
    `).all(cutoff, safeLimit).map((row) => ({
      claimId: row.claim_id,
      firstInterestAt: row.first_interest_at,
      lastInterestAt: row.last_interest_at,
      lastCollectedAt: row.last_collected_at,
      lastSuccessAt: row.last_success_at,
      lastError: row.last_error,
    }));
  }

  function recordSuccess(value, collectedAt = now()) {
    const claimId = validClaimId(value);
    db.prepare(`
      UPDATE monitored_claims
      SET last_collected_at = ?, last_success_at = ?, last_error = NULL
      WHERE claim_id = ?
    `).run(collectedAt, collectedAt, claimId);
    return get(claimId);
  }

  function recordFailure(value, error, collectedAt = now()) {
    const claimId = validClaimId(value);
    db.prepare(`
      UPDATE monitored_claims
      SET last_collected_at = ?, last_error = ?
      WHERE claim_id = ?
    `).run(collectedAt, error instanceof Error ? error.message : String(error), claimId);
    return get(claimId);
  }

  return { active, get, recordFailure, recordSuccess, registerInterest };
}

export async function collectActiveClaims({
  claims,
  collect,
  concurrency = 2,
  onSuccess = () => {},
  onFailure = () => {},
}) {
  const queue = [...claims];
  let succeeded = 0;
  let failed = 0;
  const workerCount = Math.max(1, Math.min(queue.length || 1, Number.parseInt(concurrency, 10) || 2));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      const claimId = validClaimId(row.claimId ?? row);
      try {
        await collect(claimId, row);
        succeeded += 1;
        await onSuccess(claimId);
      } catch (error) {
        failed += 1;
        await onFailure(claimId, error);
      }
    }
  }));
  return { attempted: claims.length, succeeded, failed };
}
