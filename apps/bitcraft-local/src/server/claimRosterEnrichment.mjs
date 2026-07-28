function playerIdFor(member) {
  const playerId = member?.playerEntityId ?? member?.entityId;
  return playerId == null ? "" : String(playerId).trim();
}

export function uniqueClaimMembers(members) {
  const unique = new Map();
  for (const member of Array.isArray(members) ? members : []) {
    const playerId = playerIdFor(member);
    if (playerId && !unique.has(playerId)) unique.set(playerId, member);
  }
  return [...unique.values()];
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const workerCount = Math.min(items.length, Math.max(1, Number(concurrency) || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function createClaimRosterEnrichment({ now = Date.now, failureLimit = 20 } = {}) {
  const states = new Map();

  function stateFor(claimId, family) {
    const key = `${claimId}:${family}`;
    let state = states.get(key);
    if (!state) {
      state = { nextCursor: null, cache: new Map() };
      states.set(key, state);
    }
    return state;
  }

  async function runBatch({
    claimId,
    family,
    members,
    batchSize,
    concurrency,
    maxAgeMs,
    forceRefresh = false,
    loadMember,
    fallback,
  }) {
    const normalizedClaimId = String(claimId ?? "").trim();
    const normalizedFamily = String(family ?? "").trim();
    if (!normalizedClaimId) throw new Error("A claim ID is required");
    if (!normalizedFamily) throw new Error("An enrichment family is required");
    if (typeof loadMember !== "function") throw new Error("A member loader is required");
    if (typeof fallback !== "function") throw new Error("A member fallback is required");

    const roster = uniqueClaimMembers(members);
    const state = stateFor(normalizedClaimId, normalizedFamily);
    const currentIds = new Set(roster.map(playerIdFor));
    for (const cachedId of state.cache.keys()) {
      if (!currentIds.has(cachedId)) state.cache.delete(cachedId);
    }

    const requestedBatchSize = Math.max(0, Math.floor(Number(batchSize) || 0));
    const startIndex = state.nextCursor
      ? Math.max(0, roster.findIndex((member) => playerIdFor(member) === state.nextCursor))
      : 0;
    const selected = roster.slice(startIndex, startIndex + requestedBatchSize);
    const nextIndex = selected.length && startIndex + selected.length < roster.length
      ? startIndex + selected.length
      : 0;
    state.nextCursor = roster[nextIndex] ? playerIdFor(roster[nextIndex]) : null;

    const attempts = await mapWithConcurrency(selected, concurrency, async (member) => {
      const playerId = playerIdFor(member);
      try {
        const value = await loadMember(member, { forceRefresh: forceRefresh === true });
        const cached = { value, updatedAt: Number(now()) };
        state.cache.set(playerId, cached);
        return { ok: true, member, playerId, ...cached };
      } catch (error) {
        return { ok: false, member, playerId, error: errorMessage(error) };
      }
    });

    const failures = attempts
      .filter((attempt) => !attempt.ok)
      .map((attempt) => ({ playerId: attempt.playerId, error: attempt.error }))
      .slice(0, Math.max(0, Number(failureLimit) || 0));
    const failureById = new Map(attempts
      .filter((attempt) => !attempt.ok)
      .map((attempt) => [attempt.playerId, attempt.error]));
    const timestamp = Number(now());
    const maximumAge = Math.max(0, Number(maxAgeMs) || 0);
    const entries = roster.map((member) => {
      const playerId = playerIdFor(member);
      const cached = state.cache.get(playerId);
      if (!cached) {
        return {
          member,
          playerId,
          value: fallback(member),
          state: "fallback",
          updatedAt: null,
          ...(failureById.has(playerId) ? { error: failureById.get(playerId) } : {}),
        };
      }
      return {
        member,
        playerId,
        value: cached.value,
        state: timestamp - cached.updatedAt <= maximumAge ? "fresh" : "stale",
        updatedAt: cached.updatedAt,
        ...(failureById.has(playerId) ? { error: failureById.get(playerId) } : {}),
      };
    });
    const covered = entries.filter((entry) => entry.state !== "fallback").length;
    const coverage = {
      rosterTotal: roster.length,
      refreshedThisRequest: selected.length,
      covered,
      pending: roster.length - covered,
      failedThisRequest: attempts.filter((attempt) => !attempt.ok).length,
      complete: covered === roster.length,
      nextCursor: state.nextCursor,
    };

    return {
      entries,
      refreshedEntries: attempts.filter((attempt) => attempt.ok),
      failures,
      coverage,
    };
  }

  return { runBatch };
}

export async function enrichClaimPlayerDetails({
  claimId,
  members,
  forceRefresh = false,
  enrichment,
  fetchPlayerDetail,
  fallbackPlayer,
  maxAgeMs = 5 * 60_000,
}) {
  const result = await enrichment.runBatch({
    claimId,
    family: "player-details",
    members,
    batchSize: 60,
    concurrency: 6,
    maxAgeMs,
    forceRefresh,
    loadMember: async (member, options) => {
      const playerId = playerIdFor(member);
      const player = await fetchPlayerDetail(playerId, options);
      return { ...player, detailAvailable: true };
    },
    fallback: fallbackPlayer,
  });
  return {
    players: result.entries.map((entry) => entry.value),
    requested: result.coverage.rosterTotal,
    failed: result.coverage.failedThisRequest,
    failures: result.failures,
    coverage: result.coverage,
  };
}

function payloadRows(payload, key) {
  const rows = payload?.[key];
  return Array.isArray(rows) ? rows : [];
}

function catalogId(entry) {
  const id = entry?.id ?? entry?.entityId ?? entry?.itemId;
  return id == null ? "" : String(id);
}

function mergeCatalogPayloads(payloads) {
  const groups = {
    items: new Map(),
    cargos: new Map(),
    claims: new Map(),
  };
  for (const payload of payloads) {
    for (const key of Object.keys(groups)) {
      for (const entry of payloadRows(payload, key)) {
        const id = catalogId(entry);
        if (id) groups[key].set(id, entry);
      }
    }
  }
  return Object.fromEntries(Object.entries(groups).map(([key, entries]) => [key, [...entries.values()]]));
}

function craftClaimId(craft) {
  return String(craft?.claimEntityId ?? craft?.claim_entity_id ?? craft?.claim?.entityId ?? craft?.claimId ?? "");
}

export async function enrichClaimProductionCrafts({
  claimId,
  members,
  publicPayload = {},
  forceRefresh = false,
  enrichment,
  fetchMemberCrafts,
  maxAgeMs = 5 * 60_000,
}) {
  const result = await enrichment.runBatch({
    claimId,
    family: "production-crafts",
    members,
    batchSize: 50,
    concurrency: 8,
    maxAgeMs,
    forceRefresh,
    loadMember: (member, options) => fetchMemberCrafts(playerIdFor(member), options),
    fallback: () => null,
  });
  const publicCrafts = payloadRows(publicPayload, "craftResults");
  const publicIds = new Set(publicCrafts.map((craft) => String(craft?.entityId ?? "")).filter(Boolean));
  const memberPayloads = result.entries
    .filter((entry) => entry.state !== "fallback" && entry.value)
    .map((entry) => entry.value);
  const merged = new Map();

  for (const craft of publicCrafts) {
    if (!craft?.entityId || craftClaimId(craft) !== String(claimId)) continue;
    merged.set(String(craft.entityId), { ...craft, isPublic: craft.isPublic !== false, visibilitySource: "claim-public" });
  }
  for (const payload of memberPayloads) {
    for (const craft of payloadRows(payload, "craftResults")) {
      if (!craft?.entityId || craftClaimId(craft) !== String(claimId)) continue;
      const id = String(craft.entityId);
      const existing = merged.get(id) ?? {};
      const isPublic = craft.isPublic === false ? false : publicIds.has(id) || craft.isPublic === true;
      merged.set(id, {
        ...existing,
        ...craft,
        isPublic,
        visibilitySource: isPublic ? existing.visibilitySource ?? "player-public" : "player-private",
      });
    }
  }

  const craftResults = [...merged.values()].sort((left, right) => (
    Number(right?.totalActionsRequired ?? 0) - Number(left?.totalActionsRequired ?? 0)
  ));
  const catalog = mergeCatalogPayloads([publicPayload, ...memberPayloads]);
  return {
    craftResults,
    ...catalog,
    count: craftResults.length,
    publicCount: craftResults.filter((craft) => craft.isPublic !== false).length,
    privateCount: craftResults.filter((craft) => craft.isPublic === false).length,
    failedMemberRequests: result.coverage.failedThisRequest,
    partialError: result.failures[0]?.error ?? null,
    partialErrors: result.failures.map((failure) => `Member craft refresh failed: ${failure.error}`),
    failures: result.failures,
    coverage: result.coverage,
  };
}

export async function enrichClaimPassiveCrafts({
  claimId,
  members,
  forceRefresh = false,
  enrichment,
  fetchPassiveCrafts,
  maxAgeMs = 5 * 60_000,
}) {
  const result = await enrichment.runBatch({
    claimId,
    family: "passive-crafts",
    members,
    batchSize: 50,
    concurrency: 4,
    maxAgeMs,
    forceRefresh,
    loadMember: async (member, options) => {
      const value = await fetchPassiveCrafts(playerIdFor(member), member, options);
      if (value?.ok === false) throw new Error(value.error ?? "Passive craft refresh failed");
      return value;
    },
    fallback: () => null,
  });
  const rows = result.entries
    .filter((entry) => entry.state !== "fallback" && entry.value)
    .flatMap((entry) => payloadRows(entry.value, "rows").map((row) => ({
      ...row,
      playerId: entry.value.playerId ?? entry.playerId,
      memberName: entry.value.memberName ?? entry.member?.userName ?? entry.member?.username ?? "Unknown member",
    })))
    .sort((left, right) => Number(right?.sortTimestamp ?? 0) - Number(left?.sortTimestamp ?? 0))
    .slice(0, 18);
  return {
    rows,
    requested: result.coverage.rosterTotal,
    failed: result.coverage.failedThisRequest,
    failures: result.failures,
    coverage: result.coverage,
  };
}
