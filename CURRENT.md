# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session (2026-08-06 — Beta retired; one node lane, mid-consolidation)

- Beta (`src/beta/`, 41 files) deleted — a verbatim fork of Raw (`RawHub.jsx`/
  `BetaHub.jsx` differed by 0 lines), already unreachable except one V1 dropdown.
  `beta-v2`-tagged projects keep the label as provenance, no DB migration needed.
- Studio's read-only previews imported `BetaGraphSurface`/`BetaViewport`
  directly — repointed at Raw's equivalents first, or Studio's build would
  have broken silently (writeup + a second bug found alongside: `docs/ai/known-fixes.md`).
  Docs updated to match: `PROJECT_SURFACES.md`, `RECURSIVE_NODE_CORE.md`, `AGENTS.md`,
  `src/raw/AGENTS.md`, `MANIFESTO.md`. lint/build/1692 tests green.
- **Not done yet, same plan**: rebase `feat/raw-studio-node` (worktree
  `~/di.iiii-studionode`, unpushed) onto this, then promote Raw to the default
  new-project surface. Plan: `/home/nooo/.claude/plans/sunny-growing-canyon.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **Lane consolidation in progress** — Studio-as-a-node rebase + Raw-as-default promotion pending, see Last session / plan file above.
- **Real-browser looks owed**: `source.webcam`/`source.mic` (camera+mic needed) +
  PR #93's 4 items (Inspector wheel-scroll, audio toggles, primitive clamping).
- 8 prod spaces still ownerless (staging verified end to end; prod gets it next
  promotion); releasing ownership doesn't revoke the scope it granted (deliberate).
- **Mesh gate INERT in prod** (no `MESH_ROOM_SECRET`); **leaked GitHub PAT +
  staging Google OAuth secret still live**, 13 dead secrets to revoke.
- Owner's/artist's calls: `open`'s card blank, director page unseen, purple-gap
  check fails, `br_id_ge ▾` chip covers letter-row. `feat/timeline-core` UNPUSHED.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
