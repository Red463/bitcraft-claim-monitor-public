import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_DISCORD_OAUTH_CALLBACK_PATH, resolveDiscordOAuthConfig } from "../src/server/discordOAuthConfig.mjs";

test("administrator OAuth reads only its dedicated environment variables", () => {
  assert.deepEqual(resolveDiscordOAuthConfig({
    env: {
      ADMIN_DISCORD_OAUTH_CLIENT_ID: " admin-client ",
      ADMIN_DISCORD_OAUTH_CLIENT_SECRET: " admin-secret ",
      ADMIN_DISCORD_OAUTH_REDIRECT_URI: " https://claim-monitor.com/admin-callback ",
      DISCORD_OAUTH_CLIENT_ID: "public-client-must-be-ignored",
      DISCORD_BOT_TOKEN: "bot-must-be-ignored",
    },
    origin: "https://fallback.example",
  }), {
    clientId: "admin-client",
    clientSecret: "admin-secret",
    redirectUri: "https://claim-monitor.com/admin-callback",
    enabled: true,
  });
});

test("administrator OAuth defaults to the isolated admin callback", () => {
  assert.deepEqual(resolveDiscordOAuthConfig({
    env: {
      ADMIN_DISCORD_OAUTH_CLIENT_ID: "admin-client",
      ADMIN_DISCORD_OAUTH_CLIENT_SECRET: "admin-secret",
    },
    origin: "https://claim-monitor.com",
  }), {
    clientId: "admin-client",
    clientSecret: "admin-secret",
    redirectUri: "https://claim-monitor.com/api/local/admin/auth/discord/callback",
    enabled: true,
  });
  assert.equal(ADMIN_DISCORD_OAUTH_CALLBACK_PATH, "/api/local/admin/auth/discord/callback");
});

test("administrator OAuth is disabled when either dedicated credential is absent", () => {
  assert.equal(resolveDiscordOAuthConfig({ env: { ADMIN_DISCORD_OAUTH_CLIENT_ID: "client" } }).enabled, false);
  assert.equal(resolveDiscordOAuthConfig({ env: { ADMIN_DISCORD_OAUTH_CLIENT_SECRET: "secret" } }).enabled, false);
});
