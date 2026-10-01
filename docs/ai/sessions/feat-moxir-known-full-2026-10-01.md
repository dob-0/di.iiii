## 2026-10-01 — MOXIR "Known · full": every known fixture at stock on the cut, and new light forms for a real night

- Owner and Gevorg on PONYO: "now lets use all knowns and make all possible stage design best light forms". Crane height approximate and strobe rates assumed for now ("we will correct in future"); charts for the rest come later.
- New candidate `known-full` (candidateOf full) on the crane cut. Nothing that moves is hung:
  - The cut carries statics only: 6 UP-PL5403 in the X, 4 on the bridge, and 2 fixed UP-LA40WF, held dark until the laser sign-off.
  - The floor carries 17 UP-B380F: 7 behind the press and 10 at the nave column bases, plus 1 spare (18 of the 18 in stock).
  - 32 UP-PL5403 go up the nave columns and 3 at the press, so 45 of the 50 PARs are used.
  - 6 hazers and 4 smoke are kept off DMX (policy.dmx.offDmx).
- Tried and dropped: 4 booth-flank beams (beam380-flank). The crane is parked over the booth at z 4.8 m, so a vertical beam there fires into it; the versions safety test caught it in every look.
- 15 looks:
  - From full-ground's ground scenes, re-mapped: par-columns-8 → par-columns (32), beam380-columns-6 → beam380-columns (10); the removed types drop out.
  - New:
    - **Doors**: dim amber column feet.
    - **The X**: the X of PARs on the DJ, the column beams crossing high in an X. Steepened until no beam crosses the aisle below 2.5 m.
    - **Tunnel**: column beams leaning 34° in, meeting in an arch high over the floor.
    - **Green core**: MOXIR green up the columns and the press, a narrow white fan.
    - **Amber dust**: amber columns and bridge, no beams.
    - **Lights up**: warm white at full, the clean-out light.
- The palette gains MOXIR green `#3c8244` (sampled from the announcement video), as one accent. This is why every generated rig file changes: they carry the palette.
- ground-movers.test: known-full is a GROUND_SUBSETS entry and passes the ground-only policy in every look.
- Validation: versions.test and ground-movers.test for known-full, 81 passed: hangs every fixture, nothing into the crane or through the DJ, every head within its travel, lasers ≥ 3 m and rising, ≤ 8 real lamps, mirror-symmetric, no mover beam in the eye zone.

## 2026-10-01 (later) — every lamp a real light; rebased on dev for the push

- Emily, looking at the room: "i want real simulation of the light", then "no i want to 100% ident what we will have, you can optimize". Known · full (64 lamps) and Known (36) now carry `realLights` for every group: no picked few, no baked per-look stand-ins. Shadows ride on feat/room-shadow-cap-2026-10-01 (the twelve brightest lamps throw). Measured on PONYO, shadows on: Known · full 61–65 fps on the RTX 5060 (emily-41); 36–49 fps (Known · full) and 58–75 fps (Known) in Playwright Chrome, most likely on the AMD 860M iGPU.
- The patch step counts devices run by hand apart ("36 of 36 addressed · 10 by hand"), carried here from the off-DMX work.
- Room setup used on PONYO (data, not in git): both known rooms take their hall from `moxir-hall-minimal` (`load-version --hall-from moxir-hall-minimal`), whose glb has the nave crane parked over the DJ where the cut hangs. `moxir-hall`'s glb has it at the far end. They rest on a look with no solo (k-tunnel, gs-cross-beams), have work light 0.35, and carry authored Floor/DJ views looking down the hall.
- This branch now stacks the whole MOXIR line: tested charts, Known, off-DMX, Known · full. Rebased on dev e244f802 without conflicts; `versions.mjs --check` is current after the rebase.

## 2026-10-01 (later) — one name per look on the desk; a swap clears the other room's looks

- Found when emily-41 fired `rig-white-cathedral` (the set's hung-rig look) for the ground look of the same name. Emily chose: rename, keep both, and clear on swap.
- Known and Known · full retitle the set's five looks "… · hung rig" (candidate `looks.<id>.title`; `looksWhy` says why). Gevorg's own rooms keep their titles.
- show-loop.mjs: after adding this room's looks, it removes the desk's `rig-` looks this room does not have (`staleDeskLooks` in src/rigbuild/looks.js). Operator looks have no prefix and are kept. A layer left on a removed look is emptied by the desk, not deleted.
- Tests: looks.test +1 (red on the old code); versions, ground-movers and bridle tests 459 passed.
