## 2026-09-28 — view C, the cards: `/{space}/cards/{project}`

- The owner chose all three build views. B was done first; C is sketch C in
  `~/Downloads/moxir-build-sketches/sketches.html`. Method and what was checked are in
  `docs/architecture/RIG_BUILD.md` §11.
- Stacked on #609 as four draft PRs: `feat/rig-cards` (the rental list and the cards),
  `feat/rig-cards-deal` (positions and the deal), `feat/rig-cards-patch` (the patch bars),
  `feat/rig-cards-cues` (the looks on the cue list, the room follows).
- New data in the document, both schema copies with parity tests:
  - `components.rentalList`, from `scripts/rigbuild/rental.mjs`;
  - `components.rigLooks`, from `scripts/rigbuild/looks.mjs`.
  Both live on the `rig-show` group entity.
- The cue model is the project's own: `mappingState.cues` fired through `fireCue`. A cue
  names the desk look `rig-<look>`. No parallel cue model.
- The desk: `GET /light/api/dmx` now carries the looks that are on. The room poses by
  them (`useRigLookEntities`, used in `StudioSceneContent`), which is a view only.
- Fixed on the way: the mirror drew owed-channel lamps white. Known-fixes row added;
  the guard was seen failing without the fix.
- The MOXIR test ran on an own stack:

  | item | value |
  |---|---|
  | server / vite | :4383 / :5383 |
  | data | a copy exported from the local tier after the re-centring (70dbdd95), in the session scratchpad |
  | setup | `load-plot.mjs --pieces-only`, the rental list, the looks |

  Results:
  - The whole list was dealt in the UI: 104/104 placed.
  - 46 fixtures patched in U1 and U2; three types have their mode owed.
  - A test conflict was resolved from its bar.
  - GO ×5: the desk reported each look in turn.
  - On the RTX 3080 the room followed all five looks at 60 fps. The phone was checked in
    portrait and landscape.
- Thermal:
  - 2D shots were taken headless with `--disable-3d-apis`.
  - The room was shot only in a headed Chromium, `PRIME` + `ANGLE`/Vulkan, with the
    renderer string checked first.
  - The first GPU attempt, with ANGLE flags and no PRIME env, got **no WebGL** and stopped
    itself. The PRIME env plus `--use-gl=angle` from `rig-look.mjs` is what works.
  - The package reached **97 °C** after two back-to-back phone GPU runs (83 °C before the
    second). GPU work stopped there; wait longer between runs.
- Shots: `~/Downloads/rig-cards/`.
- Owed:
  - the channel lists (so the desk looks are empty of DMX values);
  - per-project desk look ids;
  - console GO once #599 lands;
  - dealing by drag;
  - bodies per lamp.
