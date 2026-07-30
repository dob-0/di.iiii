# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live) — promote only after staging verify

---

## Last commit

`dev` pushed to staging 2026-07-30 (9 commits). `main` = prod is **9 behind** —
promote only after a staging pass. Several agents share this tree: re-check
`git log` before assuming your commits are local, and **stage explicit paths,
never `git add -A`**.

## Last session (2026-07-28/30)

- **The Seed lane is now Raw.** `src/raw/`, `Raw*` components, `raw-*` CSS,
  route `/raw`. Old `/seed` links still resolve and RootApp rewrites them.
  Renamed by identifier, not substring — "seed" is also a verb here.
  Second pass 2026-07-30 finished the user-visible remainder: hub title/status
  copy, `Space → Raw → Studio`, the `rawTopbarReveal` keyframe, and
  `dii.seed.*` → `dii.raw.*` storage keys (with a one-time migration so nobody
  loses their display name). Every remaining "seed" in the tree is the verb.
- **Two wrong paths fixed.** Raw's help dialog linked `docs/raw/USER_MANUAL.md`,
  which never existed (the rename renamed the string, not the file) — written,
  and `src/docPaths.test.js` now fails if any `docs/*.md` shown to a user
  doesn't resolve. The landing's route map advertised bare `/beta` and `/raw`,
  which default to restricted `main` and dead-ended every guest at "sign in to
  open the editor"; now `/open/beta` and `/open/raw`, matching the CTA.
- **Memory collection was never wired up** — no hook drove it, so it only
  happened when an agent thought of it. Fixed: `meta_memory_sync.md` is the
  single contract, `un-di/templates/hooks/memory-sync-check.sh` reports drift
  on Stop, and there's a golden rule for recapping at every compaction.
- **22 of 49 node types were declarations with nothing behind them** (no
  getUserMedia / requestMIDIAccess / RTCPeerConnection anywhere). Withheld from
  the palette via `UNIMPLEMENTED_NODE_TYPES`; queue in
  `docs/roadmaps/NODE_BACKLOG.md`. Implementing one = deleting its line.
- Built `time`, the first off that queue — it declared 4 outputs and evaluated
  none. Clock is injected so evaluation stays pure; the rAF tick is gated on a
  Time node existing.
- Editors now explain the out-of-scope bounce instead of silently becoming
  `/main`. Viewer surfaces still redirect.
- Uploads strip EXIF/GPS (`serverXR/src/assetScrub.js`) — **not retroactive**.
- WCC webfonts self-hosted; zero third-party requests from the React app.
- **Off-box backup exists**: `scripts/backup-pull.sh`, 16 archives / 9.5 GB
  pulled and verified, DB opens. Nothing schedules it yet.
- Read `docs/ai/dependency-decisions.md` and `docs/ai/privacy-data-inventory.md`
  *before* touching deps or writing `/privacy`.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie,
roles, OAuth-first) + open-space/sandbox grants; Open Jam and vanity links live;
deploy via `git push origin dev|main`; nightly VPS backups (local only).

## Open

- **Owed browser tests:** Raw deep nesting (fullscreen + back edges); EXIF
  round-trip on a real sideways portrait; a Time node actually ticking.
- Promote `dev -> main` once staging passes (prod is 9 behind).
- 11 dependabot PRs, 0 issues. #78 drei 10, #76 express 5, #79 jsdom 29 are
  majors — check `dependency-decisions.md` first.
- Privacy, product calls owed: no account-deletion path, no export, no session
  revocation. Legacy `public/wcc/artist-works-land/` still pulls Google Fonts
  + 3 unpkg scripts (the React WCC surface is clean).
- URL spec §7 needs sign-off; blocks Stage 2 (a schema change — nodes have no
  slug). `docs/architecture/SPEC_url_architecture_and_tree_addressing.md`.
- Owner-logged-in click-throughs owed on staging.
- Off-box backup works but **nothing schedules it** — install the systemd timer
  in `docs/deploy/OFFBOX_BACKUP.md`. Archives are not encrypted at rest. Also
  stale GitHub App key, `main` protection bypassable.
- A `main` deploy failed 2026-07-28 12:45 on a docs-only commit — unexplained.
- `docs/ai/INBOX.md`: sound-in-spaces. Promo/licensing outbound owed.

## Known fixes → [docs/ai/known-fixes.md](docs/ai/known-fixes.md) — check before any bug hunt.

## Deploy & validation

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts && npm run docs:wiki:check
```
