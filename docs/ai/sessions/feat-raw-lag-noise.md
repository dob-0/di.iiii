# Frame memory + Lag + Noise (plan 3.2 + 3.4)

## What changed

- **createFrameMemory()** — between-pass node state, the infrastructure the
  audit called for (plan 3.2): a per-WINDOW Map injected via
  createNodeGraphContext, never React state, cleared when the document
  changes. null stays legal — memory-less evaluation (tests, one-off reads)
  makes remembering nodes answer as if every frame were their first.
- **signal.lag (Lag)** — exponential glide toward its input, frame-rate
  independent (k from real dt), the FIRST consumer of frame memory. The
  anatomy sheet carries its OWN memory — sharing the room's would write it
  twice per frame at two different clocks and corrupt the glide.
- **value.noise (Noise)** — smooth value noise over the document clock,
  deterministic in (now, speed, variant): every window and /out see the
  SAME wander. The variation input is Variant ("seed" is banned copy).
- **CLOCK_DRIVEN_TYPE_IDS** — the rAF gate (and the show-clock stamp) now
  arms for Lag and Noise too, not just Time; both read context.now.

## Verified

Lag glide maths (1s at lag 0.5 closes 1−e⁻² exactly), Noise determinism +
range + frame-to-frame smoothness, no-memory fallback; family count 18→20;
full suite 2512/2512; lint at baseline; cards + inspector LOOKED at
(screenshot read). Example graph gains both (Lag smooths the sine).
