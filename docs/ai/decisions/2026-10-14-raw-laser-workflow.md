# 2026-10-14 — Nodes laser workflow: the owner's decisions

## The owner's words (2026-10-14)

> "i want to more than what i had in td so td + new things there so go" · "yes we need to all alll all ways :)" · "yes i want to all"
> "4 we need to keep our resears for future work so we have lexicon and managed things so we need to full di.iiii control"

(Verbatim, as typed in the session, 2026-10-14.)

(Ledger N645, N645.4. "Raw" is the route; the canvas is called **Nodes**, see `vocabulary.md`.)

## What was decided

1. **Scope and order.** All 10 phases of the design, in order 1, 2, 3, 4, 5, then 6-10. Design: `docs/ai/research/raw-laser-workflow-design-2026-10-14.md` (section 5 lists the phases).
2. **Draw modes.** Outline, wireframe (every edge) and points are all selectable; outline is the default. (Answers design question 1.)
3. **Clock, TouchDesigner-style.** One master clock loop runs; LFOs follow it by default. Extra clocks can be added and an LFO can pick its clock (maximum flexible). The `/light` desk's clock and tap are an optional source, not the leader. (Answers question 2, and replaces the design's default that the desk leads.)
4. **Point budget.** Controllable from the visuals: a wireable input, an on-screen control, and an automatic value from path length, always clamped to the server's frame cap. (Answers question 3; the design's fixed default of 1000 is only the starting value.)
5. **Managed in di.iiii.** Cube groups live in the project; `laser.json` is safety-only; research lives in this repo under `docs/ai/research/`. (Answers question 4.)
6. **Safety.** Path guards are server-side (PR #931); no graph node can arm or loosen a guard; one sender per cube (Phase 6 lease).
7. **Order after Phase 1** (question 5) follows the design's default: Beat + Oscillator, Animation, path ops, audio.

## Research this rests on (all in `docs/ai/research/`)

- `laser-guards-wicked-nannou-2026-10-14.md`, `laser-guards-ofx-openlase-helios-2026-10-14.md`, `laser-guards-touchdesigner-2026-10-14.md`: how hosts protect galvos.
- `laser-raw-gap-audit-2026-10-14.md`: pro laser tools against Nodes.
- `raw-laser-workflow-design-2026-10-14.md`: the design.
- `laser-guards-pr931-record-2026-10-14.md`: what PR #931 built and measured.
- The Phase 1 trace bench (`raw-laser-trace-bench.mjs`) lands with the Phase 1 PR, not here.

## Unvalidated

Nothing here has run. Each phase is accepted only after its tests and a look on the real wall (the two LaserCubes on aylmo, armed by the owner), as the design's phase table says. The flicker limit for point counts is to be judged on the wall.

## Words added

master clock, clock, cube group, draw mode, point budget (`vocabulary.md`, 2026-10-14). Phase 1's own words come with its PR.
