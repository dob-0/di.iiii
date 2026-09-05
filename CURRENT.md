# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- dead CSS removed, 205 lines verified selector by selector
- four rules, each one paid for tonight
- a room that can be read, not only looked at
- sign in with Telegram, the server half
- five green PRs landed as one batch, so no landing invalidates the next

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **Lighting desk (`/light`)**: local runtime only, 404 on a hosted tier by design — verify on a local stack, and note the edge answers 200 with the SPA there (proxying `/light*` to Node would let the guard's own 404 show; the clients now require JSON). A map cue can fire a look (lands on the desk's own cue layer) or a scene. A look's phase fan can read the stage arrangement, not just patch order (#350) — Line sweep, Radar and Grid are one-press starters, and the arrange world is ±1000 with a backdrop that tiles. `LIGHTING_SHOW_PORTABILITY.md` has the plan for making the show travel — needs the owner's yes before the migration starts (fixture identity by index, the show as a space file not a project-doc key, the club's 588 scenes staying put). Fixed a real save-window bug this session: an empty desk could silently replace a real show mid-restart — atomic rename + a "found a show, did not overwrite it" guard, both tested. Owed, in `LIGHTING_DESK_DESIGN.md` order: cue lists with tracking, the drawn operator surface, a clock with visible phase and nudge, timecode/Link/OSC-in; media playback (video/pixel-mapped visuals) is a bigger lane, not started. Also owed: a real ENTTEC widget on Linux (serial proven on a pty only); the club machine still runs the old standalone build (`~/artnet-desk` syncs `desk/` from here).
- Doors audit: only embed-link copy left (ledger: memory `project_dii_doors_audit_2026_08_21`; the bare PHONE canvas has no visible exit). Viewer seams left: the entry auto-frame direction is still hardcoded (0.8,0.45,1) — portrait entries tilt unless a composed fixed camera is authored (fixed-camera is NAVIGABLE now unless `locked:true`, #262); graph-only rooms still hide Walk/Fly by design; 3D text at eye level unsolved.
- `/wcc` false alarm closed; real leftover: `/wcc/main` needs >60s to settle. Camp decisions owed: kids name their own doors (labels only, first name/pseudonym — never full names on the public URL); consent for the public URL is hosq's call.
- **Open Jam — #256 and #257 landed, on dev and on staging.** `/open_jam` still opens the editor — repointing the in-circulation QR is the owner's call. Clean-up is prepared but NOT applied: `~/di-backups/open-jam/` holds both tiers, triage sheets and `jam-clean.mjs` (keep every upload, bin what the unsuited UI added, staging 47→20); the `PUT` was refused by the permission classifier. The `open` card's teal-frame upload still waits on a staging API token then prod approval; director page unseen.
- **No repo can own `open-jam`** — boot-ensured (`serverXR/src/index.js:623`) and `space-sync.mjs:441` writes only `mode: 'code'`, so a sync replaces 4983 versions of communal work with a static page. Owner picks: a door page at `/open/jam`, or a new space `jam` the repo masters.
- Owner items: staging Google OAuth secret parked (memory `reference-leaked-secrets`); per-space byte QUOTA still unset (ENOSPC floor shipped, now on socket chat writes too). Prod spaces all owned, mesh gate ARMED both tiers.
- **`dev`→`main` promoted and DEPLOYED 2026-09-05 (#369; #365 had died on the docs gate — a stray `docs/ai/sessions/` note on main — so prod sat on #359 two days; five BEHIND PRs landed as one batch, #368, memory `feedback-batch-land-behind-prs`).** di.bo's `[v] approve` button WORKS since 2026-09-03 — the owner added `deployments: write` to the fine-grained PAT (probe it with an empty `environment_ids`: 403 = permission missing, 422 = authorized, nothing pending). `/network` is now PUBLIC and current on all three tiers — 54 projects, audit clean, walked as a stranger on desktop and phone. The repo's `Deploy space code files` action went GREEN 2026-09-03 once the `LIVE_API_TOKEN` secret was set, but it only fires on `spaces/*/code/**` — rooms under `pages/` and every prod push stay manual `space-sync`. Carried over from #269: the Dilijan camp space stays on STAGING by decision yet `dilijan` IS listed on prod's spaces API (audit 2026-09-02, owner to decide), and prod still owes one `PATCH /api/spaces/algovrithm {previewImageAssetId: 1219e590…}` — the asset exists there, the `/spaces` thumbnail 404s until then.
- Front door seam (carried by #284, merged 2026-09-02): the new `main` room frames badly on arrival, desktop AND phone — the hardcoded auto-frame above, now the first thing every visitor sees. Owner's call: author a fixed entry camera, fix the auto-frame, or tune after. It weighs 27.9 MB / 141 requests (two 3.2 MB binaries fetched twice). `#170` eslint 10 stays parked.
- **Staging deploys fold their own notes since #299** — the test job folds in place, but the bot's fold push is refused by dev's protection (GH006: required checks, no bypass for github-actions), so the bookkeeping commit still needs `npm run land` by hand until the owner grants the github-actions app a bypass on `dev`. The in-place fold cannot shorten THIS file either: #299's own deploy failed on the 50-line limit, not on the notes — trim here at every land.
- **Naming audit done (4 agents), fixes split**: PR #281 (front door stopped advertising Notations #2, closed a month ago — still open, conflicts with the reworked landing; dev still says `br_id_ge · Notations #2`) and PR #282 (sign in with Telegram, server half — MERGED and on prod 2026-09-05, `telegram:false` until the secret is set; the bot half and the button are owed). Still the owner's to settle: does `di.i` survive; commons or funnel; does the position name Armenia; `window` vs `panel`; `Raw` (the guard bans the word the product uses everywhere).
- **`the-light-put-back` is LIVE on staging but PRIVATE** — a new work (14 laser photographs, MOCT × MECHATRONICA) arrived as a space, not repo code. Owner calls: make it public (`isPublic` is approval-gated, and they are Davit Nersisyan's photographs); re-cut its 4.3 MB inlined page as space assets before prod (`dii-space-weight-audit`); the STAGING badge sits on that page's transport bar. Note `space:new` → `space:code-push` still yields a *visible* page only after a fourth manual step no script performs — `PATCH /api/spaces/:id {publishedProjectId}`; recipe in memory `reference-dii-space-code-push`.
- br_id_ge needs a human: rite Act III/V visuals (camera-gesture-gated), the prod room's first spoken line, tunnel first-binding (telegram account with no prior bot chat).
- `httpContracts.test.js` flaky (30–51s of the ~97s suite) — rerun before believing a red; `npm run test:raw` (~21s) is the node loop, never the gate. Green PRs go BEHIND, not CONFLICTING, when dev lands (`gh` calls both "not mergeable") — landing windows: memory `feedback-coordinate-with-peer-agents`.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
