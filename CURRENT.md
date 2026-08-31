# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- Three Distances: the owner's shape for local, LAN, and hosted, written down
- DMX Out: the graph reaches a real lighting rig over HTTP
- a projection mapper in the platform, so a space can be put on a wall

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **PROD IS CURRENT** — dev→main promoted 2026-08-25 (PR #269, 364 commits, all CI green; needed an admin merge because main requires a review the sole owner cannot self-give, plus the `production` environment approval). Verified live: di-studio.xyz serves the new front door ("Step inside"), the positioning eyebrow and the rebuilt wiki, zero console errors. **The Dilijan camp space stays on STAGING by decision — nothing about it moved.**
- Doors audit: only embed-link copy is left; the rest is decided and shipped. Ledger: memory `project_dii_doors_audit_2026_08_21` (also still open there: the bare PHONE canvas has no visible exit).
- Viewer seams left: the entry auto-frame direction is still hardcoded (0.8,0.45,1) — portrait entries tilt unless a composed fixed camera is authored (fixed-camera is NAVIGABLE now unless `locked:true`, #262); graph-only rooms still hide Walk/Fly by design; 3D text at eye level unsolved.
- **Live DB renames owed on PROD** — the four above are staging-only. The sandbox writes to `dii-staging-server-1` and refuses `dii-server-1`: needs `"Bash(ssh dii-vps:*)"` in settings, or four renames from the owner's Spaces page.
- `/wcc` false alarm closed; real leftover: `/wcc/main` needs >60s to settle. Camp decisions owed: kids name their own doors (labels only, first name/pseudonym — never full names on the public URL); consent for the public URL is hosq's call.
- **Open Jam — #256 and #257 landed, on dev and on staging.** `/open_jam` still opens the editor — repointing the in-circulation QR is the owner's call. Clean-up is prepared but NOT applied: `~/di-backups/open-jam/` holds both tiers, triage sheets and `jam-clean.mjs` (keep every upload, bin what the unsuited UI added, staging 47→20); the `PUT` was refused by the permission classifier.
- **No repo can own `open-jam`** — boot-ensured (`serverXR/src/index.js:623`) and `space-sync.mjs:441` writes only `mode: 'code'`, so a sync replaces 4983 versions of communal work with a static page. Owner picks: a door page at `/open/jam`, or a new space `jam` the repo masters.
- Staging Google OAuth secret parked by the user — memory `reference-leaked-secrets`; prod spaces all owned, mesh gate ARMED both tiers.
- Per-space byte QUOTA still unset — needs an owner policy number (ENOSPC floor shipped).
- **Dep PRs FROZEN until Aug 31** — staging is the Dilijan camp's production this week, and every dev merge deploys there. Nine are green and land-ready (#168 #169 #189 #190 #191 #192 #193 #194 + #170 conflicting): #169 react-router 7.18.2 is a real security fix whose park condition HAS fired; #170's has NOT (neither eslint-plugin-react nor jsx-a11y declares an eslint 10 peer). The old numbers #148/#150/#143 are superseded.
- `open` card teal-frame upload pending staging API token, then prod approval; director page unseen.
- br_id_ge needs a human: rite Act III/V visuals (camera-gesture-gated), the prod room's first spoken line, tunnel first-binding (telegram account with no prior bot chat).
- `httpContracts.test.js` flaky (30–51s of the ~97s suite) — rerun before believing a red; `npm run test:raw` (~21s) is the node loop, never the gate. Green PRs go BEHIND, not CONFLICTING, when dev lands (`gh` calls both "not mergeable") — landing windows: memory `feedback-coordinate-with-peer-agents`.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
