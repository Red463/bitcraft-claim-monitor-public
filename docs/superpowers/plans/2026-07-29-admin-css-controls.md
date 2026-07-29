# Administrator CSS Controls Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the malformed administrator metric grids, form controls, dropdowns, spacing, and responsive behavior without redesigning the existing console or changing its behavior.

**Architecture:** Keep `AdminPanel.tsx` and all administrator data flows unchanged. Add the missing visual contract to `admin.css`, scoped beneath `.admin-panel`, and protect that contract with a focused source-boundary test. Verify the compiled application and every administrator tab in the browser.

**Tech Stack:** React, TypeScript, Vite, plain CSS, Node.js built-in test runner, pnpm.

## Global Constraints

- Preserve the current dense, table-first administrator appearance.
- Scope new styling beneath `.admin-panel`; do not change public pages.
- Do not change API, authentication, persistence, submission, or data behavior.
- Do not extract components or broadly refactor the stylesheet.
- Reuse existing colors, borders, radii, spacing, and button styles.
- Keep native control behavior intact.

---

## File Structure

- Create `apps/bitcraft-local/test/admin-css-boundary.test.mjs`: focused contract test proving that the current `AdminPanel` class names have scoped layout, control, focus, table-overflow, and responsive CSS.
- Modify `apps/bitcraft-local/src/styles/admin.css`: define only the missing `.admin-panel` layout and control rules.
- Do not modify `apps/bitcraft-local/src/components/admin/AdminPanel.tsx` unless browser verification proves one minimal class addition is unavoidable.

### Task 1: Protect the Administrator CSS Contract

**Files:**
- Create: `apps/bitcraft-local/test/admin-css-boundary.test.mjs`
- Read: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Test: `apps/bitcraft-local/test/admin-css-boundary.test.mjs`

**Interfaces:**
- Consumes: the rendered class names `admin-panel`, `admin-section-stack`, `stats-grid`, `stat-card`, `form-grid`, `table-wrap`, and `admin-tabs`.
- Produces: a source-level CSS contract that fails when these current component classes lack scoped layout and responsive rules.

- [ ] **Step 1: Write the failing boundary test**

Create `apps/bitcraft-local/test/admin-css-boundary.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(
  new URL("../src/components/admin/AdminPanel.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../src/styles/admin.css", import.meta.url),
  "utf8",
);

test("administrator panel renders the layout classes covered by its stylesheet", () => {
  for (const className of [
    "admin-panel",
    "admin-section-stack",
    "stats-grid",
    "stat-card",
    "form-grid",
    "table-wrap",
    "admin-tabs",
  ]) {
    assert.match(panel, new RegExp(`className="[^"]*${className}`));
  }
});

test("administrator controls and metric cards use scoped responsive layout rules", () => {
  assert.match(css, /\.admin-panel\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.admin-panel \.admin-section-stack\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.admin-panel \.stats-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(190px,\s*1fr\)\)/s);
  assert.match(css, /\.admin-panel \.stat-card\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(css, /\.admin-panel \.form-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(220px,\s*1fr\)\)/s);
  assert.match(css, /\.admin-panel \.form-grid > label:not\(\.toggle-line\)\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.admin-panel :is\(input, select, textarea\):focus-visible\s*\{[^}]*outline:\s*2px solid/s);
  assert.match(css, /\.admin-panel \.table-wrap\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(css, /@media \(max-width:\s*700px\)[\s\S]*?\.admin-panel \.form-grid,[\s\S]*?\.admin-panel \.stats-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --test apps/bitcraft-local/test/admin-css-boundary.test.mjs
```

Expected: the rendered-class test passes, while the scoped CSS contract test fails because `.admin-panel` currently lacks these rules.

- [ ] **Step 3: Inspect the failure**

Confirm the failure names a missing `.admin-panel` selector. If the failure is a syntax or path error, correct only the test and rerun until it fails for the missing production CSS.

### Task 2: Add the Missing Scoped Administrator Styles

**Files:**
- Modify: `apps/bitcraft-local/src/styles/admin.css`
- Test: `apps/bitcraft-local/test/admin-css-boundary.test.mjs`

**Interfaces:**
- Consumes: the class-name contract protected by Task 1.
- Produces: scoped CSS for section stacks, metric cards, form grids, controls, focus states, tables, tab wrapping, and small-screen layouts.

- [ ] **Step 1: Add the minimal `.admin-panel` layout rules**

Add a focused block near the existing base admin layout rules in `admin.css`:

```css
.admin-panel {
  min-width: 0;
  align-content: start;
}

.admin-panel .admin-topbar,
.admin-panel .split-header {
  flex-wrap: wrap;
}

.admin-panel .admin-section-stack {
  min-width: 0;
  display: grid;
  gap: 16px;
}

.admin-panel .admin-section-stack > h3,
.admin-panel .admin-section-stack > p {
  margin-block: 0;
}
```

- [ ] **Step 2: Restore metric-card layout**

Add:

```css
.admin-panel .stats-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
}

.admin-panel .stat-card {
  min-width: 0;
  min-height: 82px;
  overflow: hidden;
  border: 1px solid rgba(108,123,145,.24);
  border-radius: 7px;
  background: linear-gradient(180deg, rgba(11,16,22,.97), rgba(6,9,14,.99));
  padding: 13px;
  display: grid;
  align-content: start;
  gap: 7px;
}

.admin-panel .stat-card > span {
  color: #aab5c4;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .07em;
  text-transform: uppercase;
}

.admin-panel .stat-card > strong {
  min-width: 0;
  color: #fff;
  font-size: 14px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 3: Restore form-grid and control layout**

Add:

```css
.admin-panel .form-grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  align-items: end;
}

.admin-panel .form-grid > label:not(.toggle-line) {
  min-width: 0;
  display: grid;
  gap: 6px;
  color: #aeb9c9;
  font-size: 12px;
  font-weight: 750;
}

.admin-panel :is(input:not([type="checkbox"]):not([type="color"]), select, textarea) {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  border: 1px solid rgba(154,168,190,.28);
  border-radius: 7px;
  background: #080d14;
  color: #f4f7fb;
  padding: 8px 10px;
}

.admin-panel textarea {
  min-height: 82px;
  resize: vertical;
}

.admin-panel input[type="file"] {
  padding: 6px;
}

.admin-panel input[type="color"] {
  width: 100%;
  min-width: 0;
  min-height: 38px;
  border: 1px solid rgba(154,168,190,.28);
  border-radius: 7px;
  background: #080d14;
  padding: 3px;
}

.admin-panel :is(input, select, textarea):focus-visible {
  outline: 2px solid rgba(240,198,79,.72);
  outline-offset: 2px;
  border-color: rgba(240,198,79,.62);
}

.admin-panel .form-grid > .toolbar-button {
  min-height: 38px;
  justify-content: center;
}
```

- [ ] **Step 4: Protect wide tables and narrow screens**

Add:

```css
.admin-panel .table-wrap {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
}

.admin-panel .table-wrap table {
  width: 100%;
}

.admin-panel .admin-tabs {
  max-width: 100%;
}

@media (max-width: 700px) {
  .admin-panel .form-grid,
  .admin-panel .stats-grid {
    grid-template-columns: 1fr;
  }

  .admin-panel .admin-tabs button {
    flex: 1 1 150px;
  }

  .admin-panel .split-header > .toolbar-button {
    width: 100%;
    justify-content: center;
  }
}
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```powershell
node --test apps/bitcraft-local/test/admin-css-boundary.test.mjs
```

Expected: 2 tests pass, 0 fail.

- [ ] **Step 6: Run the complete application test suite**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local test
```

Expected: all tests pass.

- [ ] **Step 7: Commit the tested CSS repair**

```powershell
git add -- apps/bitcraft-local/src/styles/admin.css apps/bitcraft-local/test/admin-css-boundary.test.mjs
git commit -m "fix: repair administrator form styling"
```

### Task 3: Build and Visually Verify Every Administrator Tab

**Files:**
- Inspect: `apps/bitcraft-local/src/styles/admin.css`
- Inspect: `apps/bitcraft-local/src/components/admin/AdminPanel.tsx`
- Inspect: repository diff

**Interfaces:**
- Consumes: the compiled CSS contract from Task 2.
- Produces: evidence that the repaired controls work in the built application across all eight administrator tabs.

- [ ] **Step 1: Build the production application**

Run:

```powershell
corepack pnpm --filter @workspace/bitcraft-local run build
```

Expected: Vite and TypeScript complete successfully.

- [ ] **Step 2: Start or refresh the local smoke server**

Run:

```powershell
node scripts/start-bitcraft-local-smoke.mjs --restart
```

Expected: the launcher returns promptly and serves `http://127.0.0.1:18449/`.

- [ ] **Step 3: Check smoke-server health**

Run:

```powershell
curl.exe -s http://127.0.0.1:18449/api/local/health
```

Expected: a successful health response. If local administrator authentication is unavailable, use the production authenticated console only for final visual comparison after the change is deployed; do not weaken authentication locally.

- [ ] **Step 4: Inspect all administrator tabs**

Open `http://127.0.0.1:18449/?page=admin` when the local session supports it. Otherwise inspect the built CSS through the focused test and defer authenticated visual confirmation until deployment.

For each tab, verify:

- Operations: key/value entries render as separate cards with long values clipped or wrapped safely.
- Active claims: directory metrics are cards; the claim table stays inside a horizontally scrollable wrapper.
- Shared plans: table content and icon actions remain aligned.
- Public settings: labels sit above inputs and selects; textareas use the available width; toggles, file fields, color controls, and save button remain usable.
- Administrators: the add-user fields form a responsive grid; the table remains readable.
- Analytics: metrics render as separate cards.
- Data & backups: the action button and backup table align without overflow.
- Audit: the audit table retains readable columns and horizontal scrolling.

- [ ] **Step 5: Inspect the final diff**

Run:

```powershell
git diff --check
git status --short
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- apps/bitcraft-local/src/styles/admin.css apps/bitcraft-local/test/admin-css-boundary.test.mjs
```

Expected: only the design/plan documents, focused boundary test, and scoped administrator CSS repair are present; no unrelated production changes.

- [ ] **Step 6: Record verification results**

Report:

- RED and GREEN focused-test evidence.
- Complete test-suite result.
- Production build result.
- Which administrator tabs were browser-verified.
- Any local-authentication limitation that deferred final production visual verification.
