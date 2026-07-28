import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { applyDatabaseConnectionPragmas } from "../src/server/databasePragmas.mjs";
import * as discordOAuthFlow from "../src/server/discordOAuthFlow.mjs";
import { createPreparedStatements } from "../src/server/preparedStatements.mjs";
import { applySchemaBootstrap } from "../src/server/schemaBootstrap.mjs";
import {
  applyAdditiveColumnMigrations,
  applyLegacySchemaCleanup,
  applySchemaIndexStatements,
  applySettlementStateMigration,
} from "../src/server/schemaMigrations.mjs";

test("administrator OAuth persists a real session without personal data in login logs", (t) => {
  assert.equal(typeof discordOAuthFlow.persistDiscordAdminOAuthSession, "function");
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());

  applyDatabaseConnectionPragmas(db);
  applySchemaBootstrap(db);
  applySettlementStateMigration(db);
  applyLegacySchemaCleanup(db);
  applyAdditiveColumnMigrations(db);
  applySchemaIndexStatements(db);
  const statements = createPreparedStatements(db);
  statements.insertDiscordAdmin.run(
    "Existing Admin",
    "owner",
    "2026-07-28T12:00:00.000Z",
    "123456789012345678",
    "",
    "",
    "",
  );

  const session = discordOAuthFlow.persistDiscordAdminOAuthSession({
    statements,
    profile: {
      id: "123456789012345678",
      username: "secret-username",
      global_name: "Secret Display Name",
      avatar: "secret-avatar",
    },
    loginAt: "2026-07-28T12:00:01.000Z",
    secure: false,
  });

  assert.ok(session?.token);
  assert.match(session.cookie, /^bitcraft_admin_session=/);
  const savedSession = db.prepare("SELECT user_id FROM admin_sessions").get();
  const savedAdmin = db.prepare("SELECT id, discord_username, discord_global_name FROM admin_users").get();
  assert.equal(savedSession.user_id, savedAdmin.id);
  assert.equal(savedAdmin.discord_username, "secret-username");
  assert.equal(savedAdmin.discord_global_name, "Secret Display Name");

  const loginEvents = db.prepare("SELECT username, successful, remote_address FROM admin_login_events").all();
  assert.deepEqual(loginEvents.map((row) => ({ ...row })), [{
    username: "Discord administrator",
    successful: 1,
    remote_address: "discord-oauth",
  }]);
  assert.doesNotMatch(
    JSON.stringify(loginEvents),
    /123456789012345678|secret-username|Secret Display Name|secret-avatar/,
  );
});
