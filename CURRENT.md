# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session (2026-08-11)

- Promotion #141 deployed to prod: storage fix (#136) + mesh room history hub (#140). Run sat stuck in GitHub's queue ~45min — cancel+rerun fixed it.
- Kept room switched ON both tiers (`MESH_HISTORY_CHANNELS=talk,keeper:say,keeper:ask`, container-printenv-proven); prod field SEEN desktop+phone at real DPR.
- Estate housekeeping complete: 6 finished worktrees reaped with their merged branches, `dev` freed from its holder (detached), all 3 stashes backed up to `~/di-backups/stashes/` and dropped (stack empty).

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **Lane consolidation in progress** — Studio-as-a-node rebase + Raw-as-default promotion pending, see Last session / plan file above.
- **Real-browser looks owed**: only `source.mic` remains — macOS TCC blocks even
  fake-device audio headless; run `npm run verify:capture` on Linux or do the 30s
  human check. Webcam verified 2026-08-13 (same script); PR #93's items are all
  closed (wheel-scroll verified live on staging `/open?ui=show` — the "dead render
  path" claim was wrong, see known-fixes; clamping's malformed-JSON path has no UI
  route and rests on its unit tests).
- All 8 prod spaces owned (queried prod 2026-08-08); releasing ownership doesn't
  revoke the scope it granted (deliberate). Mesh gate ARMED both tiers; leaked
  PAT inferred-closed; **staging Google OAuth secret parked by the user** —
  rotation script staged, see memory `reference-leaked-secrets`.
- **Nothing watches free disk** except di-bo now; no per-space or per-account byte quota exists
  anywhere, and no ENOSPC pre-check — writes run until the volume physically fills.
- Owner's/artist's calls: `open`'s card blank, director page unseen, purple-gap
  check fails. `feat/timeline-core` is PR #100 (dead ports being stripped).
- **br_id_ge rite fixes unverified by a human** — Act III backdrop + Act V idle-motion CSS shipped live, page loads clean, but the acts are camera-gesture-gated so no automated check could actually see them render.
- **Prod room append path unproven** — record is empty by design (no backfill); the first real spoken line on di-studio.xyz/br_id_ge/field is both the proof and the room's first memory.
- **Tunnel telegram first-binding untested by any human** — needs a telegram account with NO prior @diiii111bot chat.
- Remaining trees, each with a reason: raw-ws (active session), inscription-mark / rawadmin / design-loading-unify / agents-upgrade (unmerged work — park or PR, owner's call).
- Owner decisions prepared with evidence (2026-08-13): `open`'s blank card =
  no `publishedProjectId` (forwards to open-jam) + no cover; the honest captured
  frame is a near-empty teal viewer — decide: upload it, dress the jam scene
  first, or a structural alias-preview. Purple-gap = the reel-globe world
  `#04050A` (hue 230), left as the artist's since 632c649b, uncovered by CI —
  decide keep-as-exception (then add guard) or recolor (≈`#04080A`, 4 sites).

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
