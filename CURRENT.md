# Current State

**Every AI reads this before anything else. ≤50 lines. Read in full.**
Updated at the end of every session. Replace content — do not append.

active_branch: dev
lanes: `dev` → staging.di-studio.xyz (rehearsal) · `main` → di-studio.xyz (live)

---

No commit SHAs or branch positions below — run `npm run state` for those; see
`docs/ai/golden_rules.md` for why. Agents share this tree: **stage explicit paths**.

## Last session — 2026-08-11

- Deep audit of Raw ("combined workspace, code view, full multimedia"): the gap is
  **UI, not architecture** — `setPresentationState`/`setPublishState`/`upsertAsset` are
  real ops with inverses no Raw component emits. Plan: `docs/architecture/RAW_WORKSPACE.md`.
- Structural absences named: no scheduler, no way to define a node from inside the
  graph, ops not emitted. Sandbox settled: QuickJS-in-WASM, measured on this machine.
- Built §5.1's first half — `src/project/graph/livePorts.js`, a registry carrying a
  *reason* per port (idle/starting/live/denied/unavailable/error), 31 tests; webcam
  and MIDI panels report through it.
- Seen, not just tested: Raw at 1440×900 on prod **and** off this branch — 40 nodes,
  all wires, zero console errors, identical.

Full detail: `PROGRESS.md`.

## What works

Studio (six panels + phone), Raw, WCC, viewer; auth (session-cookie, roles, OAuth-first)
+ open-space/sandbox grants; Open Jam and vanity links; deploy by push; nightly VPS backups.

## Open

- **Lane consolidation in progress** — Studio-as-a-node rebase + Raw-as-default promotion pending, see Last session / plan file above.
- **Real-browser looks owed**: `source.webcam`/`source.mic` (camera+mic needed) +
  PR #93's 4 items (Inspector wheel-scroll, audio toggles, primitive clamping).
  **Now also the live-port statuses** — `PORT_STATUS` reaches the graph and
  *nothing renders it on a node card yet*, so the contract is proven by tests only.
- **§5.1 is half built.** `registerProvider()` + `capabilities()` — the half a
  bridge needs — unwritten; no scheduler, no per-node state, evaluation is still
  React render. Then, in order: a `code` node whose ports come from its source
  (QuickJS); port promotion; Raw emitting the page+asset ops it already has;
  automation. All in `docs/architecture/RAW_WORKSPACE.md`.
- **`feat/graph-runtime-contract` unpushed** in worktree `~/di.iiii-raw-ws`.
  Pushing fires `auto-pr.yml` → PR against `dev`.
- All 8 prod spaces owned (queried prod 2026-08-08); releasing ownership doesn't
  revoke the scope it granted (deliberate). Mesh gate ARMED both tiers; leaked
  PAT inferred-closed; **staging Google OAuth secret parked by the user** —
  rotation script staged, see memory `reference-leaked-secrets`.
- **Nothing watches free disk** except di-bo now; no per-space or per-account byte quota exists
  anywhere, and no ENOSPC pre-check — writes run until the volume physically fills.
- Owner's/artist's calls: `open`'s card blank, director page unseen, purple-gap
  check fails. `feat/timeline-core` is PR #100 (dead ports being stripped).
- **br_id_ge rite fixes unverified by a human** — Act III backdrop + Act V idle-motion CSS shipped live, page loads clean, but the acts are camera-gesture-gated so no automated check could actually see them render.
- Staging deploy pending as of session end — GitHub Actions infra was degraded (stuck queues across unrelated branches too); check `gh run list --repo dob-0/di.iiii --branch dev` before assuming it landed.

## Deploy & validation — [docs/ai/known-fixes.md](docs/ai/known-fixes.md), check before any bug hunt

```bash
git push origin dev        # → staging   ·   git push origin main  # → prod
npm run lint && npm run build && npm run test -- --run && npm run test:server-contracts
```
