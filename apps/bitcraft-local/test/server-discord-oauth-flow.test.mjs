import assert from "node:assert/strict";
import test from "node:test";

import * as discordOAuthFlow from "../src/server/discordOAuthFlow.mjs";
import {
  buildDiscordAuthorizeUrl,
  discordOAuthCallbackDecision,
  discordOAuthProfileAccount,
  discordOAuthProfileRequest,
  discordOAuthSuccessRedirect,
  discordOAuthTokenBody,
  discordOAuthTokenRequest,
} from "../src/server/discordOAuthFlow.mjs";

const enabledConfig = {
  enabled: true,
  clientId: "client-123",
  clientSecret: "secret-abc",
  redirectUri: "https://example.test/api/local/auth/discord/callback",
};

test("buildDiscordAuthorizeUrl preserves the existing Discord authorize parameters", () => {
  const authorize = new URL(buildDiscordAuthorizeUrl({
    config: enabledConfig,
    state: "state-token",
  }));

  assert.equal(authorize.origin + authorize.pathname, "https://discord.com/oauth2/authorize");
  assert.equal(authorize.searchParams.get("client_id"), "client-123");
  assert.equal(authorize.searchParams.get("response_type"), "code");
  assert.equal(authorize.searchParams.get("redirect_uri"), enabledConfig.redirectUri);
  assert.equal(authorize.searchParams.get("scope"), "identify");
  assert.equal(authorize.searchParams.get("state"), "state-token");
});

test("discordOAuthCallbackDecision redirects denied and invalid callbacks to safe return paths", () => {
  assert.deepEqual(discordOAuthCallbackDecision({
    config: enabledConfig,
    stateCookie: { state: "stored-state", returnTo: "/?page=admin" },
    state: "stored-state",
    code: "code",
    error: "access_denied",
  }), { ok: false, location: "/?page=admin&auth=discord-denied" });

  assert.deepEqual(discordOAuthCallbackDecision({
    config: enabledConfig,
    stateCookie: { state: "stored-state", returnTo: "https://evil.test/" },
    state: "wrong-state",
    code: "code",
    error: "",
  }), { ok: false, location: "/?page=dashboard&auth=discord-error" });
});

test("discordOAuthCallbackDecision accepts matching state and usable codes", () => {
  assert.deepEqual(discordOAuthCallbackDecision({
    config: enabledConfig,
    stateCookie: { state: "stored-state", returnTo: "/?page=market" },
    state: "stored-state",
    code: "code-123",
    error: "",
  }), { ok: true, code: "code-123", returnTo: "/?page=market" });
});

test("discordOAuthTokenBody preserves the existing token exchange form fields", () => {
  const body = discordOAuthTokenBody({ config: enabledConfig, code: "code-123" });

  assert.equal(body.get("client_id"), "client-123");
  assert.equal(body.get("client_secret"), "secret-abc");
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "code-123");
  assert.equal(body.get("redirect_uri"), enabledConfig.redirectUri);
});
test("discordOAuthProfileAccount preserves profile id validation and database field mapping", () => {
  assert.deepEqual(discordOAuthProfileAccount({
    id: " 1234567890 ",
    username: "user-name",
    global_name: "Global Name",
    avatar: "avatar-hash",
  }, "2026-06-29T12:00:00.000Z"), {
    discordId: "1234567890",
    username: "user-name",
    globalName: "Global Name",
    avatar: "avatar-hash",
    createdAt: "2026-06-29T12:00:00.000Z",
    lastLoginAt: "2026-06-29T12:00:00.000Z",
  });

  assert.deepEqual(discordOAuthProfileAccount({ id: 42 }, "2026-06-29T12:00:00.000Z"), {
    discordId: "42",
    username: "",
    globalName: "",
    avatar: "",
    createdAt: "2026-06-29T12:00:00.000Z",
    lastLoginAt: "2026-06-29T12:00:00.000Z",
  });

  assert.throws(
    () => discordOAuthProfileAccount({ id: "not-a-number" }, "2026-06-29T12:00:00.000Z"),
    /Discord profile did not include a usable id/,
  );
});
test("discordOAuthTokenRequest preserves the existing Discord token fetch shape", () => {
  const request = discordOAuthTokenRequest({ config: enabledConfig, code: "code-123" });

  assert.equal(request.url, "https://discord.com/api/v10/oauth2/token");
  assert.equal(request.init.method, "POST");
  assert.deepEqual(request.init.headers, { "content-type": "application/x-www-form-urlencoded" });
  assert.equal(request.init.body.get("client_id"), "client-123");
  assert.equal(request.init.body.get("client_secret"), "secret-abc");
  assert.equal(request.init.body.get("grant_type"), "authorization_code");
  assert.equal(request.init.body.get("code"), "code-123");
  assert.equal(request.init.body.get("redirect_uri"), enabledConfig.redirectUri);
});

test("discordOAuthProfileRequest preserves the existing Discord profile fetch shape", () => {
  assert.deepEqual(discordOAuthProfileRequest("access-token"), {
    url: "https://discord.com/api/v10/users/@me",
    init: { headers: { authorization: "Bearer access-token" } },
  });
});
test("discordOAuthSuccessRedirect preserves the existing callback success header shape", () => {
  assert.deepEqual(discordOAuthSuccessRedirect({
    returnTo: "/?page=market",
    clearStateCookie: "clear-state",
    userSessionCookie: "user-session",
    adminSessionCookie: "admin-session",
  }), {
    location: "/?page=market",
    setCookie: ["clear-state", "user-session", "admin-session"],
  });

  assert.deepEqual(discordOAuthSuccessRedirect({
    returnTo: "/?page=dashboard",
    clearStateCookie: "clear-state",
    userSessionCookie: "user-session",
  }), {
    location: "/?page=dashboard",
    setCookie: ["clear-state", "user-session"],
  });
});

test("Discord OAuth requests are bounded, one-shot, and emit allowlisted diagnostics", async () => {
  assert.equal(typeof discordOAuthFlow.discordOAuthJsonRequest, "function");
  assert.equal(discordOAuthFlow.DISCORD_OAUTH_REQUEST_TIMEOUT_MS, 10_000);

  const diagnostics = [];
  const times = [100, 142];
  const result = await discordOAuthFlow.discordOAuthJsonRequest({
    stage: "token",
    request: {
      url: "https://discord.test/oauth2/token?code=secret-code",
      init: {
        method: "POST",
        body: new URLSearchParams({ code: "secret-code", client_secret: "secret-value" }),
      },
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "secret-access-token" }),
    }),
    now: () => times.shift(),
    onDiagnostic: (event) => diagnostics.push(event),
  });

  assert.deepEqual(result, { access_token: "secret-access-token" });
  assert.deepEqual(diagnostics, [
    { stage: "token", event: "start" },
    { stage: "token", event: "success", status: 200, durationMs: 42 },
  ]);
  assert.doesNotMatch(
    JSON.stringify(diagnostics),
    /secret-code|secret-value|secret-access-token|discord\.test/,
  );

  let attempts = 0;
  await assert.rejects(
    discordOAuthFlow.discordOAuthJsonRequest({
      stage: "token",
      request: { url: "https://discord.test/oauth2/token", init: {} },
      fetchImpl: async () => {
        attempts += 1;
        throw new Error("secret-network-message");
      },
    }),
    (error) => error instanceof discordOAuthFlow.DiscordOAuthRequestError
      && error.stage === "token"
      && error.reason === "network",
  );
  assert.equal(attempts, 1);
});

test("Discord OAuth requests abort stalled token and profile responses", async () => {
  assert.equal(typeof discordOAuthFlow.discordOAuthJsonRequest, "function");

  for (const stage of ["token", "profile"]) {
    const diagnostics = [];
    await assert.rejects(
      discordOAuthFlow.discordOAuthJsonRequest({
        stage,
        request: { url: `https://discord.test/${stage}`, init: {} },
        timeoutMs: 5,
        fetchImpl: (_url, init) => new Promise((resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
        }),
        onDiagnostic: (event) => diagnostics.push(event),
      }),
      (error) => error instanceof discordOAuthFlow.DiscordOAuthRequestError
        && error.stage === stage
        && error.reason === "timeout",
    );
    assert.equal(diagnostics.at(-1).event, "failure");
    assert.equal(diagnostics.at(-1).reason, "timeout");
  }
});

test("Discord OAuth diagnostic formatting ignores unapproved and sensitive fields", () => {
  assert.equal(typeof discordOAuthFlow.discordOAuthDiagnosticLine, "function");
  assert.equal(discordOAuthFlow.discordOAuthDiagnosticLine({
    stage: "profile",
    event: "failure",
    status: 401,
    reason: "http",
    durationMs: 12.6,
    code: "secret-code",
    state: "secret-state",
    username: "secret-user",
  }), "[discord-oauth] stage=profile event=failure status=401 reason=http durationMs=13");
  assert.equal(discordOAuthFlow.discordOAuthDiagnosticLine({
    stage: "session",
    event: "failure",
    reason: "audit-write",
    message: "secret raw database error",
  }), "[discord-oauth] stage=session event=failure reason=audit-write");
});

function responseRecorder({ throwOnFirstWrite = false } = {}) {
  const writes = [];
  let ended = false;
  return {
    res: {
      writeHead(status, headers) {
        writes.push({ status, headers });
        if (throwOnFirstWrite && writes.length === 1) {
          throw new TypeError("secret-invalid-location");
        }
      },
      end() {
        ended = true;
      },
    },
    writes,
    ended: () => ended,
  };
}

test("Discord OAuth failure fallback still clears state and terminates the response", () => {
  assert.equal(typeof discordOAuthFlow.finishDiscordOAuthFailureResponse, "function");
  const response = responseRecorder({ throwOnFirstWrite: true });

  const result = discordOAuthFlow.finishDiscordOAuthFailureResponse({
    res: response.res,
    returnTo: "/?page=admin\r\nx-secret: secret-state",
    stage: "session",
    reason: "local",
    clearStateCookie: () => "oauth-state=; Max-Age=0",
  });

  assert.equal(result, true);
  assert.equal(response.ended(), true);
  assert.equal(response.writes.at(-1).status, 302);
  assert.equal(
    response.writes.at(-1).headers.location,
    discordOAuthFlow.DISCORD_OAUTH_FAILURE_FALLBACK_LOCATION,
  );
  assert.equal(response.writes.at(-1).headers["set-cookie"], "oauth-state=; Max-Age=0");
  assert.doesNotMatch(JSON.stringify(response.writes.at(-1)), /secret-state|secret-invalid-location/);
});

test("administrator OAuth callback failures redirect safely and clear OAuth state", async () => {
  assert.equal(typeof discordOAuthFlow.discordOAuthCallbackController, "function");
  assert.equal(typeof discordOAuthFlow.DiscordOAuthRequestError, "function");

  for (const failureStage of ["token", "profile", "session"]) {
    const response = responseRecorder();
    const diagnostics = [];
    const result = await discordOAuthFlow.discordOAuthCallbackController({
      res: response.res,
      config: enabledConfig,
      code: "secret-code",
      returnTo: "/?page=admin",
      clearStateCookie: () => "oauth-state=; Max-Age=0",
      requestJson: async ({ stage, onDiagnostic }) => {
        onDiagnostic({ stage, event: "start" });
        if (stage === failureStage) {
          onDiagnostic({ stage, event: "failure", reason: "network", durationMs: 3 });
          throw new discordOAuthFlow.DiscordOAuthRequestError(stage, "network");
        }
        onDiagnostic({ stage, event: "success", status: 200, durationMs: 2 });
        return stage === "token"
          ? { access_token: "secret-access-token" }
          : { id: "1234567890", username: "secret-profile" };
      },
      persistSession: async () => {
        if (failureStage === "session") throw new Error("secret-session-exception");
        throw new Error("unexpected persistence");
      },
      onDiagnostic: (event) => diagnostics.push(event),
    });

    assert.equal(result, true);
    assert.equal(response.ended(), true);
    assert.equal(response.writes.at(-1).status, 302);
    assert.equal(
      response.writes.at(-1).headers.location,
      `/?page=admin&auth=discord-error&reason=discord-${failureStage}-${failureStage === "session" ? "local" : "network"}`,
    );
    assert.equal(response.writes.at(-1).headers["set-cookie"], "oauth-state=; Max-Age=0");
    assert.doesNotMatch(
      JSON.stringify({ diagnostics, finalWrite: response.writes.at(-1) }),
      /secret-code|secret-access-token|secret-profile|secret-session-exception/,
    );
  }
});

test("administrator OAuth callback proceeds from profile lookup to session persistence", async () => {
  assert.equal(typeof discordOAuthFlow.discordOAuthCallbackController, "function");

  const response = responseRecorder();
  const diagnostics = [];
  let persistedProfile = null;
  const result = await discordOAuthFlow.discordOAuthCallbackController({
    res: response.res,
    config: enabledConfig,
    code: "code-123",
    returnTo: "/?page=admin",
    clearStateCookie: () => "oauth-state=; Max-Age=0",
    requestJson: async ({ stage, onDiagnostic }) => {
      onDiagnostic({ stage, event: "start" });
      onDiagnostic({ stage, event: "success", status: 200, durationMs: 2 });
      return stage === "token"
        ? { access_token: "access-token" }
        : { id: "1234567890", username: "Admin" };
    },
    persistSession: async (profile) => {
      persistedProfile = profile;
      response.res.writeHead(302, {
        location: "/?page=admin",
        "set-cookie": ["oauth-state=; Max-Age=0", "admin-session=token"],
      });
      response.res.end();
      return { successful: true, value: true };
    },
    onDiagnostic: (event) => diagnostics.push(event),
  });

  assert.equal(result, true);
  assert.deepEqual(persistedProfile, { id: "1234567890", username: "Admin" });
  assert.equal(response.writes.at(-1).headers.location, "/?page=admin");
  assert.deepEqual(response.writes.at(-1).headers["set-cookie"], [
    "oauth-state=; Max-Age=0",
    "admin-session=token",
  ]);
  assert.deepEqual(diagnostics.at(-1), { stage: "session", event: "success" });
});
