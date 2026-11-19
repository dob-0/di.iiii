## 2026-11-20 — the mapping desk, one version: dev plus the bar desk as it ran (PR #1321)

- Rebuilt PR #1321's two commits on today's dev: the bar desk as it ran (screens and clips, Output and Preview monitors, 61 effects, an LFO on every setting, HTML visuals), then the 11-12 audit fixes. The audit commit is still separate, so it can be dropped alone.
- Conflicts kept dev's upload rules (uploadPolicy.js) and added HTML there; test hosts follow dev's host; two jsx-a11y lint errors fixed.
- The warp-points draft (#627) is not folded in: it rewrites the same map files. It stays on its own PR; folding it is a separate decision.
- Tests on di-work: the map tests pass, full lint passes. Not done: a headless picture of the desk at real screen sizes; seven other map branches ahead of dev were listed, not reviewed.
