# Large-Claim and Public UI Hotfix Design

## Summary

Fix four production regressions in BitCraft Claim Monitor:

1. Ba Sing Se and other large claims exceed the 64 KiB JSON-body limit because the browser posts every member record to local helper endpoints.
2. The same helpers silently inspect only the first 50 or 100 members, so increasing the request-body limit alone would still leave large claims incomplete.
3. History coverage reuses the fixed emergency-status overlay and obstructs ordinary page content.
4. The shared-plan creation dialog has no surface, header, close-control, or footer styling.

At the same time, replace user-facing “settlement” terminology with “claim” terminology, including the product name **BitCraft Claim Monitor**. Internal route IDs, storage keys, CSS classes, database fields, and migration names remain unchanged.

## Evidence and Root Causes

- Ba Sing Se currently returns 221 claim members.
- The Craft Monitor helper request is 77,544 bytes and returns HTTP 413. A request containing the first 50 members is 17,782 bytes and returns HTTP 200.
- The Members helper request is 77,512 bytes and returns HTTP 413. A request containing the first 100 members is 35,321 bytes and returns HTTP 200.
- The first full-roster payload above the 65,536-byte generic JSON limit occurs at 187 members.
- `playerDetailSummaries` currently slices the roster to 100 members.
- `settlementProductionCrafts` and `passiveCraftSummaries` currently slice the roster to 50 members.
- BitJita exposes one claim-member roster endpoint and individual player-detail, player-craft, and passive-craft endpoints. It does not document a bulk player-detail or bulk player-craft endpoint.
- The history coverage element computes as `position: fixed`, `z-index: 32`, and spans the application viewport.
- The create-plan surface computes with a transparent background, no border, no padding, and a browser-default close button because only its body and textarea have feature-specific CSS.

## Goals

- Never post a full claim roster from the browser to a local helper endpoint.
- Keep a 221-member claim usable without a burst of hundreds of upstream requests.
- Show the complete base claim roster immediately.
- Progressively enrich large-claim player and craft data with visible coverage metadata.
- Preserve current stale-if-error behavior and useful cached results.
- Keep normal history status out of the way while surfacing actionable collection problems.
- Restore the create-plan dialog to the existing operational-dashboard visual language.
- Use “claim” consistently in all user-facing application copy.

## Non-Goals

- Do not rename `settlement-market` routes, `claim-monitor.settlement.*` browser keys, CSS classes, database columns, schema objects, migrations, or internal function names solely for terminology.
- Do not increase global BitJita concurrency or remove request budgeting.
- Do not attempt hundreds of per-player requests in a single page refresh.
- Do not change shared-plan permissions, edit-key behavior, or persistence.

## Large-Claim Request Contract

The browser will send only a validated claim ID:

```json
{ "claimId": "1369094286737286086" }
```

This contract applies to:

- `POST /api/local/player-details`
- `POST /api/local/production/crafts`
- `POST /api/local/passive-crafts`

The server fetches the claim roster through the existing cached BitJita client. Client-supplied member arrays are ignored for data selection.

Add a route-specific `claimHelper` request-body limit of 256 KiB. New clients remain far below the limit; the larger compatibility limit only prevents already-open pre-hotfix browser tabs from failing during deployment. The generic JSON limit remains 64 KiB.

Blank, malformed, or unresolvable claim IDs return the existing bounded public error shape. The server never accepts arbitrary player IDs as authority for which roster to inspect.

## Progressive Roster Enrichment

Create a focused server module for rotating, cached claim-roster enrichment. It owns:

- stable deduplication by player entity ID;
- per-claim and per-family cursors;
- bounded rotating batch selection;
- merge rules for fresh, cached, fallback, failed, and not-yet-covered members;
- coverage metadata;
- cache timestamps and stale classification.

It does not own HTTP routing or BitJita transport.

### Player details

- Return one row for every claim member immediately.
- Refresh at most 60 player-detail records per request with concurrency six.
- Merge refreshed player details with previously cached details.
- Use claim-member fallback rows for members not yet enriched or whose detail request fails.
- Retain successful player detail values for at least one full four-batch rotation; default stale retention is five minutes.

### Production crafts

- Load claim-level public crafts immediately.
- Refresh at most 50 member-craft payloads per request with concurrency eight.
- Merge claim-level public crafts, refreshed member crafts, and cached member-craft payloads.
- Preserve claim-ID filtering, visibility classification, catalog merging, stale-if-error behavior, and deduplication by craft entity ID.

### Passive crafts

- Refresh at most 50 members per request with concurrency four.
- Merge recent cached passive-craft summaries across all covered claim members.
- Continue returning the newest 18 rows after the merge.

### Coverage response

Each helper response includes:

```json
{
  "rosterTotal": 221,
  "refreshedThisRequest": 60,
  "covered": 120,
  "pending": 101,
  "failedThisRequest": 0,
  "complete": false,
  "nextCursor": "opaque-player-id"
}
```

Coverage is informational and contains no private cache keys. The frontend shows a compact “Updating details for X of Y claim members” status while coverage is incomplete. Direct claim data remains available throughout.

Manual refresh bypasses caches only for the selected rotating batch. It does not fan out across the entire roster.

## History Coverage Presentation

Extract a pure presentation decision from the current component.

- Healthy coverage is not rendered.
- Pending initial collection, lag over 15 minutes, or one or more data gaps renders a compact warning in normal page flow.
- The warning never uses `.api-status-banner`, fixed positioning, or overlay z-index.
- The warning includes the last successful collection time and the specific lag/gap reason.
- Fetch failures remain silent when no trustworthy coverage payload exists; page data errors continue through the existing status system.

## Create-Plan Dialog

Keep the existing accessible `Dialog` component and add scoped `.craft-plan-create-dialog` rules:

- opaque raised panel with border, radius, and shadow;
- width bounded to the viewport;
- structured header with title/copy and a top-right styled close button;
- padded, scrollable body;
- separated footer with aligned Cancel and Create Plan actions;
- compact single-column mobile behavior;
- no global `.modal` rules and no dependency on admin-only CSS.

## User-Facing Claim Terminology

Rename visible application language:

- **BitCraft Settlement Monitor** → **BitCraft Claim Monitor**
- settlement / settlements → claim / claims
- settlement member → claim member
- settlement tier → claim tier
- settlement market → claim market
- settlement plan → claim plan
- monitored settlement → monitored claim

Apply this to navigation labels, headings, descriptions, diagnostics, dialogs, onboarding, admin copy, empty states, legal copy, accessibility labels, document titles, fallback names, and public server error text.

Preserve technical identifiers where changing them would create compatibility or migration work, including:

- `settlement-market`
- `claim-monitor.settlement.*`
- component/file names and CSS selectors
- database/schema names
- existing API field names
- internal domain comments and migration terminology

A source-level terminology test will scan renderable strings and maintain a narrow, explicit allowlist for technical identifiers.

## Error Handling

- A failed roster fetch returns a bounded helper error and may serve a valid stale aggregate where available.
- One failed player request does not fail the batch.
- Failure arrays remain capped.
- Helper responses distinguish incomplete progressive coverage from upstream failure.
- The frontend does not present incomplete enrichment as a full refresh failure when direct claim data is valid.
- Existing rate limits, abort signals, manual-refresh guards, and stale-if-error behavior remain active.

## Test Strategy

Follow red-green-refactor for each behavior:

1. A 221-member fixture proves helper request bodies contain only `claimId` and remain below the generic body limit.
2. A rotating-batch module test proves every member is covered across successive batches without duplicates or first-N starvation.
3. Player-detail tests prove the full base roster is returned while enrichment coverage progresses.
4. Production tests prove public crafts remain immediate and cached member crafts accumulate across batches.
5. Passive-craft tests prove recent rows accumulate across rotating batches.
6. Compatibility tests prove legacy 77 KiB helper requests are accepted only by the route-specific limit.
7. Coverage presentation tests prove healthy status is hidden and unhealthy status is inline.
8. CSS boundary tests require the create-plan surface, header, close button, body, footer, and mobile rules.
9. Terminology tests reject user-facing whole-word “settlement” strings outside the explicit technical allowlist.
10. Full tests and production build must pass.
11. Browser verification covers Ba Sing Se Members, Craft Monitor, Craft Planning, healthy history pages, and a narrow viewport.

## Deployment Verification

- Deploy through the protected manual production workflow.
- Verify Ba Sing Se no longer produces HTTP 413 on Members or Craft Monitor.
- Confirm helper coverage progresses between refreshes without dropping the 221-member base roster.
- Confirm direct claim crafts remain visible during enrichment.
- Confirm healthy history coverage no longer overlays content.
- Confirm the create-plan dialog is visually bounded and usable on desktop and mobile.
- Search the rendered public UI for remaining user-facing “settlement” language.
- Confirm health, collector timer, backup timer, and active release after deployment.
