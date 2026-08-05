# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

## Last commit

**`dev` and `main` are LEVEL at `543de840`** — promoted 2026-08-05, both deploys green,
both hosts 12/12 (`npm run verify:algovrithm:remote -- <host>`), prod phone header seen
at 390px. Several agents share this tree: re-check `git log`, **stage explicit paths**.

## Last session (2026-08-05 — algovrithm on a phone, then shipped)

- Top bar overlapped itself on a phone — title and buttons were siblings in separate corners, so FULL SCREEN wrapped into a circle over the word "algovrithm"; one flex row now, and desktop was always clean, which is why it survived being looked at.
- Author-only furniture left the audience's header: WebXR diagnostic moved to the bottom authoring stack, "press H" hint hidden where there is no keyboard.
- My own browser guard shipped with a hole — it pressed H before measuring, which deletes the hint, so it passed on a build that visibly overlapped; it measures both panel states now, and I reproduced the bug to watch it fail.
- algovrithm's prod card has a preview (the reel-globe frame) — a code space has no `publishedProjectId`, so it can never reach the automatic branch; rule written in `golden_rules.md` (auto preview always, owner can override and get back), with a host-audit one-liner.
- Promoted `dev` → `main` on the owner's word: both deploys green, both hosts 12/12, and the prod phone header measured **and looked at** at 390px — the promotion also carried the sync-engine work to live.
- **Parallel session — the sync engine:** `scripts/space-sync.mjs`, the file every doc calls upstream, was the **stale** copy (four months behind the repos vendoring from it, still defaulting a target-less sync to the **live site**); promoted to v4 in `aa2205f7`, all four copies byte-equal, `slug`/`title` now enforced every run.
- It hid because `space-sync-vendor.mjs` (the check its own header named) **did not exist** and two NUL bytes made git call the engine **binary** — no diff, no grep; `scripts/space-sync.test.js` guards all three now, and br_id_ge was re-synced and **seen** on a Pixel 7 at prod.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups;
staging's `LIVE_API_TOKEN` (a real `PATCH` returned 200 on 2026-08-05).

## Open

- **Trees:** `~/di.iiii` is on `feat/timeline-core`, 47 behind, uncommitted — its **:5173** serves a stale algovrithm; don't switch it under its owner. **:5174** = `~/di.iiii-algomerge` on `dev`, the current one. **:5175** = `dev-preview`, detached at `5f4cd3a9`, stale.
- **Push when you finish** — `dev` self-deploys; a red `dev` freezes staging for everyone. Check `gh run list --branch dev --limit 1`.
- The `open` space's card is blank — no `publishedProjectId` of its own; same hole algovrithm was in.
- Studio's director page has never been seen with a real session — `/algovrithm/studio/director` is OAuth-gated; geometry verified, picture not.
- Reel globe's world `#04050A` fails the piece's own purple-gap check (`sequences/index.js`) — artist's call. Keyboard scroll is dead app-wide (`/wcc` too); only `/algovrithm` was fixed.
- The `br_id_ge ▾` chip covers the field's Armenian letter-row; narrow phones also collide the bottom links — owner's call.
- Privacy calls owed: no account-deletion, export or session revocation; backups unencrypted. §7 blocks Stage 2 — `docs/ai/INBOX.md`.
- **`feat/timeline-core` collides with this session and is UNPUSHED** (5 commits ahead of `dev`, in `~/di.iiii`): it moves the director to `src/raw/director/`, adds `view.director`/`view.timeline` nodes and `src/project/timeline/timelineCore.js` — so the Raw representation exists, but not on `dev`. It branched **before** the phone fix and still carries the old two-corner chrome, so a careless merge re-introduces the overlap; `chromeLayout.test.js` is what catches that. Land it deliberately.

## Deploy & validation — known fixes: [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
