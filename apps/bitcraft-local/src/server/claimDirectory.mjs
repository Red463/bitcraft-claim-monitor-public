function text(value) {
  return String(value ?? "").trim();
}

function integerOrNull(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function rowsFrom(payload, key) {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.[key]) ? payload[key] : [];
}

export function normalizeDirectoryClaim(claim, region = {}, refreshedAt = new Date().toISOString()) {
  const claimId = text(claim?.entityId ?? claim?.claimId ?? claim?.id);
  const name = text(claim?.name ?? claim?.claimName) || `Settlement ${claimId}`;
  const regionId = text(claim?.regionId ?? claim?.region?.id ?? region?.regionId ?? region?.id) || null;
  const regionName = text(claim?.regionName ?? claim?.region?.name ?? region?.regionName ?? region?.name) || null;
  const ownerName = text(
    claim?.ownerName
    ?? claim?.owner?.username
    ?? claim?.owner?.name
    ?? claim?.ownerPlayerName
    ?? claim?.leaderName,
  ) || null;
  if (!/^\d+$/.test(claimId)) return null;
  return {
    claimId,
    name,
    regionId,
    regionName,
    tier: integerOrNull(claim?.tier ?? claim?.claimTier ?? claim?.level),
    ownerName,
    refreshedAt,
  };
}

function publicRow(row) {
  if (!row) return null;
  return {
    claimId: String(row.claim_id),
    name: String(row.name),
    regionId: row.region_id == null ? null : String(row.region_id),
    regionName: row.region_name == null ? null : String(row.region_name),
    tier: row.tier == null ? null : Number(row.tier),
    ownerName: row.owner_name == null ? null : String(row.owner_name),
    refreshedAt: String(row.refreshed_at),
  };
}

export function createClaimDirectoryRepository({ db, now = () => new Date().toISOString() }) {
  const upsert = db.prepare(`
    INSERT INTO claim_directory (
      claim_id, name, name_search, region_id, region_name, tier, owner_name, refreshed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(claim_id) DO UPDATE SET
      name = excluded.name,
      name_search = excluded.name_search,
      region_id = excluded.region_id,
      region_name = excluded.region_name,
      tier = excluded.tier,
      owner_name = excluded.owner_name,
      refreshed_at = excluded.refreshed_at
  `);
  const markStatus = db.prepare(`
    INSERT INTO claim_directory_status (singleton_id, last_attempt_at, last_success_at, last_error)
    VALUES (1, ?, ?, ?)
    ON CONFLICT(singleton_id) DO UPDATE SET
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = COALESCE(excluded.last_success_at, claim_directory_status.last_success_at),
      last_error = excluded.last_error
  `);

  function replaceAll(claims) {
    const refreshedAt = now();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec("DELETE FROM claim_directory");
      for (const source of claims) {
        const row = normalizeDirectoryClaim(source, {}, source?.refreshedAt ?? refreshedAt);
        if (!row) continue;
        upsert.run(
          row.claimId,
          row.name,
          row.name.toLocaleLowerCase("en-GB"),
          row.regionId,
          row.regionName,
          row.tier,
          row.ownerName,
          row.refreshedAt,
        );
      }
      markStatus.run(refreshedAt, refreshedAt, null);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return status();
  }

  function upsertOne(source) {
    const refreshedAt = now();
    const row = normalizeDirectoryClaim(source, {}, source?.refreshedAt ?? refreshedAt);
    if (!row) throw new TypeError("A valid numeric claim ID is required");
    upsert.run(
      row.claimId,
      row.name,
      row.name.toLocaleLowerCase("en-GB"),
      row.regionId,
      row.regionName,
      row.tier,
      row.ownerName,
      row.refreshedAt,
    );
    return get(row.claimId);
  }

  function recordFailure(error) {
    const attemptedAt = now();
    markStatus.run(attemptedAt, null, error instanceof Error ? error.message : String(error));
  }

  function get(claimId) {
    const id = text(claimId);
    if (!/^\d+$/.test(id)) return null;
    return publicRow(db.prepare("SELECT * FROM claim_directory WHERE claim_id = ?").get(id));
  }

  function search({ query = "", regionId = "", limit = 25 } = {}) {
    const normalizedQuery = text(query).toLocaleLowerCase("en-GB");
    const normalizedRegion = text(regionId);
    const safeLimit = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 25));
    const like = `%${normalizedQuery.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    return db.prepare(`
      SELECT * FROM claim_directory
      WHERE (? = '' OR region_id = ?)
        AND (? = '' OR name_search LIKE ? ESCAPE '\\' OR claim_id LIKE ? ESCAPE '\\')
      ORDER BY
        CASE WHEN claim_id = ? THEN 0 WHEN name_search = ? THEN 1 ELSE 2 END,
        name_search ASC,
        claim_id ASC
      LIMIT ?
    `).all(
      normalizedRegion,
      normalizedRegion,
      normalizedQuery,
      like,
      like,
      normalizedQuery,
      normalizedQuery,
      safeLimit,
    ).map(publicRow);
  }

  function status() {
    const state = db.prepare("SELECT * FROM claim_directory_status WHERE singleton_id = 1").get();
    const count = Number(db.prepare("SELECT COUNT(*) AS count FROM claim_directory").get()?.count ?? 0);
    return {
      claimCount: count,
      lastAttemptAt: state?.last_attempt_at ?? null,
      lastSuccessAt: state?.last_success_at ?? null,
      lastError: state?.last_error ?? null,
    };
  }

  return { get, recordFailure, replaceAll, search, status, upsertOne };
}

export async function refreshClaimDirectory({
  repository,
  fetchJson,
  pageSize = 100,
}) {
  try {
    const regionPayload = await fetchJson("/regions");
    const regions = rowsFrom(regionPayload, "regions");
    if (!regions.length) throw new Error("BitJita returned no regions; cached claim directory retained");
    const claims = [];
    for (const region of regions) {
      const regionId = text(region?.regionId ?? region?.id ?? region?.entityId);
      if (!/^\d+$/.test(regionId)) continue;
      for (let offset = 0; ; offset += pageSize) {
        const payload = await fetchJson(`/claims?regionId=${encodeURIComponent(regionId)}&limit=${pageSize}&offset=${offset}`);
        const page = rowsFrom(payload, "claims");
        for (const claim of page) claims.push({ ...normalizeDirectoryClaim(claim, region), refreshedAt: undefined });
        if (page.length < pageSize) break;
      }
    }
    const validClaims = claims.filter((claim) => claim?.claimId);
    if (!validClaims.length) throw new Error("BitJita returned no claims; cached claim directory retained");
    repository.replaceAll(validClaims);
    return repository.status();
  } catch (error) {
    repository.recordFailure(error);
    throw error;
  }
}
