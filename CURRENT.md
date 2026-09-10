# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- every page was black on any Chrome older than 122

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **~46 commits sit on dev/staging and NOT on prod** — the whole 2026-09-10 run included. `main` untouched; promotion is the owner's word. aylmo runs a branch build (`0.4.7-shelves.2`) at https://local.thedi.studio; port 443 comes from setcap on the node binary, which a Node upgrade wipes.
- **Five projects reference assets no tier holds** — `open/front-room`, `front-room-light`, `look-signal`, `look-night`, `look-paper`, 76–78 each, uuid ids from before content addressing. Found by `npm run assets:audit`, which now gates this class; nobody had ever been told. Beyond Form's 13 are restored (prod had them whole).
- **Two spaces wait on one word** — `algovrithm` is public, empty and can never open (`src/algoVrithm/` owns that url before any space lookup, so the row is unreachable by construction: the row goes, or the work becomes a space); `the-light-put-back` is LIVE on staging but PRIVATE (Davit Nersisyan's 14 laser photographs, and its 4.3 MB inlined page wants re-cutting before prod).
- **Follow (one space on two installs) carries NO assets yet** — a followed scene shows a grey wall where an image or model is; no warning when op retention drops something uncarried; the internet case is untested and needs a throwaway space — owner's call.
- **Open Jam** — `/open_jam` still opens the editor; repointing the in-circulation QR is the owner's call. No repo can own `open-jam` (boot-ensured, and `space-sync.mjs` writes only `mode: 'code'`, so a sync would replace 4983 versions of communal work with a static page): a door page at `/open/jam`, or a new space `jam` the repo masters.
- Front door seam: the `main` room frames badly on arrival, desktop AND phone (the hardcoded auto-frame `0.8,0.45,1`), and weighs 27.9 MB / 141 requests. Doors audit: only embed-link copy left; the bare PHONE canvas has no visible exit; 3D text at eye level unsolved.
- Owner items: staging Google OAuth secret parked (memory `reference-leaked-secrets`); per-space byte QUOTA unset; `wcc` still names two things; `main/privacy` unreachable at its own url; `LIVE_API_URL` means staging in six scripts and prod in two. br_id_ge needs a human: rite Act III/V visuals, the prod room's first spoken line, tunnel first-binding.
- **Staging deploys fold their own notes**, but the bot's fold push is refused by dev's protection (GH006), so `npm run land` still needs a hand. Trim this file at every land — the 50-line limit fails the deploy, not the notes.
- `httpContracts.test.js` flaky (30–51s of the ~97s suite) — rerun before believing a red. `SpaceHub.test.jsx`'s preview-stub case was CI-only flaky and now waits 8s. Green PRs go BEHIND, not CONFLICTING, when dev lands. The spine covers 4 stylesheets and names 5 more as debt in `src/styles/spine.test.js` — adding a file to `SPINE_FILES` without converting it defeats the guard.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
