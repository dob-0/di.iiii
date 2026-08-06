# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session (2026-08-06 — bug sweep merged via PR #93, then promoted to main)

- 5 parallel agents (UI/UX, 3D/Viewport, Backend/API, Schema/Protocol, Node System) found and
  fixed **9 real bugs** off fresh `origin/dev`, each with a watched-failing regression test —
  full list in `docs/ai/known-fixes.md`. Worst: a Socket.IO connection never re-checked DB
  auth after handshake, so a revoked/downgraded user's open tab kept full space access.
- Full validation green (lint/build/1721 tests/77 contract tests). **4 of the 9 — Inspector
  wheel-scroll, audio toggles, primitive-shape clamping, Beta Help copy — are not yet seen
  in a real browser** (Chrome tool wasn't connected this session).
- `dev` promoted to `main` (fast-forward), deployed, and verified live at di-studio.xyz.
- Session-hygiene tooling landed: `npm run state` reports branch/worktree/promotion facts
  live so CURRENT.md stops carrying them; `docs:ai:check` now bans SHAs and ahead/behind
  counts here and flags a stale (unrecapped) file. See the golden rule.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **PR #93's 4 flagged items still need a real-browser look** (desktop + phone) — merged, but unseen.
- 8 prod spaces still ownerless (staging verified end to end; prod gets it next promotion);
  releasing ownership does not revoke the scope it granted (deliberate, not a full undo).
- **Mesh gate INERT in prod** — code live, no `MESH_ROOM_SECRET` set.
- **Leaked GitHub PAT + staging Google OAuth secret still live**; 13 dead secrets to revoke.
- Owner's/artist's calls: `open`'s card blank, director page unseen, purple-gap check fails,
  `br_id_ge ▾` chip covers the letter-row.
- `feat/timeline-core` is UNPUSHED and checked out nowhere, well behind `dev` — land
  deliberately, `chromeLayout.test.js` guards the old two-corner chrome regression.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
