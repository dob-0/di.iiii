# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

## Last commit

`dev` is at `92efc7bf` (staging GREEN); `main` LIVE at `0b4b2b7f`. **PR #93**
(`fix/bugsweep-2026-08-06` → `dev`) open, CI running, not yet merged.
Agents share this tree: **stage explicit paths**.

## Last session (2026-08-06 — bug sweep, worktree `bugsweep-2026-08-06`, PR #93)

- 5 parallel agents (UI/UX, 3D/Viewport, Backend/API, Schema/Protocol, Node System) found and
  fixed **9 real bugs** off fresh `origin/dev`, each with a watched-failing regression test —
  full list in `docs/ai/known-fixes.md`. Worst: a Socket.IO connection never re-checked DB
  auth after handshake, so a revoked/downgraded user's open tab kept full space access.
- Full validation green (lint/build/1721 tests/77 contract tests). **4 of the 9 — Inspector
  wheel-scroll, audio toggles, primitive-shape clamping, Beta Help copy — are not yet seen
  in a real browser** (Chrome tool wasn't connected this session).

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **PR #93 needs a real-browser look** (desktop + phone) on its 4 flagged items before/after merge.
- 8 prod spaces still ownerless (staging verified end to end; prod gets it next promotion);
  releasing ownership does not revoke the scope it granted (deliberate, not a full undo).
- **Mesh gate INERT in prod** — code live, no `MESH_ROOM_SECRET` set.
- **Leaked GitHub PAT + staging Google OAuth secret still live**; 13 dead secrets to revoke.
- Owner's/artist's calls: `open`'s card blank, director page unseen, purple-gap check fails,
  `br_id_ge ▾` chip covers the letter-row.
- `feat/timeline-core` UNPUSHED (5 ahead of `dev`, 51 behind) — land deliberately,
  `chromeLayout.test.js` guards the old two-corner chrome regression.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
