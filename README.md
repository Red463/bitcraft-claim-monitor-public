# BitCraft Settlement Monitor

An independent, anonymous public monitor for any BitCraft settlement.

Production: [claim-monitor.com](https://claim-monitor.com)
Source: [Red463/bitcraft-claim-monitor-public](https://github.com/Red463/bitcraft-claim-monitor-public)

## What it does

Visitors choose a settlement on first use, then can switch at any time. The selected claim is stored in the browser and is included in shareable URLs. The application provides:

- Dashboard, leaderboard, members, professions, Craft Monitor, inventory, construction, research, Local Market, Market, region, map, activity, and Public Craft Finder.
- A server-cached directory of BitJita settlements and regions.
- History collection for recently active settlements, with coverage and stale/gap indicators.
- Settlement-scoped shared Craft Plans with public viewer links and private edit keys.
- Browser-local display preferences, filters, notifications, and per-settlement Market watches.
- A protected administrator console for operations, retention, plan moderation, backups, analytics, and administrator access.

Browsing does not require an account. Discord OAuth is used only for approved administrators.

## Removed from the original application

This public edition does not ship the Discord bot, ordinary Discord accounts, linked characters, public access controls, settings sync, server deal-alert delivery, Craft Calculator, BitCraft Sync, global member exclusions, empire membership tracking, Empire Hexite reserves, or Empires Watchtowers.

## Development

Requirements:

- Node.js 24
- Corepack
- pnpm 11.1.3 (pinned in `package.json`)

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm run dev
```

The production-shaped checks are:

```bash
corepack pnpm --filter @workspace/bitcraft-local test
corepack pnpm run build
node --test scripts/test/deploy-*.test.mjs
```

The app server binds to `127.0.0.1:18430` in production. Caddy is the only public listener.

## Public APIs

- `GET /api/local/claims/search?q=&regionId=&limit=`
- `GET /api/local/claims/:claimId`
- `POST /api/local/claims/:claimId/interest`
- `GET /api/local/claims/:claimId/coverage`
- `GET /api/local/craft-plans?claimId=`
- `POST /api/local/craft-plans`
- `GET /api/local/craft-plans/:planId`
- `PUT /api/local/craft-plans/:planId`
- `POST /api/local/craft-plans/:planId/rotate-key`
- `POST /api/local/craft-plans/:planId/archive`
- `POST /api/local/craft-plans/:planId/report`

Plan mutation uses `X-Plan-Edit-Key`. Updates also require an expected revision through `If-Match`. A creator receives the edit key once and can keep it in a recovery URL fragment (`#plan-edit=...`), which browsers do not send to the server.

## Administrator access

The first owner is seeded from:

```text
DEFAULT_OWNER_DISCORD_ID=145544610234630144
```

Use a dedicated Discord OAuth application with this callback:

```text
https://claim-monitor.com/api/local/admin/auth/discord/callback
```

Required environment variables are documented in [.env.example](.env.example). No Discord bot token or guild installation is needed.

Roles:

- `owner`: unrestricted, including administrator management and confirmed hard deletion.
- `admin`: operations, settings, plan moderation, and exports.
- `viewer`: read-only operational access.

## Production deployment

The Ubuntu 24.04 layout is deliberately isolated from every Timbersteel installation:

```text
/opt/bitcraft-claim-monitor-public/source
/opt/bitcraft-claim-monitor-public/releases/<commit-sha>
/opt/bitcraft-claim-monitor-public/current
/var/lib/bitcraft-claim-monitor-public
/var/backups/bitcraft-claim-monitor-public
/etc/bitcraft-claim-monitor-public.env
```

Systemd units:

- `bitcraft-claim-monitor-public.service`
- `bitcraft-claim-monitor-public-worker.service`
- `bitcraft-claim-monitor-public-collector.timer`
- `bitcraft-claim-monitor-public-backup.timer`

Deployments are manual GitHub Actions dispatches from `main` through the protected `production` Environment. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Upstream policy

This repository is independent. The maintained original may be configured locally as a read-only `upstream` remote:

```bash
git remote add upstream https://github.com/Red463/bitcraft-claim-monitor.git
git remote set-url --push upstream DISABLED
```

Upstream changes are reviewed and cherry-picked selectively. They are never merged or deployed automatically.

## Data and privacy

BitCraft data is retrieved through the BitJita API. Browser-local preferences can be cleared using browser storage controls. Server request/visitor analytics and history retention are operator-configurable.

Operator: Thomas Bush. The existing privacy contact remains the default until a `claim-monitor.com` mailbox is provisioned.

## Licence and attribution

This public conversion preserves the source licence and attribution. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [TRADEMARKS.md](TRADEMARKS.md).

BitCraft is the property of its respective owners. This is an unofficial fan-made project and is not endorsed by Clockwork Labs. BitJita data remains subject to BitJita’s terms and availability.
