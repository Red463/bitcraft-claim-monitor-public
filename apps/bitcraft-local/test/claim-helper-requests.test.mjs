import assert from "node:assert/strict";
import test from "node:test";

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
