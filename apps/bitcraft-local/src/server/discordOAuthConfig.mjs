export const ADMIN_DISCORD_OAUTH_CALLBACK_PATH = "/api/local/admin/auth/discord/callback";

export function resolveDiscordOAuthConfig({
  env = process.env,
  origin = "",
} = {}) {
  const clientId = String(env.ADMIN_DISCORD_OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = String(env.ADMIN_DISCORD_OAUTH_CLIENT_SECRET ?? "").trim();
  const redirectUri = String(env.ADMIN_DISCORD_OAUTH_REDIRECT_URI ?? "").trim()
    || `${origin}${ADMIN_DISCORD_OAUTH_CALLBACK_PATH}`;
  return { clientId, clientSecret, redirectUri, enabled: Boolean(clientId && clientSecret) };
}
