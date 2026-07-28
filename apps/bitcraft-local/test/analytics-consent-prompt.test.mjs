import assert from "node:assert/strict";
import test from "node:test";

import * as settlementSelection from "../src/settlements/settlementSelection.ts";

test("analytics consent waits until the required settlement choice is complete", () => {
  assert.equal(typeof settlementSelection.shouldShowAnalyticsPrompt, "function");
  assert.equal(settlementSelection.shouldShowAnalyticsPrompt({
    consent: null,
    claimId: "",
    settlementPickerOpen: true,
    privacyOpen: false,
  }), false);
  assert.equal(settlementSelection.shouldShowAnalyticsPrompt({
    consent: null,
    claimId: "1369094286777412590",
    settlementPickerOpen: false,
    privacyOpen: false,
  }), true);
});

test("analytics consent stays hidden while either modal is already open", () => {
  assert.equal(settlementSelection.shouldShowAnalyticsPrompt({
    consent: null,
    claimId: "1369094286777412590",
    settlementPickerOpen: true,
    privacyOpen: false,
  }), false);
  assert.equal(settlementSelection.shouldShowAnalyticsPrompt({
    consent: null,
    claimId: "1369094286777412590",
    settlementPickerOpen: false,
    privacyOpen: true,
  }), false);
});
