export function resolveDiscordOAuthConfig({
  env = process.env,
  origin = "",
} = {}) {
  const clientId = String(env.ADMIN_DISCORD_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.ADMIN_DISCORD_OAUTH_CLIENT_SECRET ?? "").trim();
  const redirectUri = String(env.ADMIN_DISCORD_OAUTH_REDIRECT_URI ?? "").trim()
    || `${origin}/api/local/admin/auth/discord/callback`;
  return { clientId, clientSecret, redirectUri, enabled: Boolean(clientId && clientSecret) };
}
