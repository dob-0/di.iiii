## 2026-10-05 — versions-audit reads the MOXIR code ids through a listedAs map (audit D2)

- The audit `scripts/production/versions-audit.mjs --production moxir-2026-10-17` exited 1 on today's data: the
  versions file names `ordered`, `known-full`, `known-ground`; the list (the record) holds `ordered-live-lamps-09-29`,
  `known-full-ponyo-10-04`, `known-ground-ponyo-10-04`.
- The builder's ids are rig file names and project marks, so they stay. `scripts/place/rigs/moxir-versions-2026-10-17.json`
  gains `listedAs` (code id to list id); `codeVersionIds` in `scripts/production/derive.mjs` reads through it. A missing
  version still exits 1, named by its list id.
- Test: `scripts/production/versions-audit.test.js`, "D2: the real versions file's ids ...". Failed before the fix.
- Owed: run the audit with the dev side (needs the dev token) after landing; wiring the audit into CI.
