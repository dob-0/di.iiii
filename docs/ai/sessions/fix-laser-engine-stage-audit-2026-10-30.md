## 2026-10-30 — Laser engine: stage-audit safety fixes (rows 8, 9, 33, 34, 36)

- Off is always sent: Disarm-all and Blackout no longer skip the output-off when the engine thinks it is disarmed, and a new socket sends output-off twice to every addressed cube.
- A raw point outside -1..1 is blanked and counted in setFrame (it used to be clamped lit onto the field edge).
- After a still-beam, frame-too-long or over-temperature stop the cube stays dark until Release, On or a new Go (`go: true` on the frame post). A no-frame stop resumes by itself only within 2 s for the same Out, else the cube is disarmed. `stopResume: "legacy"` in laser.json keeps the old rule.
- A no-Origin, no-Referer POST that makes light (arm on, frame, alive, show) needs the local token (`<data>/laser/.token`, 0600, header `x-laser-token`). Stops stay open. The sign-off phrase is unchanged.
- Blanked/dropped counts are kept per cube (`pointLoss` in the engine state).
- Not done: the desk does not yet send `go: true` on its Go (desk code is not on this base), the engine is still built on the first request and not at server start, nothing was tried on a real cube.
