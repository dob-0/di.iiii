## 2026-09-30 — the ground versions are too dark: eight movers become the real lights

- Owner looked at minimal-ground: "too dark". Measured: the versions' 8 real lights were truss statics, most at level 0 at rest; all 23 moving heads and both lasers were beam-only, so the main light of the scenes lit no surface, and no wash was baked ("baked washes: 0").
- `budget.realLights` (rig-lib `realIndices`) now gives the real lights to movers: 3 of 7 backstage UP-B380F, 2 of 6 column UP-B380F, 2 of 6 UP-250BSW along the walls, 1 column PAR — 8 in all, so the browser budget and the shadow-safe limit (12) hold. The rest of the PARs are beam-only with their light baked as a wash.
- Applied to the owner's install with `rehang.mjs --rest gs-white-cathedral` on both ground projects (cue lists and scenes untouched) and `rig.mjs --wash-only --look gs-white-cathedral` (10 washes baked into one mesh each). Backup: `step-11/data/moxir-before-real-lights.diiii`.
- Ground tests pass (37/37); `versions.mjs --check` current.
- Not seen on a real screen. A wash is baked per look (white-cathedral now); other scenes have real mover light but no baked wash for the PARs until re-baked per look. Reflections the owner mentioned are not investigated.
