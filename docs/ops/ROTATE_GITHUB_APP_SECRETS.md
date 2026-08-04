# Rotate the `dii-space-sync` GitHub App secrets

Runbook for setting or rotating the GitHub App **private key** and **webhook
secret** that power one-click GitHub→space sync. Do this whenever either secret
may have leaked (e.g. passed through chat), or on a routine schedule.

- **App:** `dii-space-sync` — App ID `4178187` — settings at
  `https://github.com/settings/apps/dii-space-sync`
- **Source of truth (per environment):** the `.env` next to the compose files on
  the VPS — `/opt/di.iiii/.env` (production) and `/opt/di.iiii-staging/.env`
  (staging). Deploy never rewrites `.env`; it only `git checkout`s the tracked
  compose files, so values set here survive every deploy.
- **Reaching the container:** `docker-compose.yml` passes `GITHUB_APP_ID`,
  `GITHUB_APP_PRIVATE_KEY_B64` and `GITHUB_APP_WEBHOOK_SECRET` into the `server`
  service; the staging override reads the `STAGING_`-prefixed twins. A var that
  isn't listed there never reaches the process, whatever `.env` says.
- **Key loading:** `serverXR/src/githubApp.js#getPrivateKey` reads, in order:
  `GITHUB_APP_PRIVATE_KEY_PATH` → `GITHUB_APP_PRIVATE_KEY_B64` → `GITHUB_APP_PRIVATE_KEY`.
  It **prefers `_PATH`**, so compose deliberately passes only `_B64` — an empty
  `_PATH` would shadow a perfectly good key.

> **This was off in production for three weeks.** The secrets lived in cPanel's
> `~/.config/dii/<env>.deploy.env`; the 2026-07-15 move to the VPS replaced that
> mechanism with compose, and the three vars were never carried over. Nothing
> failed loudly: `isConfigured()` false makes `/api/github/app` answer
> `{configured: false}` and the webhook 401. If sync "just stops working", check
> the wiring below **before** suspecting the key.

## Why B64 over a `.pem` path

Deploy git-cleans tracked files, so a `.pem` would have to live outside the
checkout and be referenced by `_PATH`. Base64 in `.env` removes the loose file
entirely — the one file that is already source-of-truth holds everything.

## Steps

### 1. New private key (GitHub UI)
App settings → **Private keys** → **Generate a private key** (downloads a `.pem`)
→ then **delete the old key** in the same list.

### 2. New webhook secret (GitHub UI)
App settings → **Webhook** → set **Secret** to a fresh random string
(`openssl rand -hex 32`) → Save. Keep it for step 3.

### 3. Per environment — production first, then staging
Copy the `.pem` to the VPS (`scp <file> dii-vps:~/`), then, on the VPS
(`ssh dii-vps`):

```bash
PEM=~/dii-space-sync.NEW.private-key.pem
B64=$(base64 -w0 "$PEM")

CFG=/opt/di.iiii/.env ; PREFIX=""                    # production
# CFG=/opt/di.iiii-staging/.env ; PREFIX="STAGING_"  # staging (second pass)

set_env () {  # set_env KEY VALUE — replace in place or append
  grep -q "^${PREFIX}$1=" "$CFG" \
    && sed -i "s|^${PREFIX}$1=.*|${PREFIX}$1=$2|" "$CFG" \
    || echo "${PREFIX}$1=$2" >> "$CFG"
}

set_env GITHUB_APP_ID 4178187
set_env GITHUB_APP_PRIVATE_KEY_B64 "$B64"
set_env GITHUB_APP_WEBHOOK_SECRET '<NEW_SECRET_FROM_STEP_2>'

rm -f "$PEM"                     # no loose key material once B64 is in place
chmod 600 "$CFG"
```

### 4. Restart each stack
`.env` is read at container start, so the values only take effect on `up -d`.
On the VPS:

```bash
cd /opt/di.iiii          # production
docker compose --profile https -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.caddy-hardened.yml up -d server

cd /opt/di.iiii-staging  # staging
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  -f docker-compose.staging.yml up -d server
```

A redeploy (`git push origin main` / `dev`) also picks them up — restarting is
just the fast path.

### 5. Verify — configured first, then end-to-end
```bash
# signed in as an admin (the route requires a session):
curl -s https://di-studio.xyz/serverXR/api/github/app          # -> {"configured": true, …}
curl -s https://staging.di-studio.xyz/serverXR/api/github/app
```
`{"configured": false}` means the id or the key never reached the process —
re-check that compose lists the vars (guarded by `src/deploy-compose.test.js`)
before touching App settings again.

Then the canary: push a commit to **`dob-0/di-sync-webhook-test`** (private repo,
linked to prod space `webhook-test` since 2026-07-08) → the space auto-syncs and
"Last push synced" in `/admin → Manage → webhook-test → GitHub sync` shows the new
SHA. A stale webhook secret logs an HMAC signature mismatch and 401s the webhook;
a bad key fails App JWT auth (no installation token). Both surface in
`docker compose logs server`.

Do **not** verify via `br_id_ge` — its `sync-space.yml` CI sync would race the
webhook.

> The webhook only reaches **prod** (`di-studio.xyz`). On staging, force a sync
> with Disconnect/Connect in `/admin → Manage → space → GitHub sync`.
