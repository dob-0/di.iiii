# preview/rig-builder-2026-09-28 — the rig builder, installed on the owner's machine as a PREVIEW

Not for merging. A preview branch so the owner can try views A, B, C and MOXIR on his own
install (owner, 2026-09-28: "ok so yes go next"; "we will mb use the artnet").

## What it is

`origin/dev` (6d415945) + merges, no squash:
- `feat/rig-build-3d-crew` — the whole draft stack #587 → #594 … #602 → #607–609 → #613–616 → #619–622;
- `feat/moxir-hall` at 70dbdd95 — the three hall commits (v2, DJ booth, centred) that landed on #587
  AFTER the stack was cut, so the stack top did not carry them;
- `feat/dmx-input` (#599) and `fix/sacn-universe-one` (#603).
Conflicts: `src/RootApp.jsx` (dev's Kit replaced ToolsRoom — kept KitPage + the four rigbuild
surfaces), `lighting.test.js` (both new desk suites), wiki tags (#599's superset), notes (both kept).
PR #606 had NOT landed; not merged here.

Two commits of its own:
- `test(rigbuild)`: lookRules' parity loop compared `backdrop` on a stage with none — only reachable
  once 70dbdd95 is under the stack; now compared on MOXIR's shape (press behind the booth).
- `fix(rigbuild)`: plot / sheet 1 / view A said "console in: not on this build" and the patch sheet
  said sACN sends U1 as the reserved 0 — false with #599 and #603 merged. Now read from the desk
  (`src/rigbuild/deskState.js`). Guards red on the old files; known-fixes row. **Carry this into the
  stack when #599/#603 land** (it belongs on #609/#620 once they sit on a dev that has input).

Tests run (targeted, `--maxWorkers` 3–4, never the full suite): src/rigbuild + rigMirror + routing +
schema 427, scripts/place + scripts/rigbuild 140, lighting desk suites (test, wiring, http, rigpatch,
dmxin) + schemaSync 54, Studio/wiki/scene 103 — all green. Lint: 0 errors.

## The install

`0.4.16-rigbuilder.2` via `di update --from` (rigbuilder.1 first, then .2 with the fix). Backups,
rollback, migration and the Art-Net proof: `~/di-backups/preview-rig-builder-2026-09-28/`
(`rollback.sh [--with-data] [--dry-run]`, `migrate-moxir.sh rig|plot|rental|looks|patch`,
`artnet-input-proof.sh`). The scripts in `scripts/place` and `scripts/rigbuild` run from this
worktree against the install's API; the server itself needs none of them (not packed, not needed).

## Seen (owner's Flatpak Chromium 152, his default flags, CDP-driven, own throwaway profile)

- His Chromium renders on the **Intel iGPU** (ANGLE/OpenGL, Mesa UHD TGL GT1) — not the 3080.
  WebGL2 is granted for default, high-performance and low-power alike, so the view-A PRIME risk does
  NOT hit him. Under PRIME the same Flatpak gets NO WebGL at all (GPU process disabled) for every
  powerPreference — so the one-line powerPreference change would not help there; not applied.
- fps on his iGPU at 1440×900 DPR 2: view 14, walk 18, build 17, crew 17–38, plot room 50–60;
  phone emulation 390×844 DPR 3: 50–52. The 60 fps figures elsewhere are the 3080's.
- The iGPU renders drove the CPU package to 97–99 °C at moments even with a < 78 °C start rule.
- Shots: `~/Downloads/rig-builder-preview/`.

## Step 3 (same day) — the inventory: `0.4.16-rigbuilder.3`

- Merged `feat/rig-equipment` (#624). The console-in/sACN fix went back onto the stack:
  cherry-picked to #622 (`5069816c`), and #622 was merged into #624 (`c9094aae`). #599/#603 are still not on
  the stack, so there the views truthfully say "not on this build". The sheet's sACN line assumes #603.
- Found on install and fixed on #624 (`d773b0d8`): `public/rigbuild/` was not in the local profile's
  public include-list, so every `di` install showed the item cards with no pictures. The guard fails without
  the line; known-fixes row added.
- `rig.mjs --wash-only` (preview `b58f1031`, cherry-picked to #587 as `248f2cfb`) re-bakes ONLY `rig-wash`. Owed on
  #607: `load-plot.mjs` should keep `rig-wash`, because no live lamp replaces its light.
- MOXIR: `rental.mjs --api` from the full order (104; 8 lines, catalogue 25, terms 6, day rule). None of
  the equipment agent's test edits applied. The wash was re-baked (48 washes). The 4 B380F are still unpatched.
- Seen (Flatpak Chromium, iGPU, default flags): equipment inventory, CO₂ jet and 40 W laser cards (desktop + phone),
  build + E inventory, /moxir with the wash. fps: build 19, /moxir view 14 (DPR 2 desktop); 2D pages 60+.
- Backup `~/di-backups/preview-rig-builder-2026-09-28/step-3/`; rollback `rollback.sh --to rigbuilder.2|connect.5`.

## Step 4 (same day) — verified codes, the makers' papers: `0.4.16-rigbuilder.4`

- Merged `feat/rig-equipment-media` (#630, stacked on #624). Targeted tests on the preview: src/rigbuild +
  scripts/rigbuild + src/wiki 31 files / 231 tests green. Packed `npm run di:pack -- --version=0.4.16-rigbuilder.4`
  (sha256 fa4f8317…, no PDF or maker file in the artifact — checked), `di update --from`.
- The 24 makers' files (manuals/datasheets the makers offer for download) were stored BEFORE the install as assets of the
  local `moxir` space by `scripts/rigbuild/fetch-equipment-media.mjs --upload` (sha256-checked). Before-state:
  `~/di-backups/moxir-before-media-2026-09-28/` (assets dir was empty). Photos are links only.
- Backup `~/di-backups/preview-rig-builder-2026-09-28/step-4/`; rollback `rollback.sh --to rigbuilder.3|rigbuilder.2|connect.5`
  (`--to rigbuilder.3 --dry-run`, with and without `--with-data`: exit 0, SHA256SUMS ok).
- Seen (Flatpak Chromium, default flags, iGPU, under the browser lock, package 75–79 °C): inventory; UP-HK1915 card (CONFIRMED badge, 3D model, maker's photos link, manual opens the kept PDF — HEAD 200 application/pdf); UP-MH100S (EQUIVALENT, SHEHDS named); UP-Q108S desktop + phone 390@3 (EQUIVALENT MagicFX CO2jet II, manual kept + Linde CO₂ SDS linked). No page overflow, 0 console errors. Shots `~/Downloads/rig-equipment/media/`.

## The hall fix (2026-09-28 evening, data only — still `0.4.16-rigbuilder.5`)

- #587 `432ffab6` cherry-picked here (`cb0dfe69`) + `9c2bdeb9` (`lookRules` `deck_h`, parity; reaches the installed
  bundle only with the next preview build). MOXIR rewritten on the install with no runtime rebuild: `import.mjs
  --replace` (the new hall), `load-plot.mjs --plan-only` (dance zone 10.7 m, new press envelope), `rig.mjs --reaim
  par-press,bsw250-truss --wash-only`, `rig.mjs --night-only`, `looks.mjs`. Backup
  `~/di-backups/moxir-before-hallfix-2026-09-28/` (`di open` any `.diiii` there to undo). Details: #587's note.

## Step 6 — the rig's steps row, the doors in, the Studio camera: `0.4.16-rigbuilder.6`

- Merged `feat/rig-nav` (`19fce0c6`). Split when the stack lands: the steps row + the doors on #624/#622; the
  RigBodies Suspense boundary and the fixed-camera Studio fix on #622. Method: RIG_BUILD.md §14.
- Code only: installing changes no data. Backup `step-6/`; `rollback.sh --to rigbuilder.5` (dry-run exit 0, with and
  without `--with-data`). Artifact sha256 `1e68222c…`.
- "when i enter studio can't move": MOXIR's `presentationState.mode` is `fixed-camera` (locked: false), and the Studio
  turned navigation OFF on the mode alone, so CameraControls never mounted. On rigbuilder.5 in his browser build: 0/6
  wheel ticks taken, drags moved nothing. On .6: wheel taken, right-drag/left-drag/wheel change 13.8/14.5/13.7 % of the
  frame. The Studio has no WASD/arrow camera by design. The Suspense isolation was correct but was not the cause.
- Seen on the install (Flatpak Chromium 152, default flags, iGPU ANGLE Mesa UHD TGL GT1, flock, CPU ≤ 85 °C to start;
  desktop 1440 DPR 2, phone 390×844 DPR 3): every hop one click, /moxir → equipment → build → plot → cards → patch →
  crew → light desk → back to crew → room → cards; build legend on the first B; the row hides under the locked pointer
  and returns on Esc; Q still reaches the hand; phone row targets all ≥ 44 px, no sideways scroll. Shots
  `~/Downloads/rig-nav/installed-*`.
- NOT fixed here (data, owed to the hall-fix line): moxir-hall on the install holds 90 spotLights with NO
  `fixture.type` (0 typed) after the hall fix, so `hasRigLamps` is false and the room draws cone markers, the row says
  "0 of 104 placed" and the patch sheet is empty. On a copy with `load-plot.mjs` re-run (104 typed), the bodies draw in
  /moxir view mode and in the Studio, the 8 GLBs load 200 (`~/Downloads/rig-nav/bodies-stack/`). Careful: on that copy
  load-plot also removed the rental list, so rental.mjs must run after it (migrate-moxir.sh's order).
- fps on the iGPU measured 3 (rAF) in build and the Studio at 82–96 °C package with other sessions rendering; the same
  3 with the row display:none, so the row is not the cost. Not the owner's 14–19 fps figure — heat, unverified cold.
