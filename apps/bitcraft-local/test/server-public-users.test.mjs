import assert from "node:assert/strict";
import test from "node:test";

import { discordAvatarUrl, publicAdminUser } from "../src/server/publicUsers.mjs";

test("discordAvatarUrl builds Discord CDN URLs only when id and avatar are present", () => {
  assert.equal(discordAvatarUrl({ discord_id: "123456789012345", discord_avatar: "abc" }), "https://cdn.discordapp.com/avatars/123456789012345/abc.png?size=128");
  assert.equal(discordAvatarUrl({ discord_id: "123456789012345", discord_avatar: " " }), null);
  assert.equal(discordAvatarUrl({ discord_id: "", discord_avatar: "abc" }), null);
  assert.equal(discordAvatarUrl(null), null);
});

test("publicAdminUser exposes safe admin identity, role labels, and permissions", () => {
  assert.equal(publicAdminUser(null), null);
  assert.deepEqual(publicAdminUser({
    id: 7,
    username: "admin-user",
    discord_id: 123456789012345,
    discord_username: "AdminDiscord",
    discord_global_name: "Admin Global",
    discord_avatar: "avatar-hash",
    role: "viewer",
  }), {
    id: 7,
    username: "admin-user",
    discordId: "123456789012345",
    discordUsername: "AdminDiscord",
    discordGlobalName: "Admin Global",
    avatarUrl: "https://cdn.discordapp.com/avatars/123456789012345/avatar-hash.png?size=128",
    role: "viewer",
    roleLabel: "Viewer",
    permissions: ["status.view", "server.monitor.view", "settings.view", "data.view", "analytics.view", "audit.view"],
  });
});
