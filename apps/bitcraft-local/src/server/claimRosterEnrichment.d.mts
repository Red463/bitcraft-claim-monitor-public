export type ClaimRosterMember = {
  playerEntityId?: string | number | null;
  entityId?: string | number | null;
  [key: string]: unknown;
};

export type ClaimRosterEntryState = "fresh" | "stale" | "fallback";

export type ClaimRosterCoverage = {
  rosterTotal: number;
  refreshedThisRequest: number;
  covered: number;
  pending: number;
  failedThisRequest: number;
  complete: boolean;
  nextCursor: string | null;
};

export type ClaimRosterEntry<TMember, TValue> = {
  member: TMember;
  playerId: string;
  value: TValue;
  state: ClaimRosterEntryState;
  updatedAt: number | null;
  error?: string;
};

export type ClaimRosterBatchResult<TMember, TValue> = {
  entries: Array<ClaimRosterEntry<TMember, TValue>>;
  refreshedEntries: Array<{
    ok: true;
    member: TMember;
    playerId: string;
    value: TValue;
    updatedAt: number;
  }>;
  failures: Array<{ playerId: string; error: string }>;
  coverage: ClaimRosterCoverage;
};

export function uniqueClaimMembers<TMember extends ClaimRosterMember>(members: TMember[]): TMember[];

export function createClaimRosterEnrichment(options?: {
  now?: () => number;
  failureLimit?: number;
}): {
  runBatch<TMember extends ClaimRosterMember, TValue>(options: {
    claimId: string;
    family: string;
    members: TMember[];
    batchSize: number;
    concurrency: number;
    maxAgeMs: number;
    forceRefresh?: boolean;
    loadMember: (member: TMember, options: { forceRefresh: boolean }) => Promise<TValue>;
    fallback: (member: TMember) => TValue;
  }): Promise<ClaimRosterBatchResult<TMember, TValue>>;
};

export function enrichClaimPlayerDetails<
  TMember extends ClaimRosterMember,
  TPlayer extends Record<string, unknown>,
>(options: {
  claimId: string;
  members: TMember[];
  forceRefresh?: boolean;
  enrichment: ReturnType<typeof createClaimRosterEnrichment>;
  fetchPlayerDetail: (
    playerId: string,
    options: { forceRefresh: boolean },
  ) => Promise<TPlayer>;
  fallbackPlayer: (member: TMember) => TPlayer;
  maxAgeMs?: number;
}): Promise<{
  players: Array<TPlayer & { detailAvailable: boolean }>;
  requested: number;
  failed: number;
  failures: Array<{ playerId: string; error: string }>;
  coverage: ClaimRosterCoverage;
}>;
