# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session (2026-08-06 — Raw stabilization + source.webcam)

- Raw node graph audit: `computeNodeOutput` only handled `value.*`/`math.*`/`time` (any
  `geometry`/`texture`/`signal`/`state` output was a dead wire), ~20 ports had zero consumers,
  and a "Streaming Prototype" preset bypassed the palette gate. Killed the preset + dead ports,
  made `universe.world.title`/`.bgColor`/`geom.cube.bounds` genuinely wire-evaluated.
- Implemented `source.webcam` (backlog #2): `getUserMedia` capture wired into `geom.plane`'s new
  `texture` input via a new `liveOutputs` graph context (live values that can't serialize into
  `node.values`). **Not visually verified** — no camera-equipped browser session this run.
- Both changes: lint/build/1669 tests green, pushed to `dev`. Prior session (bug sweep, PR #93,
  9 real bugs fixed) is in `docs/ai/known-fixes.md` and `PROGRESS.md`, not repeated here.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **Real-browser looks owed**: `source.webcam` (capture/preview/plane-texture wiring, camera
  needed) + PR #93's 4 flagged items (Inspector wheel-scroll, audio toggles, primitive-shape
  clamping, Beta Help copy) — all merged/shipped unseen by human eyes.
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
