# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session

- Sync-safety pass: rescue, seal, and the structural fix

Full detail: `PROGRESS.md`.

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
