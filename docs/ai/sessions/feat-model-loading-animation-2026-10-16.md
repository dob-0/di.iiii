# The place is loading — an animation while models load (2026-10-16 19:1x)
**Asked:** "just create loading animation where we will see the animation" (after the Studio showed lamps and no hall for ~2 min at 18:19).
**Built:** modelLoads.js becomes watchable (subscribeModelLoads / getModelLoadSnapshot: a wave's loading/done/total); ModelLoading.jsx in StudioViewport (the room page draws through it):
"Loading the place · 2 of 5" with three stepping cyan squares and a moving 2 px line, in the coach's box style; gone when the last model is in; no motion under prefers-reduced-motion.
**Tests:** modelLoads.test.js, ModelLoading.test.jsx; vitest src/studio — 711 passed. **Not decided:** a time limit per model download (not asked).
