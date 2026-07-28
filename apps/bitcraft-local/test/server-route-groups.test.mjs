import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_DISCORD_OAUTH_CALLBACK_PATH } from "../src/server/discordOAuthConfig.mjs";
import { mimeType, requestLogPolicy, securityHeaders, staticCacheControl, routeGroup, shouldLogVisitor } from "../src/server/httpRoutes.mjs";

test("routeGroup classifies public API, admin, auth, Discord, static, and app routes", () => {
  assert.equal(routeGroup("/api/local/admin/settings"), "admin");
  assert.equal(routeGroup("/api/local/auth/me"), "auth");
  assert.equal(routeGroup("/api/local/user/preferences"), "auth");
  assert.equal(routeGroup("/api/discord/interactions"), "discord");
  assert.equal(routeGroup("/api/bitjita/claims"), "bitjita-proxy");
  assert.equal(routeGroup("/api/local/history"), "local-api");
  assert.equal(routeGroup("/assets/index.js"), "static");
  assert.equal(routeGroup("/favicon.svg"), "static");
  assert.equal(routeGroup("/favicon.ico"), "static");
  assert.equal(routeGroup("/terms"), "app");
});

test("shouldLogVisitor skips static assets and OAuth callbacks", () => {
  assert.equal(shouldLogVisitor("/assets/index.css"), false);
  assert.equal(shouldLogVisitor("/favicon.ico"), false);
  assert.equal(shouldLogVisitor(ADMIN_DISCORD_OAUTH_CALLBACK_PATH), false);
  assert.equal(shouldLogVisitor("/api/local/health"), true);
  assert.equal(shouldLogVisitor("/"), true);
});

test("requestLogPolicy suppresses sensitive administrator OAuth callback logging", () => {
  const callback = `${ADMIN_DISCORD_OAUTH_CALLBACK_PATH}?code=secret-code&state=secret-state`;

  assert.deepEqual(requestLogPolicy(callback, "slow"), {
    logGeneric: false,
    recordTelemetry: false,
    discordDiagnostic: null,
    failureReturnTo: "/?page=admin",
  });
  assert.deepEqual(requestLogPolicy(callback, "closed"), {
    logGeneric: false,
    recordTelemetry: false,
    discordDiagnostic: null,
    failureReturnTo: "/?page=admin",
  });
  assert.deepEqual(requestLogPolicy(callback, "exception"), {
    logGeneric: false,
    recordTelemetry: false,
    discordDiagnostic: {
      stage: "callback",
      event: "failure",
      reason: "local",
    },
    failureReturnTo: "/?page=admin",
  });
  assert.deepEqual(requestLogPolicy("/api/local/health?probe=1", "slow"), {
    logGeneric: true,
    recordTelemetry: true,
    discordDiagnostic: null,
    failureReturnTo: null,
  });
  assert.doesNotMatch(
    JSON.stringify(requestLogPolicy(callback, "exception")),
    /secret-code|secret-state|callback\?/,
  );
});
test("securityHeaders applies public release browser protections and preserves explicit response headers", () => {
  const headers = securityHeaders({ "content-type": "application/json", "cache-control": "no-store" });

  assert.equal(headers["content-type"], "application/json");
  assert.equal(headers["cache-control"], "no-store");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["x-frame-options"], "SAMEORIGIN");
  assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["cross-origin-opener-policy"], "same-origin");
  assert.match(headers["content-security-policy"], /default-src 'self'/);
  assert.match(headers["content-security-policy"], /connect-src 'self' https:\/\/bitjita\.com https:\/\/discord\.com/);
  assert.match(headers["content-security-policy"], /frame-ancestors 'self'/);
});

test("mimeType and staticCacheControl keep frontend asset responses predictable", () => {
  assert.equal(mimeType("index.html"), "text/html; charset=utf-8");
  assert.equal(mimeType("assets/index.js"), "text/javascript; charset=utf-8");
  assert.equal(mimeType("assets/index.css"), "text/css; charset=utf-8");
  assert.equal(mimeType("branding/logo.webp"), "image/webp");
  assert.equal(mimeType("download.unknown"), "application/octet-stream");
  assert.equal(staticCacheControl("index.html"), "no-cache");
  assert.equal(staticCacheControl("assets/index.js"), "public, max-age=31536000, immutable");
});

import { adminPermissionFor } from "../src/server/adminPermissions.mjs";

test("admin popup routes use settings permissions", () => {
  assert.equal(adminPermissionFor("GET", "/api/local/admin/popups"), "settings.view");
  assert.equal(adminPermissionFor("PUT", "/api/local/admin/popups"), "settings.manage");
});
