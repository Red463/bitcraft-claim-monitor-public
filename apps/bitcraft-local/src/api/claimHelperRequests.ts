export function claimHelperRequestBody(claimId: string, _members?: unknown[]): string {
  const normalizedClaimId = claimId.trim();
  if (!normalizedClaimId) throw new Error("A claim ID is required");
  return JSON.stringify({ claimId: normalizedClaimId });
}
