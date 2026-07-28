import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

function routeBlock(pathname) {
  const marker = `url.pathname === "${pathname}"`;
  const start = server.indexOf(marker);
  assert.notEqual(start, -1, `missing route ${pathname}`);
  const end = server.indexOf("\n    if (req.method", start + marker.length);
  return server.slice(start, end === -1 ? start + 1_500 : end);
}

test("claim helper routes use only the compatibility body policy and claim ID", () => {
  for (const pathname of [
    "/api/local/passive-crafts",
    "/api/local/player-details",
    "/api/local/production/crafts",
  ]) {
    const route = routeBlock(pathname);
    assert.match(route, /readJson\(req,\s*BODY_LIMITS\.claimHelper\)/, pathname);
    assert.match(route, /claimId:\s*body\?\.claimId/, pathname);
    assert.doesNotMatch(route, /\.\.\.body/, pathname);
  }
});

test("generic JSON routes retain the 64 KiB body policy", () => {
  assert.match(
    routeBlock("/api/local/market/event/resolve"),
    /readJson\(req,\s*BODY_LIMITS\.json\)/,
  );
});
