# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- dev absorbs main so the promotion can go
- the dev box was never a copy of staging
- the entry stops lurching when the walker takes over
- the platform's space is `di.iiii`, and the network has a room per person

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **Prod = the 2026-08-25 promotion (#269).** The Dilijan camp space stays on STAGING by decision — yet `dilijan` IS listed on prod's spaces API (audit 2026-09-02); owner to decide. Prod also owes one `PATCH /api/spaces/algovrithm {previewImageAssetId: 1219e590…}` — the asset already exists there, the `/spaces` thumbnail 404s until then.
- Doors audit: only embed-link copy left (ledger: memory `project_dii_doors_audit_2026_08_21`; the bare PHONE canvas has no visible exit). Viewer seams left: the entry auto-frame direction is still hardcoded (0.8,0.45,1) — portrait entries tilt unless a composed fixed camera is authored (fixed-camera is NAVIGABLE now unless `locked:true`, #262); graph-only rooms still hide Walk/Fly by design; 3D text at eye level unsolved.
- `/wcc` false alarm closed; real leftover: `/wcc/main` needs >60s to settle. Camp decisions owed: kids name their own doors (labels only, first name/pseudonym — never full names on the public URL); consent for the public URL is hosq's call.
- **Open Jam — #256 and #257 landed, on dev and on staging.** `/open_jam` still opens the editor — repointing the in-circulation QR is the owner's call. Clean-up is prepared but NOT applied: `~/di-backups/open-jam/` holds both tiers, triage sheets and `jam-clean.mjs` (keep every upload, bin what the unsuited UI added, staging 47→20); the `PUT` was refused by the permission classifier.
- **No repo can own `open-jam`** — boot-ensured (`serverXR/src/index.js:623`) and `space-sync.mjs:441` writes only `mode: 'code'`, so a sync replaces 4983 versions of communal work with a static page. Owner picks: a door page at `/open/jam`, or a new space `jam` the repo masters.
- Owner items: staging Google OAuth secret parked (memory `reference-leaked-secrets`); per-space byte QUOTA still unset (ENOSPC floor shipped, now on socket chat writes too). Prod spaces all owned, mesh gate ARMED both tiers.
- **PROMOTION #284 IS OPEN AND WAITING ON THE OWNER** (admin merge + `production` approval). It carries #283's new front door, which frames badly on arrival — desktop AND phone: content in a band, empty blue on one side, tilted floor. Not an error: the hardcoded auto-frame seam above, now the first thing every visitor sees. Owner's call: author a fixed entry camera for `main`, fix the auto-frame, or promote and tune after. The room also weighs 27.9 MB / 141 requests on desktop (two 3.2 MB binaries each fetched twice). #297's HSTS reaches Caddy only with this promotion. `#170` eslint 10 stays parked.
- **Staging deploys fold their own notes since #299** — the test job folds in place, but the bot's fold push is refused by dev's protection (GH006: required checks, no bypass for github-actions), so the bookkeeping commit still needs `npm run land` by hand until the owner grants the github-actions app a bypass on `dev`. The in-place fold cannot shorten THIS file either: #299's own deploy failed on the 50-line limit, not on the notes — trim here at every land.
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
