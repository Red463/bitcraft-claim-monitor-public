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

function createProductionDatabase(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  applyDatabaseConnectionPragmas(db);
  applySchemaBootstrap(db);
  applySettlementStateMigration(db);
  applyLegacySchemaCleanup(db);
  applyAdditiveColumnMigrations(db);
  applySchemaIndexStatements(db);
  return { db, statements: createPreparedStatements(db) };
}

test("administrator OAuth persists a real session without personal data in login logs", (t) => {
  assert.equal(typeof discordOAuthFlow.persistDiscordAdminOAuthSession, "function");
  const { db, statements } = createProductionDatabase(t);
  statements.insertDiscordAdmin.run(
    "Existing Admin",
    "owner",
    "2026-07-28T12:00:00.000Z",
    "123456789012345678",
    "",
    "",
    "",
  );
  statements.insertDiscordAdmin.run(
    "Secret Display Name",
    "operator",
    "2026-07-28T12:00:00.000Z",
    "987654321098765432",
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
  const savedAdmin = db.prepare("SELECT id, username, discord_username, discord_global_name FROM admin_users WHERE discord_id = ?")
    .get("123456789012345678");
  assert.equal(savedSession.user_id, savedAdmin.id);
  assert.equal(savedAdmin.username, "Existing Admin");
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

test("administrator OAuth creates the session when profile and login diagnostics cannot be saved", (t) => {
  const { db, statements } = createProductionDatabase(t);
  statements.insertDiscordAdmin.run(
    "Existing Admin",
    "owner",
    "2026-07-28T12:00:00.000Z",
    "123456789012345678",
    "",
    "",
    "",
  );
  db.exec(`
    CREATE TRIGGER reject_admin_profile_update
    BEFORE UPDATE ON admin_users
    BEGIN
      SELECT RAISE(ABORT, 'profile write rejected');
    END;
    CREATE TRIGGER reject_admin_login_event
    BEFORE INSERT ON admin_login_events
    BEGIN
      SELECT RAISE(ABORT, 'login event write rejected');
    END;
  `);
  const diagnostics = [];

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
    onDiagnostic: (event) => diagnostics.push(event),
  });

  assert.ok(session?.token);
  assert.deepEqual(db.prepare("SELECT user_id FROM admin_sessions").all().map((row) => ({ ...row })), [{
    user_id: session.adminId,
  }]);
  assert.deepEqual(diagnostics, [
    { stage: "session", event: "failure", reason: "profile-write" },
    { stage: "session", event: "failure", reason: "login-event-write" },
  ]);
});
