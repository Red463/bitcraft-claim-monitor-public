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
