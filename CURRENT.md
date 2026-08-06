# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

## Last commit

**`dev` is at `d543fd80`, staging deploy GREEN and verified**; `main` still LIVE at
`fed578f9` — the session below is on staging, NOT on prod. Promotion is unasked.
Agents share this tree: **stage explicit paths**.

## Last session (2026-08-05/06 — `feat/space-declared`)

- A space can be given an owner **after** creation — `PATCH /api/spaces/:id` takes `ownerUserId` (admin-only, `null` releases) and grants scope in the same call; Preferences → Manage grew "Owner & access". Fourth instance of the create-only-field bug. Found alongside it: `serverSpaces.js` never forwarded `slug`, so "Edit public link" had **never** done anything.
- The algovrithm Director now saves from the live site — `GET/PUT /api/spaces/:id/settings` (opaque JSON, 64 KB) plus a timing overlay resolved before the clock is built; **seen** on a production build with no dev server.
- "Invite carries its role" was **dropped after measuring** — new accounts already default to `editor`. Instead, an invited collaborator got a door: `joining-a-space` in the wiki is the browser-only path, `README`/`ONBOARDING` fork into two, both AuthGate cards link to it.
- **All 8 prod spaces are declared.** Engine v6 reads an empty `projects` list as a space-only declaration, so Studio-authored and code spaces can be declared at all; `npm run spaces:audit` walks every one, read-only. Prod and staging agree on every declared field.
- **`docs/promo/` is out of the public repo** — grant calendar, stakeholder tracker, revenue model, unsent drafts now in private `dob-0/di.iiii-ops`. `git rm` does not remove history: treat it as already seen.

## Previous session (2026-08-05 — full audit, on `dev`)

- A 54-agent audit ran against a tree **51 commits behind `dev`** — check `git rev-list --left-right --count HEAD...origin/dev` BEFORE any fan-out. Shipped: gzip was dead in prod (2125→682 KB), `vps-restore.sh` could destroy live data, staging published on 0.0.0.0, two authorization holes, a stored XSS, a collab data-loss path, **session revocation** via `users.token_version`, the asymmetric mesh identity gate, and code-mode pages no longer pulling `three-vendor` (541→75 KB gzipped).
- Every push reported `Bypassed rule violations for refs/heads/dev` — branch protection's required checks do not stop this account.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- The 8 **prod** spaces are still ownerless. The route is live on staging and verified there end to end (assign → scope granted in the same call → `null` releases); prod gets it on the next promotion. The three linked repos still hold **uncommitted** v6 engine copies + new manifests. Three admins exist — who adopts what is a call. Recipe in `spaces/README.md`.
- Releasing ownership does **not** revoke the scope it granted — deliberate (losing a space should not lock you out), but `null` is therefore not a full undo. Staging's `dob-0` still carries `azd` from the rehearsal.
- **Trees:** `~/di.iiii` drifts under whoever is working, and **:5173** serves whatever is on its disk — name the branch before you say "go look". `~/di.iiii-algomerge` is on `dev`; `dev-preview` is detached at `5f4cd3a9`, stale. **Push when you finish** — `dev` self-deploys and a red `dev` freezes staging; check `gh run list --branch dev --limit 1`.
- **The mesh gate is INERT in prod** — the code is live but no `MESH_ROOM_SECRET` is set, so the keeper is still impersonable; set a distinct value per tier in the VPS `.env`, then deploy the three keeper clients.
- **The leaked GitHub PAT and staging Google OAuth secret are still live**; 13 dead GitHub secrets also want revoking. Privacy calls owed: no account-deletion or export, **backups still unencrypted** (`age` decided, not built; key location undecided). §7 blocks Stage 2 — `docs/ai/INBOX.md`. Also owner-blocked: a Telegram chat id for backup-failure alerts, and a staging `LIVE_API_TOKEN` for `deploy-space-code.yml` (it fails on every triggering push today).
- Owner's/artist's calls: `open`'s card is blank (no `publishedProjectId`); the director page has never been seen with a real session; reel globe's `#04050A` fails the piece's own purple-gap check; the `br_id_ge ▾` chip covers the Armenian letter-row. Keyboard scroll is fixed app-wide as of `0b4b2b7f`.
- **`feat/timeline-core` is UNPUSHED and checked out nowhere** (5 ahead of `dev`, 51 behind): it moves the director to `src/raw/director/` and adds `view.director`/`view.timeline`. It branched **before** the phone fix and still carries the old two-corner chrome, so a careless merge re-introduces the overlap; `chromeLayout.test.js` catches that. Land it deliberately.

## Deploy & validation — known fixes: [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
