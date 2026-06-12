# Deploying BitCraft Claim Monitor to an Ubuntu VPS

This guide is for the Hostworld Ubuntu VPS configuration with no control panel. The deployed app uses:

- Node.js 24 to run the application and SQLite API
- Caddy to provide the public HTTPS website
- systemd to keep the app running after restarts
- SQLite data stored outside the Git checkout at `/var/lib/bitcraft-claim-monitor`

The app server serves the compiled frontend, shared local history API, and restricted BitJita API proxy. In production it records settlement, market, and activity snapshots for recently selected settlements, so visitors tracking the same settlement share the same SQLite records. Caddy only exposes it securely through your domain.

## Before You Begin

You need:

- An Ubuntu 22.04 VPS with its public IP address
- A domain or subdomain, for example `app.timbersteeltrade.com`, with an `A` DNS record pointing at that IP
- Your GitHub repository URL: `https://github.com/Red463/bitcraft-claim-monitor-public.git`

The server must run Node.js 24 or newer because the database uses Node's built-in SQLite support.

## 1. Connect and Secure the Server

Hostworld will provide the server IP address and the initial login details. Connect from Windows PowerShell:

```powershell
ssh root@YOUR_SERVER_IP
```

On the VPS, update packages and allow SSH and web traffic through the firewall:

```bash
apt update
apt upgrade -y
apt install -y git curl sqlite3 ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

## 2. Install Node.js 24 and pnpm

Install Node.js 24 using the NodeSource Ubuntu repository, then enable the package manager version recorded by this project:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
node --version
corepack enable
corepack prepare pnpm@11.1.3 --activate
```

The `node --version` output must begin with `v24.` or a later version.

References: <https://deb.nodesource.com/> and <https://nodejs.org/api/sqlite.html>

## 3. Install Caddy

Install the official Caddy Ubuntu package:

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
chmod o+r /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
caddy version
```

Source: <https://caddyserver.com/docs/install#debian-ubuntu-raspbian>

## 4. Install the Application

Create an unprivileged service account, clone the project, create the database directory, install dependencies, and build the frontend:

```bash
useradd --system --home /opt/bitcraft-claim-monitor --shell /usr/sbin/nologin bitcraft
git clone https://github.com/Red463/bitcraft-claim-monitor-public.git /opt/bitcraft-claim-monitor
chown -R bitcraft:bitcraft /opt/bitcraft-claim-monitor
install -d -o bitcraft -g bitcraft -m 700 /var/lib/bitcraft-claim-monitor
cd /opt/bitcraft-claim-monitor
sudo -u bitcraft corepack pnpm install --frozen-lockfile
sudo -u bitcraft corepack pnpm --filter @workspace/bitcraft-local run build
```

## 5. Start the Application Service

Install the checked-in systemd service:

```bash
cp /opt/bitcraft-claim-monitor/deploy/bitcraft-claim-monitor.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now bitcraft-claim-monitor
systemctl status bitcraft-claim-monitor
curl http://127.0.0.1:18430/api/local/health
```

The final command should return JSON containing `"ok":true` and polling status. `polling.lastSuccessAt` is populated after visitors select settlements and shared history refresh succeeds.

## 6. Publish the Website With HTTPS

The checked-in Caddy example uses `app.timbersteeltrade.com` as the canonical domain and redirects `claim.timbersteeltrade.com` and the previous `claim.hostred.co.uk` host to it. If you use different hostnames, edit them before reloading Caddy:

```bash
cp /opt/bitcraft-claim-monitor/deploy/Caddyfile.example /etc/caddy/Caddyfile
nano /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Open `https://app.timbersteeltrade.com/` in your browser. Caddy automatically obtains and renews the HTTPS certificate when DNS is pointing at the VPS and ports 80 and 443 are open.

On first visit, the app prompts each visitor to choose a settlement and optionally add a BitCraft Sync URL. Shared market/activity history is collected by the server for selected settlements; visitors do not submit raw browser snapshots.

## Updating the App

After new changes have been pushed to GitHub, run:

```bash
cd /opt/bitcraft-claim-monitor
sudo -u bitcraft git pull --ff-only
sudo -u bitcraft corepack pnpm install --frozen-lockfile
sudo -u bitcraft corepack pnpm --filter @workspace/bitcraft-local run build
systemctl restart bitcraft-claim-monitor
systemctl status bitcraft-claim-monitor
```

Persistent application data is stored at `/var/lib/bitcraft-claim-monitor`, so updating application code does not replace shared settlement history.

A new VPS begins with a new database. Activity history begins when it starts collecting snapshots, but Market Analytics now backfills available completed sell orders identified by BitJita as belonging to the monitored settlement market during the first successful collection.

## Database Backups

Hostworld weekly VPS backups are useful, but keep a separate SQLite backup because this database records market and activity history.

Create SQLite backups directly on the VPS. Generated backups can be stored under `/var/backups/bitcraft-claim-monitor`.

Create a protected backup directory:

```bash
install -d -o bitcraft -g bitcraft -m 700 /var/backups/bitcraft-claim-monitor
```

Create a backup at any time:

```bash
sudo -u bitcraft sqlite3 /var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite ".backup '/var/backups/bitcraft-claim-monitor/bitcraft-local.sqlite'"
```

To keep dated backups, use:

```bash
sudo -u bitcraft sqlite3 /var/lib/bitcraft-claim-monitor/bitcraft-local.sqlite ".backup '/var/backups/bitcraft-claim-monitor/bitcraft-local-$(date +%F).sqlite'"
```

Periodically download a backup off the VPS to your computer:

```powershell
scp root@YOUR_SERVER_IP:/var/backups/bitcraft-claim-monitor/bitcraft-local.sqlite .
```

## Useful Checks

```bash
systemctl status bitcraft-claim-monitor
journalctl -u bitcraft-claim-monitor -n 100 --no-pager
systemctl status caddy
journalctl -u caddy -n 100 --no-pager
curl http://127.0.0.1:18430/api/local/health
```

Only Caddy should be exposed publicly. The Node app intentionally listens on `127.0.0.1`, so the local API is reachable through the HTTPS website but not directly through an open server port.
