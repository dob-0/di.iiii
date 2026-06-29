# Spec — One-click "New space from GitHub" (GitHub App)

Status: **DRAFT.** The server-side sync core is **built + proven** (`scripts/space-sync-github.mjs`
syncs a space from a repo over the GitHub API — verified against `dob-0/br_id_ge`). This spec
covers the remaining rungs: the GitHub App (owner gate), the webhook, and the button.

## Goal

```
log in with GitHub → "New space from GitHub" → pick/create a repo → done
```
No pasted key, no template copy. After a one-time App install, adding a space is one click.

## Why a GitHub App (OAuth login is not enough)

| Capability | Needs |
|---|---|
| Read a private repo's files | installation token (App) |
| **Create** a repo from a template for the user | App with `Administration: write` (or user OAuth `repo` scope) |
| **Auto-sync on push** (webhook) | App webhook — OAuth cannot receive events |

## What YOU register (the gate — ~20 min, owner-only)

GitHub → Settings → Developer settings → **GitHub Apps → New GitHub App**:

- **Name:** `di.iiii`
- **Homepage / Callback URL:** `https://di-studio.xyz` / `https://di-studio.xyz/serverXR/api/github/callback`
- **Webhook URL:** `https://di-studio.xyz/serverXR/api/github/webhook` · **Webhook secret:** generate a random string
- **Permissions (least needed):**
  - Repository → **Contents: Read & write** (read files; write only if we ever push back — Read-only is fine for one-way)
  - Repository → **Administration: Read & write** (only if "create repo from template" is wanted; omit for connect-only v1)
  - Repository → **Metadata: Read**
- **Subscribe to events:** **Push**
- **Where can this app be installed:** your account/org.

It produces: **App ID**, a **private key** (`.pem`), the **webhook secret**, and **client id/secret**.
These go on the **prod server env** (never the repo):
```
GITHUB_APP_ID=...
GITHUB_APP_PRIVATE_KEY=...      # the .pem contents
GITHUB_APP_WEBHOOK_SECRET=...
GITHUB_APP_CLIENT_ID=... / GITHUB_APP_CLIENT_SECRET=...
```

## What I build (each rung independently shippable)

1. **✅ Server-side sync-from-GitHub** — `space-sync-github.mjs`: fetch repo files via the
   GitHub API → `codeFiles` → document. *Done, proven against the real repo.* Moves into
   serverXR as a callable (`syncSpaceFromGitHub(link, ghToken)`).
2. **App auth** — JWT signed by the App private key → exchange for a short-lived **installation
   token**; used for private-repo reads and (optional) repo creation. *(Needs the App secrets to test.)*
3. **`github_installations` + `space_links` tables** — `{ spaceId, owner, repo, ref, installationId, lastSyncSha }`. Reuses the scoped **sync-key** machinery already built for internal auth.
4. **Webhook receiver** — `POST /serverXR/api/github/webhook` → verify HMAC signature with the
   webhook secret → match repo → `syncSpaceFromGitHub`. Auto-sync on push.
5. **"New space from GitHub" UI** — install-app → pick/create repo → first sync → done.
   `preferences-*` design system + wiki entry.

## Security (reuses prior spec)

- Installation tokens are short-lived, fetched per-operation, never stored long-term.
- Webhook HMAC verified before any work; reject on mismatch.
- One-way **repo → space**; `Contents: Read-only` is enough for v1 (we never write the repo).
- Per-space binding; a compromised install/token touches only its linked spaces' content.
- Full review by security-auditor before prod (auth + secrets + webhook signature).

## First move
**You register the di.iiii GitHub App** (above) and put its secrets on the server. Then rung 2
(App-auth) becomes testable and the rest follows. Until then, rung 1 already lets us sync any
**public** repo into a space today.
