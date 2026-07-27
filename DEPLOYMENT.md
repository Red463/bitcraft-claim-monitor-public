# Production deployment

Canonical URL: `https://claim-monitor.com`
Platform: Ubuntu 24.04 LTS, Node.js 24, pnpm, systemd, Caddy, SQLite.

## Provisioning

Create the isolated service identity and directories:

```bash
sudo useradd --system --home /opt/bitcraft-claim-monitor-public --shell /usr/sbin/nologin claimmonitor
sudo install -d -o claimmonitor -g claimmonitor /opt/bitcraft-claim-monitor-public/{source,releases}
sudo install -d -o claimmonitor -g claimmonitor -m 0700 /var/lib/bitcraft-claim-monitor-public
sudo install -d -o claimmonitor -g claimmonitor -m 0700 /var/backups/bitcraft-claim-monitor-public
```

Clone `Red463/bitcraft-claim-monitor-public` into `/opt/bitcraft-claim-monitor-public/source`. Install Node.js 24, Corepack, pnpm, SQLite, Caddy, and Git.

Create `/etc/bitcraft-claim-monitor-public.env` from `.env.example`, root-owned and mode `0600`. Create the independent administrator Discord OAuth app and use:

```text
https://claim-monitor.com/api/local/admin/auth/discord/callback
```

No Timbersteel secrets, database, OAuth app, bot app, paths, or credentials may be reused.

## DNS and firewall

- Point the apex `A` record at the VPS IPv4 address.
- Add `AAAA` only after VPS IPv6 is working end to end.
- `www.claim-monitor.com` redirects permanently to the apex.
- Allow SSH, TCP 80, and TCP 443 in UFW.
- Do not expose port 18430; Node binds to `127.0.0.1`.

Install `deploy/Caddyfile.example` as `/etc/caddy/Caddyfile`. Caddy manages HTTPS issuance and renewal.

## Units

Install:

```text
deploy/bitcraft-claim-monitor-public.service
deploy/bitcraft-claim-monitor-public-worker.service
deploy/bitcraft-claim-monitor-public-collector.service
deploy/bitcraft-claim-monitor-public-collector.timer
deploy/bitcraft-claim-monitor-public-backup.service
deploy/bitcraft-claim-monitor-public-backup.timer
```

Validate before enabling:

```bash
sudo systemd-analyze verify /etc/systemd/system/bitcraft-claim-monitor-public*.service /etc/systemd/system/bitcraft-claim-monitor-public*.timer
sudo caddy validate --config /etc/caddy/Caddyfile
```

Daily backups run at 03:30 Europe/London and retain seven daily, three migration, and three manual backups.

## GitHub production environment

Create a protected `production` Environment with required deployment approval and these secrets:

- `VPS_HOST`
- `VPS_DEPLOY_USER`
- `VPS_SSH_PRIVATE_KEY`
- `VPS_KNOWN_HOSTS`

Protect `main` with pull-request review and required verification checks. The workflow is `workflow_dispatch` only; merging never deploys automatically.

The deploy user needs narrowly scoped passwordless sudo permission for:

```text
/usr/local/bin/update-bitcraft-claim-monitor-public
```

## Release process

The updater:

1. Fetches and verifies the selected 40-character commit from `origin/main`.
2. Creates an immutable detached worktree under `releases/<sha>`.
3. Installs locked dependencies and builds.
4. Validates systemd and Caddy configuration.
5. Creates a migration or requested manual database backup.
6. Atomically switches `current`.
7. Restarts web and worker processes and checks local and public health.
8. Restores the previous code symlink if startup or health checks fail.

SQLite is never automatically rolled back after the application may have accepted writes.

## Launch verification

Before launch, record evidence for:

- A successful deployment from `main`.
- A deliberately forced startup/health failure that restores the prior code release.
- `https://claim-monitor.com/api/local/health`.
- Apex HTTPS and permanent `www` redirect.
- Administrator OAuth login/logout with the dedicated app.
- Manual, daily, and migration backup creation plus a test restore.
- First-visit settlement choice, share URLs, safe switching, directory fallback, multi-claim collection, shared-plan editor/viewer/conflict/reporting flows, and local Market watches.
