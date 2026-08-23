# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- `platform` stopped standing in for the name — ~25 sentences (wiki, Terms, admin, landing) now say di.iiii; the word is NOT banned and no test guards it, the rule is a person rule in `docs/ai/vocabulary.md`.
- The landing answered "What is di.iiii?" with the editor ("a collaborative 3D spatial editor… a shared whiteboard"); it now answers with what the code does. README's H2 followed.
- Live labels corrected **on staging only**: space `main` `di.ii`→Works (project `di.i: open_space`→Everything made here), `platform-recordar`→RecordAR, `wcc`→WCC Exhibition. Ids and slugs untouched, all ten public URLs still 200.
- New golden rule after the owner flagged the risk: **a shared link is a promise** — labels are free, `id`/`slug`/`publishedProjectId` are not. The last two `desk` metaphors also went (canvas); `3D Desk` and *lighting desk* stay.

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **PROD IS BEHIND** — everything of 2026-08-22/23 sits on staging only; prod still serves the retired three-door landing, and still previews the bare domain as an Express error page (fixed on staging). Owner promotes after checking staging.
- Doors audit: only embed-link copy is left; the rest is decided and shipped. Ledger: memory `project_dii_doors_audit_2026_08_22`.
- Walk / Fly cannot render a node graph, so it is hidden on a node room — the honest gap. `stash@{0}` (a sibling's CURRENT.md pre-write) is still parked; don't clear it blind.
- **Live DB renames owed on PROD** — the four above are staging-only. The sandbox writes to `dii-staging-server-1` and refuses `dii-server-1`: needs `"Bash(ssh dii-vps:*)"` in settings, or four renames from the owner's Spaces page.
- **`azd` is unidentified and public on prod** — label and only project both `azd`. If it is scratch the fix is `isPublic:false`, not a rename. Owner's call.
- **`/wcc` publishes `alla-virabyan`** — the WCC link opens one artist, not the exhibition front. A publishing setting, not a name.
- **Open Jam — two PRs open, neither landed:** #256 snapshots project documents (jam contributions were on NO backup path; merge before any clean-up), #257 the walk-in surface at `/open_jam/scene`. `/open_jam` still opens the editor — repointing the in-circulation QR is the owner's call. Clean-up is prepared but NOT applied: `~/di-backups/open-jam/` holds both tiers, triage sheets and `jam-clean.mjs` (keep every upload, bin what the unsuited UI added, staging 47→20); the `PUT` was refused by the permission classifier.
- **No repo can own `open-jam`** — boot-ensured (`serverXR/src/index.js:623`) and `space-sync.mjs:441` writes only `mode: 'code'`, so a sync replaces 4983 versions of communal work with a static page. Owner picks: a door page at `/open/jam`, or a new space `jam` the repo masters.
- Staging Google OAuth secret parked by the user — memory `reference-leaked-secrets`; prod spaces all owned, mesh gate ARMED both tiers.
- Per-space byte QUOTA still unset — needs an owner policy number (ENOSPC floor shipped).
- Deps parked: eslint-10 #148, router-7 #150, checkout-7 #143 (its windows install-test fails).
- `open` card teal-frame upload pending staging API token, then prod approval; director page unseen.
- br_id_ge needs a human: rite Act III/V visuals (camera-gesture-gated), the prod room's first spoken line, tunnel first-binding (telegram account with no prior bot chat).
- `httpContracts.test.js` flaky (30–51s of the ~97s suite) — rerun before believing a red; `npm run test:raw` (~21s) is the node loop, never the gate. Green PRs go BEHIND, not CONFLICTING, when dev lands (`gh` calls both "not mergeable") — landing windows: memory `feedback-coordinate-with-peer-agents`.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
