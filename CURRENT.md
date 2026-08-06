# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

## Last commit

**`dev` and `main` are LEVEL at `ef6e1fe7`** — promoted 2026-08-06, both deploys green,
prod self-reports the commit. Verified on the live host: ownership route 404s an unknown
account and 400s a `guest:` one, settings route answers, all 5 declared spaces audit clean,
door + wiki + invite card **looked at** at 390px. Share this tree: **stage explicit paths**.

## Last session (2026-08-05/06 — `feat/space-declared`)

- A space can be given an owner **after** creation — `PATCH /api/spaces/:id` takes `ownerUserId` (admin-only, `null` releases) and grants scope in the same call; Preferences → Manage grew "Owner & access". Rehearsed end to end on staging: unknown account **404** (200-and-ignored before the deploy), assign → scope granted in the same call → `null` releases but leaves the scope, so it is not a full undo. Fourth instance of the create-only-field bug. Found alongside it: `serverSpaces.js` never forwarded `slug`, so "Edit public link" had **never** done anything.
- The algovrithm Director now saves from the live site — `GET/PUT /api/spaces/:id/settings` (opaque JSON, 64 KB) plus a timing overlay resolved before the clock is built; **seen** on a production build with no dev server.
- "Invite carries its role" was **dropped after measuring** — new accounts already default to `editor`. Instead, an invited collaborator got a door: `joining-a-space` in the wiki is the browser-only path, `README`/`ONBOARDING` fork into two, both AuthGate cards link to it.
- **All 8 prod spaces are declared.** Engine v6 reads an empty `projects` list as a space-only declaration, so Studio-authored and code spaces can be declared at all; `npm run spaces:audit` walks every one, read-only. Prod and staging agree on every declared field.
- **`docs/promo/` is out of the public repo** — grant calendar, stakeholder tracker, revenue model, unsent drafts now in private `dob-0/di.iiii-ops`. `git rm` does not remove history: treat it as already seen.
- **CURRENT.md's own 50-line limit is now a CI check** (`check-agent-docs.mjs`) — written in the file's first line, read by nothing, and it blocked three of this session's own commits. `golden_rules.md` records which half of the contract CI enforces and which half is discipline.

Before it (2026-08-05, now live): the 54-agent audit — run against a tree **51 commits
behind `dev`**, so check `git rev-list --left-right --count HEAD...origin/dev` before any
fan-out. Every push reports `Bypassed rule violations`; branch protection does not stop this account.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **The 8 prod spaces are still ownerless — the one thing left to do.** The route is now on prod; adopting is a `PATCH` per space and needs only a decision. Three admins exist (`ginsyuz`, `dob-0`, `gevorg_aram1@thedi.studio`) and `wcc`/`beyond-form` may belong to curators. Recipe in `spaces/README.md`.
- The three linked repos (`br_id_ge`, `beyond_form`, `platform_recordar`) still hold **uncommitted** v6 engine copies and new space manifests — vendoring locally changes nothing their CI runs.
- **Trees:** `~/di.iiii` drifts under whoever is working and **:5173** serves whatever is on its disk — name the branch before you say "go look". `~/di.iiii-algomerge` is on `dev`; `dev-preview` is detached at `5f4cd3a9`. **Push when you finish** — `dev` self-deploys, a red `dev` freezes staging. **The mesh gate is INERT in prod** — the code is live but no `MESH_ROOM_SECRET` is set, so the keeper is still impersonable; set a distinct value per tier in the VPS `.env`, then deploy the three keeper clients.
- **The leaked GitHub PAT and staging Google OAuth secret are still live**; 13 dead GitHub secrets also want revoking. Privacy calls owed: no account-deletion or export, **backups still unencrypted** (`age` decided, not built; key location undecided). §7 blocks Stage 2 — `docs/ai/INBOX.md`. Also owner-blocked: a Telegram chat id for backup-failure alerts, and a staging `LIVE_API_TOKEN` for `deploy-space-code.yml` (it fails on every triggering push today).
- Owner's/artist's calls: `open`'s card is blank (no `publishedProjectId`); the director page has never been seen with a real session; reel globe's `#04050A` fails the piece's own purple-gap check; the `br_id_ge ▾` chip covers the Armenian letter-row. Keyboard scroll is fixed app-wide as of `0b4b2b7f`.
- **`feat/timeline-core` is UNPUSHED and checked out nowhere** (5 ahead of `dev`, 51 behind): it moves the director to `src/raw/director/` and adds `view.director`/`view.timeline`. It branched **before** the phone fix and still carries the old two-corner chrome, so a careless merge re-introduces the overlap; `chromeLayout.test.js` catches that. Land it deliberately.

## Deploy & validation — known fixes: [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
