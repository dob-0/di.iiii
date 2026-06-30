# Rotate the `dii-space-sync` GitHub App secrets

Runbook for rotating the GitHub App **private key** and **webhook secret** that
power one-click GitHub→space sync. Do this whenever either secret may have leaked
(e.g. passed through chat), or on a routine schedule.

- **App:** `dii-space-sync` — App ID `4178187` — settings at
  `https://github.com/settings/apps/dii-space-sync`
- **Source of truth (per host):** `~/.config/dii/<env>.deploy.env`. The deploy
  apply step (`scripts/cpanel-apply-prebuilt-release.sh`) sources it and
  `scripts/write-server-env.mjs` bakes `GITHUB_APP_*` into the server
  `.env.generated`. So secrets set here survive every deploy.
- **Key loading:** `serverXR/src/githubApp.js#getPrivateKey` reads, in order:
  `GITHUB_APP_PRIVATE_KEY_PATH` → `GITHUB_APP_PRIVATE_KEY_B64` → `GITHUB_APP_PRIVATE_KEY`.
  It **prefers `_PATH`** — to switch to B64 you MUST remove the `_PATH` line.

## Why B64 over a `.pem` path

Deploy git-cleans the app dir, so a `.pem` had to live in `~/` and be referenced
by `_PATH`. Storing the key as base64 directly in `deploy.env` removes the loose
file entirely — the one file that is already source-of-truth now holds everything.

## Steps

### 1. New private key (GitHub UI)
App settings → **Private keys** → **Generate a private key** (downloads a `.pem`)
→ then **delete the old key** in the same list.

### 2. New webhook secret (GitHub UI)
App settings → **Webhook** → set **Secret** to a fresh random string
(`openssl rand -hex 32`) → Save. Keep it for step 3.

### 3. Per host — prod first, then staging
Upload the new `.pem` to `~/` (cPanel File Manager or scp), then:

```bash
cd ~
B64=$(base64 -w0 ~/dii-space-sync.NEW.private-key.pem)
CFG=~/.config/dii/production.deploy.env   # staging.deploy.env on the other host

# switch key to B64 (must drop _PATH so the code uses B64)
sed -i '/^GITHUB_APP_PRIVATE_KEY_PATH=/d' "$CFG"
grep -q '^GITHUB_APP_PRIVATE_KEY_B64=' "$CFG" \
  && sed -i "s|^GITHUB_APP_PRIVATE_KEY_B64=.*|GITHUB_APP_PRIVATE_KEY_B64=$B64|" "$CFG" \
  || echo "GITHUB_APP_PRIVATE_KEY_B64=$B64" >> "$CFG"

# new webhook secret (paste the value from step 2)
sed -i 's|^GITHUB_APP_WEBHOOK_SECRET=.*|GITHUB_APP_WEBHOOK_SECRET=<NEW_SECRET>|' "$CFG"

rm -f ~/dii-space-sync.*.pem   # delete leaked/old key material once B64 is in place
```

### 4. Redeploy both envs
```bash
gh workflow run publish-cpanel-prebuilt-v2.yml -f deploy_env=production
gh workflow run publish-cpanel-prebuilt-v2.yml -f deploy_env=staging
gh run list --workflow publish-cpanel-prebuilt-v2.yml
```

### 5. Verify
Real `git push` to `dob-0/br_id_ge` → prod space auto-syncs. A stale webhook
secret logs an HMAC signature mismatch and 401s the webhook; a bad key fails App
JWT auth (no installation token). Both surface in the serverXR logs.

> Webhook only reaches **prod** (`di-studio.xyz`). On staging, force a sync with
> Disconnect/Connect in `/admin → Manage → space → GitHub sync`.
