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
- `rig.mjs --wash-only` (preview `248f…` and cherry-picked to #587 as `248f2cfb`) re-bakes ONLY `rig-wash`. Owed on
  #607: `load-plot.mjs` should keep `rig-wash`, because no live lamp replaces its light.
- MOXIR: `rental.mjs --api` from the full order (104; 8 lines, catalogue 25, terms 6, day rule). None of
  the equipment agent's test edits applied. The wash was re-baked (48 washes). The 4 B380F are still unpatched.
- Seen (Flatpak Chromium, iGPU, default flags): equipment inventory, CO₂ jet and 40 W laser cards (desktop + phone),
  build + E inventory, /moxir with the wash. fps: build 19, /moxir view 14 (DPR 2 desktop); 2D pages 60+.
- Backup `~/di-backups/preview-rig-builder-2026-09-28/step-3/`; rollback `rollback.sh --to rigbuilder.2|connect.5`.
