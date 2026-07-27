import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { claimPendingAction, releasePendingAction } from "../src/utils/pendingActions.ts";

test("pending action registry rejects duplicate submissions until release", () => {
  const pending = new Set();
  assert.equal(claimPendingAction(pending, "plan:update"), true);
  assert.equal(claimPendingAction(pending, "plan:update"), false);
  releasePendingAction(pending, "plan:update");
  assert.equal(claimPendingAction(pending, "plan:update"), true);
});

test("shared async states expose distinct accessible semantics", () => {
  const component = readFileSync(new URL("../src/components/main/AsyncState.tsx", import.meta.url), "utf8");
  assert.match(component, /"loading"\s*\|\s*"empty"\s*\|\s*"no-match"\s*\|\s*"restricted"\s*\|\s*"stale"\s*\|\s*"error"/);
  assert.match(component, /kind === "error" \? "alert" : "status"/);
  assert.match(component, /aria-live=/);
});

test("action buttons preserve validation disabling while announcing pending work", () => {
  const component = readFileSync(new URL("../src/components/main/ActionButton.tsx", import.meta.url), "utf8");
  assert.match(component, /pending: boolean/);
  assert.match(component, /disabled=\{disabled \|\| pending\}/);
  assert.match(component, /aria-busy=\{pending\}/);
});
