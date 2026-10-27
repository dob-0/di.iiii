## 2026-10-22 — Light v3 step 1.0: PROVEN.md and the change-based checker

- Owner asked for one combined, checked Light ("v3"); plan `agent-reports-2026-10-22/light-one/PLAN.md` §3. This branch adds `serverXR/src/lighting/PROVEN.md` (one row per feature: gate, look, proven date and commit, files watched, evidence) and `tools/proven.js`, which re-runs a gate only when that feature's files changed since its proven commit.
- Recorded as already proven: desk core and laser, at the MOXIR night of 2026-10-17, with evidence links. Both read "changed" today, which is true: code moved since.
- Vocabulary: the Light row said "patch, scenes, cues"; the desk's saved states are looks, and scene means the 3D place.
- Owed: wiring the checker into CI; each later step adds its own row only after its gate and its look.
