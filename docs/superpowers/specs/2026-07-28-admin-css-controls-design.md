# Administrator CSS Controls Repair

## Context

The production administrator console preserves the intended dense, table-first layout, but several rendered class names have no matching CSS rules. `AdminPanel` renders `admin-panel`, `admin-section-stack`, `stats-grid`, `stat-card`, and `form-grid`, while much of the existing admin styling targets a different `admin-page` structure.

The visible effects are:

- Operations and Analytics key/value data runs together instead of appearing as metric cards.
- Public Settings and Administrators labels, inputs, and selects collapse into dense inline rows.
- Control widths, focus states, section spacing, and narrow-screen wrapping are inconsistent.
- Table-based tabs look better only because they inherit global table styling.

## Scope

Preserve the current administrator console design and behavior. Repair only the layout and control styling used by the existing `AdminPanel`.

The implementation will:

- Add narrowly scoped rules beneath `.admin-panel`.
- Make `admin-section-stack` a consistent vertical layout.
- Define responsive `stats-grid` and `stat-card` presentation.
- Define `form-grid` as an auto-fitting grid and stack each label above its control.
- Normalize inputs, selects, textareas, file controls, and color controls for width, padding, contrast, and focus visibility.
- Keep action buttons aligned without forcing controls into a single row.
- Preserve horizontal scrolling for wide tables.
- Let administrator tabs wrap cleanly at narrower widths.
- Collapse form and metric grids to one column on small screens.

## Non-goals

- No redesign of the administrator console.
- No API, authentication, persistence, form-submission, or data changes.
- No changes to public pages or shared controls outside `.admin-panel`.
- No component extraction or broad stylesheet refactor.

## Implementation Approach

Add the missing `AdminPanel` layout primitives to `apps/bitcraft-local/src/styles/admin.css`. Keep the existing React markup unless visual verification proves that a minimal class addition is necessary. Prefer existing colors, borders, radii, spacing, and button styles so the repaired controls match the surrounding application.

The CSS will use `minmax(0, 1fr)`, `min-width: 0`, and `width: 100%` where needed to prevent overflow. Native control behavior will remain intact.

## Verification

- Add or update a focused CSS boundary test covering the required scoped selectors and responsive rules.
- Run the production build.
- Inspect all eight administrator tabs in the browser:
  - Operations
  - Active claims
  - Shared plans
  - Public settings
  - Administrators
  - Analytics
  - Data & backups
  - Audit
- Confirm inputs, dropdowns, textareas, file/color controls, metric cards, tables, tabs, and buttons remain readable and usable.
- Inspect the final diff for unrelated changes.
