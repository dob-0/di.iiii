# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- The Light Put Back arrives as a space, and space:code-push turns out to be broken three ways

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **PROD IS CURRENT** — dev→main promoted 2026-08-25 (PR #269, 364 commits, all CI green; needed an admin merge because main requires a review the sole owner cannot self-give, plus the `production` environment approval). Verified live: di-studio.xyz serves the new front door ("Step inside"), the positioning eyebrow and the rebuilt wiki, zero console errors. **The Dilijan camp space stays on STAGING by decision — nothing about it moved.**
- Doors audit: only embed-link copy is left; the rest is decided and shipped. Ledger: memory `project_dii_doors_audit_2026_08_21` (also still open there: the bare PHONE canvas has no visible exit).
- Viewer seams left: the entry auto-frame direction is still hardcoded (0.8,0.45,1) — portrait entries tilt unless a composed fixed camera is authored (fixed-camera is NAVIGABLE now unless `locked:true`, #262); graph-only rooms still hide Walk/Fly by design; 3D text at eye level unsolved.
- `/wcc` false alarm closed; real leftover: `/wcc/main` needs >60s to settle. Camp decisions owed: kids name their own doors (labels only, first name/pseudonym — never full names on the public URL); consent for the public URL is hosq's call.
- **Open Jam — #256 and #257 landed, on dev and on staging.** `/open_jam` still opens the editor — repointing the in-circulation QR is the owner's call. Clean-up is prepared but NOT applied: `~/di-backups/open-jam/` holds both tiers, triage sheets and `jam-clean.mjs` (keep every upload, bin what the unsuited UI added, staging 47→20); the `PUT` was refused by the permission classifier.
- **No repo can own `open-jam`** — boot-ensured (`serverXR/src/index.js:623`) and `space-sync.mjs:441` writes only `mode: 'code'`, so a sync replaces 4983 versions of communal work with a static page. Owner picks: a door page at `/open/jam`, or a new space `jam` the repo masters.
- Staging Google OAuth secret parked by the user — memory `reference-leaked-secrets`; prod spaces all owned, mesh gate ARMED both tiers.
- Per-space byte QUOTA still unset — needs an owner policy number (ENOSPC floor shipped).
- **Dep PRs ALL LANDED 2026-09-01** (#168 #169 #189–#194, react-router 7.18.2 included). `#170` eslint 10 stays parked — its condition has still not fired. **PROMOTION #284 IS OPEN AND WAITING ON THE OWNER** (admin merge + `production` approval); it also carries #283's new front door, so read its front-door note first.
- **The new front door frames badly on arrival** (`/` is the room since #283) — desktop AND phone: content in a band, empty blue on one side, tilted floor filling the rest. Not an error, it is the hardcoded auto-frame seam above, now on the first thing every visitor sees. Owner's call: author a fixed entry camera for `main`, fix the auto-frame, or promote and tune after.
- **`Check AI docs` killed three staging deploys today**, each showing `deploy: skipped` rather than red while every PR read as merged. Both causes were session notes a merge left unfolded. `npm run land` is the fix — **merge and land are one motion**, and confirm the dev run went green after.
- **Naming audit done (4 agents), fixes split**: PR #281 (front door stopped advertising Notations #2, closed a month ago) and PR #282 (sign in with Telegram, server half). Still the owner's to settle: does `di.i` survive; commons or funnel; does the position name Armenia; `window` vs `panel`; `Raw` (the guard bans the word the product uses everywhere).
- **`the-light-put-back` is LIVE on staging but PRIVATE** — a new work (14 laser photographs, MOCT × MECHATRONICA) arrived as a space, not repo code. Owner calls: make it public (`isPublic` is approval-gated, and they are Davit Nersisyan's photographs); re-cut its 4.3 MB inlined page as space assets before prod (`dii-space-weight-audit`); the STAGING badge sits on that page's transport bar. Note `space:new` → `space:code-push` still yields a *visible* page only after a fourth manual step no script performs — `PATCH /api/spaces/:id {publishedProjectId}`; recipe in memory `reference-dii-space-code-push`.
- `open` card teal-frame upload pending staging API token, then prod approval; director page unseen.
- br_id_ge needs a human: rite Act III/V visuals (camera-gesture-gated), the prod room's first spoken line, tunnel first-binding (telegram account with no prior bot chat).
- `httpContracts.test.js` flaky (30–51s of the ~97s suite) — rerun before believing a red; `npm run test:raw` (~21s) is the node loop, never the gate. Green PRs go BEHIND, not CONFLICTING, when dev lands (`gh` calls both "not mergeable") — landing windows: memory `feedback-coordinate-with-peer-agents`.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
