## 2026-10-01 — MOXIR "Known · movers on the ground": only the fixtures whose DMX is known, plus haze and smoke

- Owner, on PONYO with Gevorg present: "lets work only with the known ones and with hazer and smoke but keep them out of dmx".
- New candidate `known-ground` in scripts/place/rigs/moxir-versions-2026-10-17.json, built from `full-ground`. It keeps the same truss (the cut), room and ground-only mover policy, and has 46 units:
  - 13 UP-B380F and 21 UP-PL5403 (channel maps TESTED on the rental units, branch feat/moxir-tested-charts-2026-10-01, which this is stacked on).
  - The 2 UP-LA40WF (held dark by the laser gate).
  - 6 hazers and 4 smoke machines, recorded in `policy.dmx.offDmx` as kept off DMX.
  - Out until the charts arrive: COB200 curtain, UP-250BSW, UP-HK1915, CO2, sparks.
  - 13 looks: full-ground's with the dropped groups stripped. gs-spark-hit, strobe-hit and gs-blinder-hit are dropped because their only fixtures (sparks, strobes, blinders, COB) are not in this version; in review they came out as blackouts.
- The generated files are scripts/place/rigs/moxir-2026-10-17-known-ground.json and scripts/rigbuild/rentals/moxir-2026-10-17-known-ground.json. Every other generated file came out byte-identical apart from line endings, which are left untouched.
- Fixed `scripts/rigbuild/versions.mjs`'s main guard. `new URL(import.meta.url).pathname` is /C:/… on Windows and never equals the argv path, so the script silently did nothing there, and its `--check` passed without checking. It now uses fileURLToPath. The same guard is in 24 more scripts (grep `=== new URL(import.meta.url).pathname`); they were not changed here.
- ground-movers.test.js: known-ground is a policy-checked SUBSET (`GROUND_SUBSETS`). It must keep the ground-only rule (passes: no violations) but is not held to the two full versions' type list.
- NOT done yet: the "off DMX" rule is recorded in the version but not yet enforced by the patch. That comes after the load-time-write fix (fix/rig-pages-no-write-on-load-2026-10-01), which touches the same patch path. Loading the version into a project (load-version.mjs) is a data step on the local install.
- Validation (Windows): ground-movers 20/21 (the remaining failure is the analysis file's CRLF, baseline); versions.test fails only on CRLF (baseline); src/rigbuild has no new failures.
