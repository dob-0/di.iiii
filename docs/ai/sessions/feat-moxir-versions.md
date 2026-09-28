## 2026-09-28 — MOXIR in three rig versions (minimal · middle · full), and the lamps' bodies in every room

Branch `feat/moxir-versions`, from `preview/rig-builder-2026-09-28` (ff216556). Not deployed: the
owner's install was left alone (another agent was installing rigbuilder.4); a deploy is scheduled
by the coordinator. Split for landing:

| commit | belongs on |
|---|---|
| fix(rigbuild): every room draws the lamps' bodies; load-plot keeps the baked wash | #622 (bodies) / #607 (load-plot) |
| feat(place): strobe, blinder and hazer planning types, with bodies | #624 |
| feat(rig): a look's levels, truss-less rigs, mirrored offsets | #587 (rig-lib) / #624 (looks, schema) |
| feat(rigbuild): MOXIR in three versions | #587 / #624 |
| feat(rigbuild): versions live as projects of the space, with a switch | #587 (rig-lib, rig.mjs, rig-look) / #624 (switch, schema) |

**Bodies.** The owner on `/moxir` (rigbuilder.3): lamps showed as bare cones — load-plot had
deleted the baked body mesh and only view A drew bodies. `RigBodies.jsx` (lazy) now draws the same
instanced `FixtureBodies` in the space view (LiveProjectScene), the Studio and the plot/cards rooms
(StudioViewport). `load-plot.mjs` keeps `rig-wash`. Guard `src/rigbuild/rigBodies.test.js`, seen red
both ways; known-fixes row.

**Versions.** Method and decisions: `docs/architecture/RIG_BUILD.md` §15. A version is a project;
`components.rigVariant` ties the set; a switch in the space view. Design file
`scripts/place/rigs/moxir-versions-2026-10-17.json` (sources for the brief: Atmosfera Mag,
Mixmag 2018 — Printworks' Simeon Aldred, Dazed 2016, Wikipedia Berghain/Bassiani/Tresor; four rules
marked design hypothesis — web search budget exhausted; RA/Vice pieces confirmed to exist, owed).

Own stack: server :4411, vite :5411 (not 4000/443/80/4371/5371/4383/5383/4391/5391/4395/5395),
data a `di save moxir` copy imported as space `mxver-moxir` into the session scratchpad. GPU renders
through `scripts/rigbuild/versions-render.sh` under the shared browser lock; renderer string checked
(ANGLE/Vulkan, RTX 3080 Laptop). Comparison page `~/Downloads/moxir-versions/versions.html`.

Tests run (targeted, 2 workers): src/rigbuild, scripts/place, scripts/rigbuild, schemaSync,
PublicProjectViewer, wiki — 42 files / 523; viewport + live scene 21 files / 201. Lint: 0 errors.

Owed: see RIG_BUILD.md §15.5.
