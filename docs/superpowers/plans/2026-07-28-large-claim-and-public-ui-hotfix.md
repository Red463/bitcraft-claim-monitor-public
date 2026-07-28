# Large-Claim and Public UI Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate HTTP 413 and first-N truncation for large claims, make progressive enrichment visible without blocking direct claim data, repair the history and create-plan presentation, and replace public “settlement” language with “claim” language.

**Architecture:** The browser sends only `claimId` to the three local claim-helper endpoints. The server resolves the authoritative roster through BitJita, then a focused in-memory enrichment module rotates bounded per-member batches and merges successful cached values with roster fallbacks. History coverage becomes a pure presentation decision rendered inline only when actionable; the plan dialog receives scoped feature CSS; user-facing copy is guarded by a source-level terminology test while compatibility identifiers remain unchanged.

**Tech Stack:** Node.js 24, native Node HTTP, React 19, TypeScript 5.9, Vite, plain CSS, Node test runner, pnpm.

## Global Constraints

- Work only in the isolated worktree `C:\Users\Tom\Documents\Bitcraft Claim Monitor Public Version\.worktrees\large-claim-hotfix` on branch `codex/large-claim-hotfix`.
- Follow strict red-green-refactor: add one focused failing test, run it and confirm the expected failure, implement the smallest production change, rerun to green, then commit.
- Do not rename internal routes, storage keys, CSS selectors, schema identifiers, migrations, or file/component names solely for terminology.
- Preserve the generic 64 KiB JSON limit; only the three claim-helper routes receive the 256 KiB compatibility limit.
- Client-supplied `members` arrays must never determine the server-side roster.
- Keep existing rate limits, manual-refresh guards, abort behavior, stale-if-error behavior, and BitJita request timeouts.
- Do not push, merge, bypass branch protection, dispatch production deployment, or mutate the VPS until the complete local verification phase is green.
- Release version for this fix-only line: `0.48.1-beta.1`.

---

## Task 1: Add the claim-ID-only browser request contract

**Files:**

- Create: `apps/bitcraft-local/src/api/claimHelperRequests.ts`
- Create: `apps/bitcraft-local/test/claim-helper-requests.test.mjs`
- Modify: `apps/bitcraft-local/src/api/bitjita.ts`
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Modify: `apps/bitcraft-local/src/pages/ProductionPage.tsx`
- Modify: `apps/bitcraft-local/test/production-page-boundary.test.mjs`

- [ ] **Step 1: Write the failing request-contract test**

Create a 221-member fixture with deliberately large names and assert the request builder serializes only the claim ID:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { claimHelperRequestBody } from "../src/api/claimHelperRequests.ts";

test("claim helpers send only claimId even for a 221-member claim", () => {
  const members = Array.from({ length: 221 }, (_, index) => ({
    playerEntityId: String(10_000 + index),
    userName: `Ba Sing Se member ${index} ${"x".repeat(300)}`,
  }));
  const body = claimHelperRequestBody("1369094286737286086", members);

  assert.deepEqual(JSON.parse(body), { claimId: "1369094286737286086" });
  assert.ok(Buffer.byteLength(body) < 1024);
});

test("claim helpers reject a blank claim ID", () => {
  assert.throws(() => claimHelperRequestBody(" ", []), /claim ID/i);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/claim-helper-requests.test.mjs
```

Expected: FAIL because `claimHelperRequests.ts` does not exist.

- [ ] **Step 3: Implement the minimal request builder**

Export:

```ts
export function claimHelperRequestBody(claimId: string, _members?: unknown[]): string
```

Trim `claimId`, throw for blank input, and return `JSON.stringify({ claimId: normalizedClaimId })`. Keep the unused optional member argument during the hotfix so the 221-member regression test explicitly proves roster contents cannot enter the request.

- [ ] **Step 4: Change all three browser calls to the new contract**

In `src/api/bitjita.ts`:

- Import `claimHelperRequestBody`.
- Change `/production/crafts` to `body: claimHelperRequestBody(claimId, members)`.
- Change `/player-details` to `body: claimHelperRequestBody(claimId, members)`.
- Read the returned `coverage` object and append the informational message `Updating details for X of Y claim members.` only while `complete === false`.
- Store player coverage at `raw.playerDetailDiagnostics.coverage` and craft coverage at `raw.crafts.coverage`.
- Do not add incomplete coverage to `partialErrors`, `raw.stale`, or the full-width BitJita refresh warning.
- Change the existing fallback warning from “settlement member names” to “claim member names”.

In `src/pages/ProductionPage.tsx`:

- Change `MemberPassiveCrafts` props to `{ claimId: string; refreshToken: number }`.
- Build `/passive-crafts` with `claimHelperRequestBody(claimId)`.
- Replace `memberKey` with the trimmed claim ID in the effect dependency.
- Pass `claimId={String(data.claim?.entityId ?? data.raw?.claim?.entityId ?? "")}` from `Production`.
- Surface incomplete `payload.coverage` as the same compact informational line, separately from actual failures.

In `AppShell.tsx`, add a small `ClaimEnrichmentProgress` renderer immediately after history coverage. It reads `data.raw?.playerDetailDiagnostics?.coverage` and `data.raw?.crafts?.coverage`, renders nothing for complete coverage, and otherwise renders `.claim-enrichment-progress` with `Updating details for X of Y claim members.` Normalise duplicate player/craft coverage into one line by choosing the lowest `covered` value for the current page.

In `styles/app-chrome.css`, style `.claim-enrichment-progress` as compact normal-flow supporting text. It must not use `.api-status-banner`, fixed positioning, warning colour, or modal/status z-index.

- [ ] **Step 5: Extend the boundary test**

In `production-page-boundary.test.mjs`, assert:

```js
assert.match(page, /claimHelperRequestBody\(claimId\)/);
assert.doesNotMatch(page, /JSON\.stringify\(\{\s*members:/);
assert.match(page, /Updating details for/);
```

Also assert `bitjita.ts` uses `claimHelperRequestBody(claimId, members)` for both helper requests and contains no `JSON.stringify({ claimId, members })` or `JSON.stringify({ members })`.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/claim-helper-requests.test.mjs apps/bitcraft-local/test/production-page-boundary.test.mjs apps/bitcraft-local/test/bitjita-page-endpoints.test.mjs
```

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/bitcraft-local/src/api/claimHelperRequests.ts apps/bitcraft-local/src/api/bitjita.ts apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/styles/app-chrome.css apps/bitcraft-local/src/pages/ProductionPage.tsx apps/bitcraft-local/test/claim-helper-requests.test.mjs apps/bitcraft-local/test/production-page-boundary.test.mjs
git commit -m "fix: send claim-only helper requests"
```

---

## Task 2: Build the rotating claim-roster enrichment module

**Files:**

- Create: `apps/bitcraft-local/src/server/claimRosterEnrichment.mjs`
- Create: `apps/bitcraft-local/src/server/claimRosterEnrichment.d.mts`
- Create: `apps/bitcraft-local/test/server-claim-roster-enrichment.test.mjs`

- [ ] **Step 1: Write failing unit tests for stable roster identity and fair rotation**

Test these exported interfaces:

```js
import {
  createClaimRosterEnrichment,
  uniqueClaimMembers,
} from "../src/server/claimRosterEnrichment.mjs";
```

Required cases:

1. `uniqueClaimMembers` deduplicates by `playerEntityId ?? entityId`, preserves first-seen roster order, and skips invalid rows.
2. Four successive `runBatch` calls for a 221-member roster with `batchSize: 60` refresh all 221 IDs once before the cursor wraps.
3. Two families (`player-details`, `production-crafts`) and two claim IDs keep independent cursors and caches.
4. `runBatch` returns one entry per roster member: cached successful values where present and `fallback(member)` for pending or failed members.
5. A selected member failure retains an earlier successful cached value and appears in the bounded current failure list.
6. Successful entries older than `maxAgeMs` are classified stale but remain available until replaced.
7. Coverage has exactly:

```js
{
  rosterTotal,
  refreshedThisRequest,
  covered,
  pending,
  failedThisRequest,
  complete,
  nextCursor,
}
```

8. `forceRefresh` affects only the selected rotating batch; it must not select the whole roster.

- [ ] **Step 2: Run the module test and confirm RED**

Run:

```powershell
node --test apps/bitcraft-local/test/server-claim-roster-enrichment.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the focused module**

Export:

```js
export function uniqueClaimMembers(members)
export function createClaimRosterEnrichment({ now = Date.now, failureLimit = 20 } = {})
```

The returned object exposes:

```js
await enrichment.runBatch({
  claimId,
  family,
  members,
  batchSize,
  concurrency,
  maxAgeMs,
  forceRefresh,
  loadMember,
  fallback,
})
```

`runBatch` returns:

```js
{
  entries: [{ member, playerId, value, state, updatedAt, error? }],
  refreshedEntries,
  failures,
  coverage,
}
```

Implementation rules:

- State key is `${claimId}:${family}`.
- Keep a per-key cursor index and `Map<playerId, { value, updatedAt }>` cache.
- Reconcile the cursor against current stable roster order on each call.
- Select at most `batchSize` consecutive members, wrapping once.
- Use an internal bounded worker loop for `concurrency`; never start more than the supplied concurrency.
- Call `loadMember(member, { forceRefresh })` only for the selected batch.
- Cache only successful returned values.
- For every roster member, choose a fresh cache entry, then stale cache entry, then `fallback(member)`.
- `covered` counts members with any successful cached enrichment, including stale values.
- `pending = rosterTotal - covered`.
- `complete = pending === 0`.
- `nextCursor` is the next player ID or `null` for an empty roster.
- Cap failures to `failureLimit`.
- Remove cached IDs that are no longer present in the authoritative roster.
- The module contains no HTTP, BitJita URL, React, or server-route code.

- [ ] **Step 4: Add declaration types**

Describe the factory, `runBatch` input callbacks, entry state union (`"fresh" | "stale" | "fallback"`), failure shape, and coverage shape in `claimRosterEnrichment.d.mts`.

- [ ] **Step 5: Run the focused test and confirm GREEN**

Run:

```powershell
node --test apps/bitcraft-local/test/server-claim-roster-enrichment.test.mjs
```

Expected: all cases pass, including the 221-member fairness assertion.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/server/claimRosterEnrichment.mjs apps/bitcraft-local/src/server/claimRosterEnrichment.d.mts apps/bitcraft-local/test/server-claim-roster-enrichment.test.mjs
git commit -m "feat: rotate large claim enrichment batches"
```

---

## Task 3: Move player-detail enrichment to the authoritative server roster

**Files:**

- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/src/server/claimRosterEnrichment.mjs`
- Modify: `apps/bitcraft-local/src/server/claimRosterEnrichment.d.mts`
- Create: `apps/bitcraft-local/test/server-player-detail-enrichment.test.mjs`
- Modify: `apps/bitcraft-local/test/server-manual-refresh-boundary.test.mjs`

- [ ] **Step 1: Write a failing server integration seam test**

Test the coordinator exported by `claimRosterEnrichment.mjs` without importing the process-starting server:

```js
export async function enrichClaimPlayerDetails({
  claimId,
  members,
  forceRefresh,
  enrichment,
  fetchPlayerDetail,
})
```

The test supplies 221 roster rows and fake player loads, then asserts:

- response `players.length === 221`;
- exactly 60 detail loaders run;
- concurrency never exceeds six;
- the remaining 161 rows are roster fallbacks with `detailAvailable: false`;
- coverage is `{ rosterTotal: 221, refreshedThisRequest: 60, covered: 60, pending: 161, complete: false, ... }`;
- the second call refreshes a disjoint next batch and returns 120 enriched rows;
- a failed selected lookup leaves the base row present and increments `failedThisRequest`;
- failure details are capped at 20.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
node --test apps/bitcraft-local/test/server-player-detail-enrichment.test.mjs
```

Expected: FAIL because `enrichClaimPlayerDetails` does not exist.

- [ ] **Step 3: Wire the module into `server.mjs`**

- Add and export `enrichClaimPlayerDetails` as a dependency-injected specialisation of `runBatch`; it fixes batch size/concurrency to 60/6 and maps entries to the full `players` result.
- Its caller supplies `fetchPlayerDetail` and `fallbackPlayer`; it contains no BitJita URL or HTTP code.
- Add its input/output types to `claimRosterEnrichment.d.mts`.
- Import `createClaimRosterEnrichment` and `enrichClaimPlayerDetails` in `server.mjs`.
- Create one process-wide enrichment instance.
- Add `fetchClaimRoster(claimId, { forceRefresh })` using:

```js
fetchBitjita(`/claims/${encodeURIComponent(claimId)}/members`, {
  timeoutMs: 8_000,
  cache: forceRefresh !== true,
})
```

- Unwrap its `members` array and reject an unresolved roster with the existing bounded public error behavior.
- Change `playerDetailSummaries` to accept `{ claimId, forceRefresh }`, fetch the server roster, and call the testable coordinator.
- Configure batch size 60, concurrency six, and stale retention five minutes.
- Preserve `fallbackPlayerFromMember`.
- Return `requested: rosterTotal`, `failed`, bounded `failures`, `players`, and `coverage`.
- Remove member-list-derived cache keys and the 100-member slice from this request path.
- Replace the fresh-hit behavior of the old aggregate cache with a local `loadProgressiveHelperCached` wrapper: incomplete coverage always executes the next batch, complete coverage may use its TTL, in-flight calls coalesce, and a loader failure may return the last valid aggregate as stale. Key it by claim ID and family.

- [ ] **Step 4: Make the route ignore legacy client members**

At `POST /api/local/player-details`, pass only:

```js
await playerDetailSummaries({
  claimId: body?.claimId,
  forceRefresh,
})
```

Do not spread the request body into the helper.

- [ ] **Step 5: Update manual-refresh assertions**

Change `server-manual-refresh-boundary.test.mjs` to assert the route explicitly forwards `claimId` and `forceRefresh`, and does not forward `...body`.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run:

```powershell
node --test apps/bitcraft-local/test/server-claim-roster-enrichment.test.mjs apps/bitcraft-local/test/server-player-detail-enrichment.test.mjs apps/bitcraft-local/test/server-manual-refresh-boundary.test.mjs
```

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/src/server/claimRosterEnrichment.mjs apps/bitcraft-local/src/server/claimRosterEnrichment.d.mts apps/bitcraft-local/test/server-player-detail-enrichment.test.mjs apps/bitcraft-local/test/server-manual-refresh-boundary.test.mjs
git commit -m "fix: enrich every claim member progressively"
```

---

## Task 4: Rotate and accumulate production and passive crafts

**Files:**

- Modify: `apps/bitcraft-local/server.mjs`
- Modify: `apps/bitcraft-local/src/server/claimRosterEnrichment.mjs`
- Modify: `apps/bitcraft-local/src/server/claimRosterEnrichment.d.mts`
- Create: `apps/bitcraft-local/test/server-large-claim-crafts.test.mjs`
- Modify: `apps/bitcraft-local/test/server-production-activity.test.mjs`
- Modify: `apps/bitcraft-local/test/server-manual-refresh-boundary.test.mjs`

- [ ] **Step 1: Write failing production-craft coordinator tests**

Specify the testable coordinators to add to `claimRosterEnrichment.mjs`:

```js
export async function enrichClaimProductionCrafts(dependencies)
export async function enrichClaimPassiveCrafts(dependencies)
```

Production cases:

- a claim-public craft is returned on the first call even if all member loaders are pending or fail;
- only 50 of 221 member craft endpoints run, at concurrency at most eight;
- a second batch retains first-batch private crafts and adds second-batch crafts;
- crafts from another claim ID are rejected;
- duplicate craft entity IDs merge using the existing public/private visibility rules;
- item, cargo, and claim catalogs accumulate from cached member payloads;
- coverage progresses 50, 100, 150, 200, 221 without first-50 starvation;
- manual refresh still selects only 50 members.

Passive cases:

- only 50 of 221 passive endpoints run, at concurrency at most four;
- rows from completed earlier batches remain available;
- the merged response is sorted newest-first and capped at 18;
- coverage progresses independently from production coverage;
- a member failure does not remove earlier cached rows.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
node --test apps/bitcraft-local/test/server-large-claim-crafts.test.mjs
```

Expected: FAIL because the production/passive coordinator exports do not exist.

- [ ] **Step 3: Implement production batching**

Refactor `settlementProductionCrafts` to:

- add `enrichClaimProductionCrafts` to the focused module and declaration file; inject the claim-public payload, per-member loader, claim-ID extractor, and catalog merger so the module owns deterministic cached/fresh/fallback merge rules without owning transport;
- require `claimId`;
- fetch the authoritative roster server-side;
- fetch claim-public crafts every aggregate refresh as today;
- call the enrichment module with family `production-crafts`, batch size 50, concurrency eight, and `fetchBitjita(/players/:id/crafts?completed=false)`;
- merge claim-public crafts with every cached member payload returned by `entries`;
- preserve `craftClaimId`, `mergeCraftCatalogs`, dedupe by craft entity ID, visibility classification, timeouts, partial errors, freshness metadata, and stale-if-error;
- return the new `coverage` object and `failedMemberRequests`;
- key the outer aggregate cache by claim ID, not a roster string.
- use `loadProgressiveHelperCached` so an incomplete cached aggregate advances on every request instead of returning the same first batch until TTL expiry.

- [ ] **Step 4: Implement passive batching**

Refactor `passiveCraftSummaries` to:

- add `enrichClaimPassiveCrafts` to the focused module and declaration file; inject the per-member passive loader and row mapper;
- require `claimId`;
- fetch the authoritative roster server-side;
- call the enrichment module with family `passive-crafts`, batch size 50, concurrency four, and the existing `fetchCachedPassiveCrafts`;
- merge rows from every successful cached member value;
- sort by `sortTimestamp` descending and cap at 18;
- return `rows`, `requested: rosterTotal`, `failed`, and `coverage`;
- key the outer aggregate cache by claim ID.
- use the same progressive-cache rule: incomplete coverage advances; complete coverage may use the normal TTL; stale-if-error remains available.

- [ ] **Step 5: Make both routes ignore legacy client rosters**

Pass only `{ claimId: body?.claimId, forceRefresh }` at `/passive-crafts` and `/production/crafts`.

- [ ] **Step 6: Preserve collector compatibility**

Update internal collector calls that currently pass `{ members }` so they pass only the claim ID. The helper resolves the same authoritative roster itself; no collector job may reintroduce a client-style roster contract.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run:

```powershell
node --test apps/bitcraft-local/test/server-large-claim-crafts.test.mjs apps/bitcraft-local/test/server-production-activity.test.mjs apps/bitcraft-local/test/server-manual-refresh-boundary.test.mjs
```

Expected: all pass.

- [ ] **Step 8: Commit**

```powershell
git add apps/bitcraft-local/server.mjs apps/bitcraft-local/src/server/claimRosterEnrichment.mjs apps/bitcraft-local/src/server/claimRosterEnrichment.d.mts apps/bitcraft-local/test/server-large-claim-crafts.test.mjs apps/bitcraft-local/test/server-production-activity.test.mjs apps/bitcraft-local/test/server-manual-refresh-boundary.test.mjs
git commit -m "fix: accumulate crafts across large claims"
```

---

## Task 5: Add the route-specific compatibility body limit

**Files:**

- Modify: `apps/bitcraft-local/src/server/httpBodies.mjs`
- Modify: `apps/bitcraft-local/test/server-http-bodies.test.mjs`
- Create: `apps/bitcraft-local/test/server-claim-helper-routes.test.mjs`
- Modify: `apps/bitcraft-local/server.mjs`

- [ ] **Step 1: Write failing body-policy tests**

Extend `server-http-bodies.test.mjs`:

```js
assert.equal(BODY_LIMITS.json, 64 * 1024);
assert.equal(BODY_LIMITS.claimHelper, 256 * 1024);
```

In `server-http-bodies.test.mjs`, build a 77 KiB legacy JSON request and assert:

- `readJson(request, BODY_LIMITS.claimHelper)` succeeds;
- `readJson(request, BODY_LIMITS.json)` rejects with `RequestBodyTooLargeError`.

In `server-claim-helper-routes.test.mjs`, read `server.mjs` and assert each of the three exact route blocks uses `readJson(req, BODY_LIMITS.claimHelper)`, explicitly forwards `body?.claimId`, and does not spread `...body`. Assert a nearby generic JSON route still uses `BODY_LIMITS.json`.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run:

```powershell
node --test apps/bitcraft-local/test/server-http-bodies.test.mjs apps/bitcraft-local/test/server-claim-helper-routes.test.mjs
```

Expected: missing `claimHelper` limit and/or HTTP 413 from the three routes.

- [ ] **Step 3: Implement the narrow policy**

Add:

```js
claimHelper: 256 * 1024,
```

Use `BODY_LIMITS.claimHelper` only in the three claim-helper route handlers. Keep every other `BODY_LIMITS.json` use unchanged.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run:

```powershell
node --test apps/bitcraft-local/test/server-http-bodies.test.mjs apps/bitcraft-local/test/server-claim-helper-routes.test.mjs
```

Expected: all pass; generic limit remains 64 KiB.

- [ ] **Step 5: Commit**

```powershell
git add apps/bitcraft-local/src/server/httpBodies.mjs apps/bitcraft-local/server.mjs apps/bitcraft-local/test/server-http-bodies.test.mjs apps/bitcraft-local/test/server-claim-helper-routes.test.mjs
git commit -m "fix: accept legacy claim helper payloads"
```

---

## Task 6: Replace the history overlay with an actionable inline warning

**Files:**

- Create: `apps/bitcraft-local/src/history/coveragePresentation.ts`
- Create: `apps/bitcraft-local/test/history-coverage-presentation.test.mjs`
- Modify: `apps/bitcraft-local/src/AppShell.tsx`
- Modify: `apps/bitcraft-local/src/styles/app-chrome.css`
- Modify: `apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs`

- [ ] **Step 1: Write failing pure presentation tests**

Export:

```ts
export type CoveragePresentation = null | {
  tone: "warning";
  summary: string;
  detail: string;
};

export function coveragePresentation(
  coverage: Record<string, unknown> | null,
  now?: number,
): CoveragePresentation;
```

Test:

- healthy payload with last success, zero gaps, and lag `<= 15m` returns `null`;
- no `lastSuccessAt` returns a pending warning;
- lag over 15 minutes returns a warning naming the lag and last-success time;
- one or more gaps returns a warning with singular/plural gap copy;
- lag and gaps combine into one compact detail;
- null or malformed payload returns `null`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/history-coverage-presentation.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure decision**

Use the server’s `lagSeconds` as the primary lag measure; do not derive a new status from the client clock except for formatting the supplied last-success timestamp. Treat exactly 15 minutes as healthy and anything greater as warning.

- [ ] **Step 4: Render only the warning in normal flow**

In `AppShell.tsx`:

- Import `coveragePresentation`.
- Keep the existing coverage fetch and abort behavior.
- Return `null` for healthy coverage.
- Render:

```tsx
<div className="history-coverage-warning" role="status">
  <AlertTriangle aria-hidden="true" />
  <div>
    <strong>{presentation.summary}</strong>
    <span>{presentation.detail}</span>
  </div>
</div>
```

- Remove all `.api-status-banner` usage from `CollectionCoverage`.
- Use “claim” in all new and touched copy.

- [ ] **Step 5: Add compact inline CSS**

In `styles/app-chrome.css`, style `.history-coverage-warning` with:

- normal document flow (`position: static` or no `position`);
- compact two-column icon/content layout;
- warning border/background consistent with existing dashboard warnings;
- no modal/status z-index;
- wrapping last-success and reason text;
- single-column/narrow adjustments below 640 px.

- [ ] **Step 6: Extend the chrome boundary test**

Assert:

- `AppShell` uses `history-coverage-warning`;
- `CollectionCoverage` no longer includes `api-status-banner`;
- CSS contains the new class;
- the class block does not contain `position: fixed`;
- healthy presentation is tested as `null`.

- [ ] **Step 7: Run focused tests and build**

Run:

```powershell
node --experimental-strip-types --test apps/bitcraft-local/test/history-coverage-presentation.test.mjs apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: tests and build pass.

- [ ] **Step 8: Commit**

```powershell
git add apps/bitcraft-local/src/history/coveragePresentation.ts apps/bitcraft-local/src/AppShell.tsx apps/bitcraft-local/src/styles/app-chrome.css apps/bitcraft-local/test/history-coverage-presentation.test.mjs apps/bitcraft-local/test/appshell-chrome-boundary.test.mjs
git commit -m "fix: keep history warnings in page flow"
```

---

## Task 7: Repair the create-plan dialog styling

**Files:**

- Modify: `apps/bitcraft-local/src/styles/craft-planning.css`
- Modify: `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
- Modify: `apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs`

- [ ] **Step 1: Write failing CSS contract assertions**

Extend the existing CSS boundary test to require scoped rules for:

```txt
.craft-plan-create-dialog
.craft-plan-create-dialog .modal-header
.craft-plan-create-dialog .modal-header .icon-button
.craft-plan-create-dialog .modal-body
.craft-plan-create-dialog .modal-actions
@media (max-width: 640px)
```

Assert the surface has a non-transparent background, border, border radius, shadow, viewport-bounded width/max-height, and hidden outer overflow; body has padding and vertical overflow; footer has separated/padded flex actions.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
```

Expected: FAIL because only body gap and textarea rules exist.

- [ ] **Step 3: Add scoped operational-dashboard styling**

Implement:

- width `min(560px, calc(100vw - 28px))`;
- max-height `calc(100vh - 36px)`;
- opaque raised gradient or `var(--panel-raised)` fallback;
- existing border/radius/shadow tokens;
- structured header with close button top-right;
- body `overflow-y: auto`;
- footer aligned right with a top border;
- mobile width/max-height and stacked or full-width actions at `max-width: 640px`.

Do not add global `.modal`, `.modal-header`, or `.modal-actions` rules.

- [ ] **Step 4: Update dialog copy while the component is touched**

Change:

- “Create a settlement plan” to “Create a claim plan”.
- “for this settlement” to “for this claim”.
- fallback “Settlement craft plan” to “Claim craft plan”.

- [ ] **Step 5: Run focused test and build**

Run:

```powershell
node --test apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs apps/bitcraft-local/test/modal-foundation-boundary.test.mjs
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: tests and build pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/bitcraft-local/src/styles/craft-planning.css apps/bitcraft-local/src/pages/CraftPlanningPage.tsx apps/bitcraft-local/test/craft-planning-css-boundary.test.mjs
git commit -m "fix: restore create plan dialog styling"
```

---

## Task 8: Rename all user-facing settlement language to claim

**Files:**

- Create: `apps/bitcraft-local/test/public-claim-language.test.mjs`
- Modify public copy in:
  - `README.md`
  - `apps/bitcraft-local/server.mjs`
  - `apps/bitcraft-local/src/AppShell.tsx`
  - `apps/bitcraft-local/src/settlements/SettlementPicker.tsx`
  - `apps/bitcraft-local/src/components/admin/AdminDataSection.tsx`
  - `apps/bitcraft-local/src/components/admin/adminDisplay.ts`
  - `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
  - `apps/bitcraft-local/src/components/main/AppChrome.tsx`
  - `apps/bitcraft-local/src/components/main/Badges.tsx`
  - `apps/bitcraft-local/src/components/main/FirstRunTourManager.tsx`
  - `apps/bitcraft-local/src/components/main/LegalDialogs.tsx`
  - `apps/bitcraft-local/src/components/main/UserSettingsDialog.tsx`
  - `apps/bitcraft-local/src/legal/legalPolicy.mjs`
  - `apps/bitcraft-local/src/navigation.ts`
  - `apps/bitcraft-local/src/navigation/navigationLabels.ts`
  - `apps/bitcraft-local/src/navigation/routeHelp.ts`
  - `apps/bitcraft-local/src/notifications/notificationSources.ts`
  - `apps/bitcraft-local/src/pages/ActivityPage.tsx`
  - `apps/bitcraft-local/src/pages/ConstructionPage.tsx`
  - `apps/bitcraft-local/src/pages/CraftPlanManagerDialog.tsx`
  - `apps/bitcraft-local/src/pages/CraftPlanningPage.tsx`
  - `apps/bitcraft-local/src/pages/DashboardPage.tsx`
  - `apps/bitcraft-local/src/pages/InventoryPage.tsx`
  - `apps/bitcraft-local/src/pages/LeaderboardPage.tsx`
  - `apps/bitcraft-local/src/pages/MapPage.tsx`
  - `apps/bitcraft-local/src/pages/MarketPage.tsx`
  - `apps/bitcraft-local/src/pages/MembersPage.tsx`
  - `apps/bitcraft-local/src/pages/ProductionPage.tsx`
  - `apps/bitcraft-local/src/pages/PublicCraftFinderPage.tsx`
  - `apps/bitcraft-local/src/pages/RegionPage.tsx`
  - `apps/bitcraft-local/src/pages/ResearchPage.tsx`
  - `apps/bitcraft-local/src/pages/SettlementMarketPage.tsx`
  - `apps/bitcraft-local/src/pages/SkillsPage.tsx`
- Modify affected existing tests:
  - `apps/bitcraft-local/test/appshell-navigation-boundary.test.mjs`
  - `apps/bitcraft-local/test/first-run-tour.test.mjs`
  - `apps/bitcraft-local/test/legal-policy.test.mjs`
  - `apps/bitcraft-local/test/server-public-runtime.test.mjs`
  - any focused page boundary test whose expected rendered copy changes

- [ ] **Step 1: Write the failing terminology guard**

Use the TypeScript compiler API to scan string literals, no-substitution template literals, JSX text, and string-valued JSX attributes in public `.ts`, `.tsx`, and `.mjs` source.

Fail on case-insensitive whole-word:

```regex
\bsettlements?\b
```

Maintain a narrow explicit allowlist containing only exact technical compatibility values, not whole files. Initial allowed literals/patterns:

- route ID/path `settlement-market`;
- browser storage prefix/key fragments `claim-monitor.settlement.`;
- CSS class fragments such as `settlement-passive-crafts`;
- API/schema field names used as exact machine values;
- migration SQL identifiers;
- internal diagnostics/comments are excluded by AST node selection rather than allowlisted.

The failure output must include file, line, and offending literal so each visible string can be corrected.

Also explicitly assert the public product name is:

```txt
BitCraft Claim Monitor
```

in `AppShell.tsx`, `SettlementPicker.tsx`, `legalPolicy.mjs`, `server.mjs`, and `README.md`.

- [ ] **Step 2: Run the terminology test and confirm RED**

Run:

```powershell
node --test apps/bitcraft-local/test/public-claim-language.test.mjs
```

Expected: FAIL with the current public strings, including `BitCraft Settlement Monitor`.

- [ ] **Step 3: Update public product and domain copy**

Make grammar-aware replacements:

- settlement → claim;
- settlements → claims;
- settlement’s → claim’s;
- Settlement → Claim;
- BitCraft Settlement Monitor → BitCraft Claim Monitor.

Cover headings, descriptions, warnings, error text, legal copy, titles, accessibility labels, onboarding/tour copy, admin copy, empty states, fallback names, and server-returned public messages.

Do not mechanically rename:

- file/component/function/type names;
- `settlement-market`;
- `claim-monitor.settlement.*`;
- CSS classes/selectors;
- database tables/columns or migration SQL;
- API response field names;
- internal-only identifiers.

- [ ] **Step 4: Update expected-copy tests**

Change existing assertions only where the user-visible expected text changed. Do not weaken tests or replace exact public-copy assertions with permissive regexes.

- [ ] **Step 5: Run terminology and affected UI tests**

Run:

```powershell
node --test apps/bitcraft-local/test/public-claim-language.test.mjs apps/bitcraft-local/test/appshell-navigation-boundary.test.mjs apps/bitcraft-local/test/first-run-tour.test.mjs apps/bitcraft-local/test/legal-policy.test.mjs apps/bitcraft-local/test/server-public-runtime.test.mjs
```

Expected: all pass.

- [ ] **Step 6: Perform a residual inventory**

Run:

```powershell
rg -n -i "\bsettlements?\b" README.md apps/bitcraft-local/src apps/bitcraft-local/server.mjs
```

Inspect every remaining match and confirm it is a technical identifier, schema/migration term, internal symbol, or CSS selector covered by the explicit compatibility rules. Remove any visible-copy match rather than broadening the allowlist.

- [ ] **Step 7: Build and commit**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Then:

```powershell
git add README.md apps/bitcraft-local/server.mjs apps/bitcraft-local/src apps/bitcraft-local/test
git commit -m "refactor: use claim language in public copy"
```

---

## Task 9: Prepare the hotfix release

**Files:**

- Modify: `apps/bitcraft-local/package.json`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write the release notes**

Move the hotfix into:

```md
## [0.48.1-beta.1] - 2026-07-28

### Changed

- Renamed public settlement terminology and the product name to BitCraft Claim Monitor.
- Made large-claim member and craft details load progressively in bounded batches.

### Fixed

- Fixed HTTP 413 errors when opening Members and Craft Monitor for large claims.
- Fixed history coverage obscuring page content when collection is healthy.
- Fixed the shared-plan creation dialog surface and action styling.
```

Keep `[Unreleased]` at the top.

- [ ] **Step 2: Bump package version**

Change `apps/bitcraft-local/package.json` from `0.48.0-beta.2` to `0.48.1-beta.1`.

- [ ] **Step 3: Run version policy test**

Run:

```powershell
node --test apps/bitcraft-local/test/versioning-policy.test.mjs apps/bitcraft-local/test/server-app-release.test.mjs
```

Expected: both pass.

- [ ] **Step 4: Commit**

```powershell
git add CHANGELOG.md apps/bitcraft-local/package.json
git commit -m "chore: prepare 0.48.1 beta 1"
```

---

## Task 10: Complete local verification and browser acceptance

**Files:**

- Modify only if verification reveals a regression directly caused by this hotfix.

- [ ] **Step 1: Run the complete test suite**

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests pass; baseline was 867 passing, zero failing before implementation.

- [ ] **Step 2: Run the production build**

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Inspect the complete diff**

```powershell
git diff main...HEAD --check
git status --short
git log --oneline main..HEAD
```

Expected: no whitespace errors, no untracked runtime files, and only hotfix/spec/plan/release commits.

- [ ] **Step 4: Start the local smoke server**

```powershell
node scripts/start-bitcraft-local-smoke.mjs --force-restart
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: healthy local API at `http://127.0.0.1:18449`.

- [ ] **Step 5: Browser-check Ba Sing Se**

Use claim ID `1369094286737286086` and verify:

- Members loads the complete 221-row base roster without HTTP 413.
- Network request body for `/api/local/player-details` is only `{"claimId":"1369094286737286086"}`.
- The first response has coverage 60/221 and subsequent refreshes advance it without removing rows.
- Craft Monitor shows claim-public crafts immediately.
- `/api/local/production/crafts` and `/api/local/passive-crafts` contain only `claimId`.
- craft coverage advances in bounded 50-member batches.
- incomplete enrichment is informational, not a full BitJita refresh failure.

- [ ] **Step 6: Browser-check history and create-plan UI**

Verify desktop and a narrow viewport:

- healthy history coverage renders nothing;
- simulated pending/stale/gap coverage renders a compact inline warning that does not overlap content;
- Create Claim Plan has an opaque bounded panel, styled close control, scrollable body, and usable actions;
- underlying page remains scroll-locked while the modal is open;
- public page titles and visible copy use “claim”, not “settlement”.

- [ ] **Step 7: Commit any verification-only fixes test-first**

If a defect is found, add a focused failing test before editing production code, rerun focused checks, then rerun Tasks 10.1–10.6.

---

## Task 11: Publish through review and deploy

**Files:**

- No source changes expected.

- [ ] **Step 1: Verify branch state**

```powershell
git status --short
git log --oneline main..HEAD
```

Expected: clean worktree with all planned commits.

- [ ] **Step 2: Push the hotfix branch**

```powershell
git push -u origin codex/large-claim-hotfix
```

- [ ] **Step 3: Open a ready pull request**

Title:

```txt
Fix large-claim loading and public claim UI
```

Body must summarize:

- claim-ID-only helper requests;
- authoritative roster and rotating coverage;
- route-only legacy body compatibility;
- history/create-plan fixes;
- terminology and `0.48.1-beta.1`;
- exact test/build/browser evidence.

- [ ] **Step 4: Wait for required checks and review**

Do not weaken or bypass protection. If the repository’s required approval cannot be satisfied normally, stop and request explicit one-time authorization for this pull request; any authorized bypass must be restored immediately.

- [ ] **Step 5: Merge only after approval**

Confirm `main` points to the reviewed hotfix commit and branch protection is active.

- [ ] **Step 6: Dispatch the protected manual production deployment**

Run the existing `deploy-production.yml` workflow from `main`. Do not deploy a branch SHA directly.

- [ ] **Step 7: Approve the protected production environment**

Use the configured GitHub production approval. Confirm the workflow deploys release `0.48.1-beta.1`.

- [ ] **Step 8: Run production smoke checks**

Verify:

```txt
https://claim-monitor.com/api/local/health
```

Then repeat the Ba Sing Se acceptance checks from Task 10 against production, including response status, request sizes, coverage progression, complete base roster, immediate public crafts, inline history behavior, dialog styling, and visible terminology.

- [ ] **Step 9: Verify VPS operational state**

Read-only checks:

```bash
systemctl is-active bitcraft-claim-monitor-public.service
systemctl is-active bitcraft-claim-monitor-public-worker.service
systemctl is-active bitcraft-claim-monitor-public-collector.timer
systemctl is-active bitcraft-claim-monitor-public-backup.timer
readlink -f /opt/bitcraft-claim-monitor-public/current
```

Expected: web and worker active, timers active, current release symlink points to the deployed commit.

- [ ] **Step 10: Report completion**

Include:

- production commit and version;
- PR and deployment workflow links;
- complete test/build results;
- Ba Sing Se request/status/coverage evidence;
- active release and service/timer status;
- any follow-up not included in this hotfix.
