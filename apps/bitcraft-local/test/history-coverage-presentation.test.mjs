import assert from "node:assert/strict";
import test from "node:test";

import { coveragePresentation } from "../src/history/coveragePresentation.ts";

test("healthy history coverage stays hidden", () => {
  assert.equal(coveragePresentation({
    collectionStart: "2026-07-28T09:00:00.000Z",
    lastSuccessAt: "2026-07-28T10:00:00.000Z",
    lagSeconds: 15 * 60,
    dataGaps: 0,
  }), null);
});

test("pending initial collection renders an actionable status", () => {
  const presentation = coveragePresentation({
    collectionStart: "2026-07-28T09:00:00.000Z",
    lastSuccessAt: null,
    lagSeconds: 0,
    dataGaps: 0,
  });

  assert.equal(presentation?.tone, "warning");
  assert.match(presentation?.summary ?? "", /starting/i);
  assert.match(presentation?.detail ?? "", /no successful collection/i);
});

test("lag over fifteen minutes includes lag and last-success context", () => {
  const presentation = coveragePresentation({
    lastSuccessAt: "2026-07-28T10:00:00.000Z",
    lagSeconds: 16 * 60,
    dataGaps: 0,
  });

  assert.match(presentation?.detail ?? "", /16m lag/i);
  assert.match(presentation?.detail ?? "", /last successful collection/i);
});

test("data gaps use singular and plural copy", () => {
  assert.match(coveragePresentation({
    lastSuccessAt: "2026-07-28T10:00:00.000Z",
    lagSeconds: 0,
    dataGaps: 1,
  })?.detail ?? "", /1 data gap\b/);
  assert.match(coveragePresentation({
    lastSuccessAt: "2026-07-28T10:00:00.000Z",
    lagSeconds: 0,
    dataGaps: 3,
  })?.detail ?? "", /3 data gaps\b/);
});

test("lag and gaps combine into one compact warning", () => {
  const presentation = coveragePresentation({
    lastSuccessAt: "2026-07-28T10:00:00.000Z",
    lagSeconds: 20 * 60,
    dataGaps: 2,
  });

  assert.match(presentation?.detail ?? "", /20m lag.*2 data gaps/i);
});

test("missing or malformed coverage is silent", () => {
  assert.equal(coveragePresentation(null), null);
  assert.equal(coveragePresentation({}), null);
  assert.equal(coveragePresentation({ lastSuccessAt: "not-a-date", lagSeconds: "no", dataGaps: "no" }), null);
});
