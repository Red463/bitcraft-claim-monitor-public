import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForHealth(origin, child, output) {
  const deadline = Date.now() + 30_000;
  let lastResponse = "";
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Public server exited with code ${child.exitCode}: ${output()}`);
    try {
      const response = await fetch(`${origin}/api/local/health`);
      if (response.ok) return response.json();
      lastResponse = `${response.status} ${await response.text()}`;
      if (response.status >= 500) throw new Error(`Public server health failed: ${lastResponse}`);
    } catch {
      // Startup is still in progress.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for public server health (${lastResponse}): ${output()}`);
}

async function stop(child) {
  if (child.exitCode != null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]);
  if (child.exitCode == null) child.kill("SIGKILL");
}

test("public runtime boots with anonymous claim APIs and no removed routes", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "claim-monitor-public-runtime-"));
  const port = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: appDir,
    env: {
      ...process.env,
      NODE_ENV: "test",
      APP_PORT: String(port),
      BITCRAFT_LOCAL_DATA_DIR: dataDir,
      SERVER_POLLING_ENABLED: "false",
      DEFAULT_OWNER_DISCORD_ID: "145544610234630144",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let childOutput = "";
  child.stdout.on("data", (chunk) => { childOutput += chunk; });
  child.stderr.on("data", (chunk) => { childOutput += chunk; });
  t.after(async () => {
    await stop(child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const health = await waitForHealth(origin, child, () => childOutput);
  assert.equal(health.ok, true);

  const config = await fetch(`${origin}/api/local/config`).then((response) => response.json());
  assert.equal(config.productName, "BitCraft Claim Monitor");
  assert.equal(config.canonicalUrl, "https://claim-monitor.com");
  assert.equal(config.claimId, null);

  const database = new DatabaseSync(path.join(dataDir, "bitcraft-local.sqlite"));
  database.exec("PRAGMA busy_timeout = 5000");
  database.prepare(`
    INSERT INTO claim_directory (
      claim_id, name, name_search, region_id, region_name, tier, owner_name,
      refreshed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "1369094286777412590",
    "Public Test Settlement",
    "public test settlement",
    "19",
    "Zephra",
    4,
    "Public Owner",
    new Date().toISOString(),
  );
  database.close();

  const search = await fetch(`${origin}/api/local/claims/search?q=Public`).then((response) => response.json());
  assert.equal(search.claims[0].claimId, "1369094286777412590");
  assert.equal(search.claims[0].regionName, "Zephra");

  const detail = await fetch(`${origin}/api/local/claims/1369094286777412590`).then((response) => response.json());
  assert.equal(detail.name, "Public Test Settlement");

  const interest = await fetch(`${origin}/api/local/claims/1369094286777412590/interest`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(interest.status, 202);
  const coverage = await fetch(`${origin}/api/local/claims/1369094286777412590/coverage`).then((response) => response.json());
  assert.equal(coverage.claimId, "1369094286777412590");

  const claimRequiredRoutes = [
    "/api/local/craft-plans",
    "/api/local/craft-plan",
    "/api/local/craft-plan/detail?keys=items:1",
    "/api/local/market/history",
    "/api/local/leaderboard",
    "/api/local/history",
    "/api/local/activity",
    "/api/local/notification-activity",
  ];
  for (const route of claimRequiredRoutes) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 400, `${route} should require an explicit valid claimId`);
  }

  const adminStatusResponse = await fetch(`${origin}/api/local/admin/me`);
  const adminStatus = await adminStatusResponse.json();
  assert.equal(adminStatusResponse.status, 200, JSON.stringify(adminStatus));
  assert.match(adminStatus.discordLoginUrl, /\/api\/local\/admin\/auth\/discord\/start/);

  const removedRequests = [
    ["GET", "/api/local/auth/me"],
    ["POST", "/api/local/admin/login"],
    ["POST", "/api/local/admin/setup"],
    ["GET", "/api/local/admin/discord/status"],
    ["GET", "/api/local/admin/user-accounts"],
    ["GET", "/api/local/admin/access-control"],
    ["GET", "/api/local/admin/empire-membership"],
    ["GET", "/api/local/empires/watchtowers?regionId=19"],
    ["GET", "/api/local/market/deal-watches"],
    ["POST", "/api/discord/interactions"],
  ];
  for (const [method, route] of removedRequests) {
    const response = await fetch(`${origin}${route}`, {
      method,
      headers: { origin, "content-type": "application/json" },
      body: method === "GET" ? undefined : "{}",
    });
    assert.equal(response.status, 404, `${method} ${route} should not exist`);
  }
});
