import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const updater = read("deploy/update-bitcraft-claim-monitor-public");
const backup = read("deploy/backup-bitcraft-claim-monitor-public");
const web = read("deploy/bitcraft-claim-monitor-public.service");
const worker = read("deploy/bitcraft-claim-monitor-public-worker.service");
const collector = read("deploy/bitcraft-claim-monitor-public-collector.service");
const caddy = read("deploy/Caddyfile.example");
const workflow = read(".github/workflows/deploy-production.yml");
const environment = read(".env.example");

test("all runtime paths and units are isolated under the public application name", () => {
  for (const content of [updater, backup, web, worker, collector]) {
    assert.match(content, /bitcraft-claim-monitor-public/);
    assert.doesNotMatch(content, /\/opt\/bitcraft-claim-monitor(?!-public)/);
    assert.doesNotMatch(content, /\/var\/lib\/bitcraft-claim-monitor(?!-public)/);
    assert.doesNotMatch(content, /app\.timbersteeltrade\.com|claim\.timbersteeltrade\.com/);
  }
  assert.match(web, /User=claimmonitor/);
  assert.match(worker, /User=claimmonitor/);
  assert.match(web, /APP_HOST=127\.0\.0\.1/);
  assert.match(web, /APP_PORT=18430/);
});

test("Caddy owns the canonical HTTPS host, redirects www, and returns maintenance responses", () => {
  assert.match(caddy, /^claim-monitor\.com \{/m);
  assert.match(caddy, /^www\.claim-monitor\.com \{/m);
  assert.match(caddy, /redir https:\/\/claim-monitor\.com\{uri\} permanent/);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:18430/);
  assert.match(caddy, /lb_try_duration 5s/);
  assert.match(caddy, /handle_errors/);
  assert.match(caddy, /503/);
  assert.match(caddy, /Strict-Transport-Security/);
});

test("the updater builds immutable releases and rolls code back after failed health", () => {
  assert.match(updater, /SOURCE_DIR="\$\{SOURCE_DIR:-\$APP_ROOT\/source\}"/);
  assert.match(updater, /RELEASES_DIR="\$\{RELEASES_DIR:-\$APP_ROOT\/releases\}"/);
  assert.match(updater, /CURRENT_LINK="\$\{CURRENT_LINK:-\$APP_ROOT\/current\}"/);
  assert.match(updater, /worktree add --detach/);
  assert.match(updater, /atomic_switch/);
  assert.match(updater, /rollback_release/);
  assert.match(updater, /wait_for_health/);
  assert.doesNotMatch(updater, /sqlite3[^\n]+restore|restore[^\n]+sqlite3/i);
  assert.match(updater, /PUBLIC_URL="\$\{PUBLIC_URL:-https:\/\/claim-monitor\.com\}"/);
});

test("backups use separate locks and the required retention defaults", () => {
  assert.match(backup, /DAILY_KEEP="\$\{DAILY_KEEP:-7\}"/);
  assert.match(backup, /MIGRATION_KEEP="\$\{MIGRATION_KEEP:-3\}"/);
  assert.match(backup, /MANUAL_KEEP="\$\{MANUAL_KEEP:-3\}"/);
  assert.match(backup, /bitcraft-claim-monitor-public-backup\.lock/);
  assert.match(backup, /bitcraft-claim-monitor-public-deploy\.lock/);
  assert.match(backup, /PRAGMA quick_check/);
});

test("production deployment is manual, verified, and approval-gated", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s+push:/m);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /pnpm --filter @workspace\/bitcraft-local test/);
  assert.match(workflow, /pnpm --filter @workspace\/bitcraft-local run build/);
  assert.match(workflow, /systemd-analyze verify/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /VPS_HOST/);
  assert.match(workflow, /VPS_DEPLOY_USER/);
  assert.match(workflow, /VPS_SSH_PRIVATE_KEY/);
  assert.match(workflow, /VPS_KNOWN_HOSTS/);
  assert.match(workflow, /update-bitcraft-claim-monitor-public/);
});

test("administrator OAuth is dedicated to claim-monitor.com and needs no bot secret", () => {
  assert.match(environment, /ADMIN_DISCORD_OAUTH_CLIENT_ID/);
  assert.match(environment, /ADMIN_DISCORD_OAUTH_CLIENT_SECRET/);
  assert.match(environment, /https:\/\/claim-monitor\.com\/api\/local\/admin\/auth\/discord\/callback/);
  assert.doesNotMatch(environment, /DISCORD_BOT_TOKEN|DISCORD_GUILD_ID/);
});
