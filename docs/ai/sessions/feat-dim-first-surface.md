## 2026-09-20 — a new projection surface starts on a dim warm name card, not a white grid

The owner's standing rule is absolute: never put white on the projector, warm colours only.
He set it in a club at midnight after a white test card hit the wall. The last place white
survived was the first thing a newcomer meets — pressing **Add** in Projection made a surface
whose source was `test`/`grid`, the bright alignment grid. On the two-machine rig the desk and
the wall are different machines, so that grid is on the projector from the instant the button
is pressed, before anyone has chosen what the surface shows. The newcomer walk caught it twice;
the "no file yet" placeholder that landed the same day fixed the empty video/image case only.

- New pattern `card` in `mapTestPattern.jsx`: the surface's own NAME in deep amber `#8f5a17`
  on near-black `#0a0704`, a dim frame and amber corner ticks. Nothing it draws goes above
  ~38% luminance and no ink is anywhere near white. It names itself so somebody aiming three
  projectors one at a time can tell the surfaces apart, and it needs no tuning.
- That card is the default for a new surface: `defaultMappingSurface.source` is
  `{ kind: 'test', ref: 'card' }` (both schema copies), `addSurface` writes it into the
  document, and a test source with an empty `ref` renders it too — so the HTTP op route, an
  import and an older desk all land on the card rather than the grid.
- **A `ref` and not a new `source.kind`, deliberately.** `MAPPING_SOURCE_KINDS` is a closed
  list and `normalizeMappingSurface` replaces a kind it has not heard of with the default: an
  older build opening the project would have rewritten a `card` KIND to `test` and destroyed
  the choice for good. A `ref` is a free string — an old build keeps it byte-identical and
  merely draws a grid meanwhile.
- **The grid is untouched.** Same white, same brightness, same place in the Pattern picker,
  because a person on a ladder tracing geometry onto paper needs it as bright as the projector
  can make it. Only what a surface is BORN on changed.
- Seen, not reasoned about: desk right after Add, `/out` with that fresh surface, the same
  surface switched to the grid on purpose, and two fresh surfaces side by side — 1440x900, in
  a throwaway space `dim-first-test`, in `~/Downloads/dim-first/`. Sampled by script on the
  `/out` shot of the fresh surface: **max luminance 96.4/255 (37.8%), 0 pixels with
  min(r,g,b) > 200**. The same surface on the grid: 255/255 and 7,574 near-white pixels.

Not verified: a real projector in a real dark room. Everything here is a browser at DPR 1 on
aylmo — the numbers say what the signal carries, not what the wall reflects.
