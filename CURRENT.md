# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session (2026-08-06 — Raw stabilization + source.webcam + source.mic)

- Raw node graph audit: `computeNodeOutput` only handled `value.*`/`math.*`/`time` (any
  `geometry`/`texture`/`signal`/`state` output was a dead wire), ~20 ports had zero consumers,
  and a "Streaming Prototype" preset bypassed the palette gate. Killed the preset + dead ports,
  made `universe.world.title`/`.bgColor`/`geom.cube.bounds` genuinely wire-evaluated.
- Implemented `source.webcam` + `source.mic` (backlog #2/#3): `getUserMedia` capture through a
  new `liveOutputs` graph context (values that change every frame, so they skip `node.values`
  to avoid spamming the op log). Webcam feeds `geom.plane.texture`; mic's levels are throttled
  (~10/s) into the graph. **Not visually verified** — no camera/mic-equipped session this run.
- lint/build/1701 tests green, pushed to `dev`. Prior bug-sweep session (PR #93) is in
  `docs/ai/known-fixes.md`/`PROGRESS.md`, not repeated here.

## What works

Studio (six panels + phone), Beta, Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **Real-browser looks owed**: `source.webcam`/`source.mic` (capture/preview/wiring, camera+mic
  needed) + PR #93's 4 flagged items (Inspector wheel-scroll, audio toggles, primitive-shape
  clamping, Beta Help copy) — all merged/shipped unseen by human eyes.
- 8 prod spaces still ownerless (staging verified end to end; prod gets it next promotion);
  releasing ownership does not revoke the scope it granted (deliberate, not a full undo).
- **Mesh gate INERT in prod** (no `MESH_ROOM_SECRET`); **leaked GitHub PAT + staging Google
  OAuth secret still live**, 13 dead secrets to revoke.
- Owner's/artist's calls: `open`'s card blank, director page unseen, purple-gap check fails,
  `br_id_ge ▾` chip covers the letter-row. `feat/timeline-core` UNPUSHED, well behind `dev`.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
