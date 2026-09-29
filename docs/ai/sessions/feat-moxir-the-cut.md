# feat/moxir-the-cut — MOXIR's crane line as one straight 12 m diagonal (2026-09-29)

Owner's pick: option 4 of `~/Downloads/moxir-crane-rig/ten-truss.html`, "the cut" — one straight
12 m truss in the crane bridge's plane, low house left, high over the press. Full write-up with
numbers and sources: `docs/architecture/RIG_BUILD.md` §15.8. Design file
`scripts/place/rigs/moxir-crane-cut-2026-09-29.json`.

## What landed

- The rig: ends x −6.04 (bottom chord 3.44 m) … x +5.55 (6.55 m), 15°, trim 5.06 m over the DJ,
  three picks (u −5.75 / −0.5 / +5.25), static loads 39 / 114 / 50 kg on the line, 72 / 147 / 83 kg
  on the bridge (ESTIMATE; rigging sign-off owed). Derived by `versions.mjs craneCut`, tested
  (`cut.test.js`, `versions.test.js`).
- Two versions: `minimal` = the cut, simple (7 UP-COB200 curtain, 6 PL5403 X over the DJ, 4 red PL5403
  grazing the bridge, press PARs on the backdrop's clamp points); `minimal-cut-movers` = the same line
  with the 7 UP-B380F.
- Client: a sloped run is one run and its slots follow the 3D line (`positions.js runFrame`); pieces
  carry their roll; MVR matrices carry the roll. UP-COB200 type (photometry ASSUMED).
- Scripts: `rehang.mjs` (new rig into a live project, as ops, rig only), `show-cues.mjs` (cue list into
  the document only), `cue-frames.mjs` (a frame of every running cue from named cameras, GPU only;
  helpers tested in `cue-frames.test.js`), `sway.mjs` (heads on a chain-hung line move in ≥ 4 s).
- Companion branch `feat/moxir-the-cut-patch` (on #659): UP-COB200's assumed 4ch list, tunable white on
  the desk, Minimal's plan U1–U4, and vis-see running `--cues` on a rig with no moving head.

## Data (local install only; nothing pushed to dev/prod)

- `moxir-hall-minimal` holds the cut (rehang, then realism kept), wash re-baked, `showpatch` run;
  `moxir-hall-minimal-cut-movers` created.
- Backup + undo: `~/di-backups/preview-rig-builder-2026-09-28/steps/20260929-201925-the-cut/`
  (UNDO.txt there).

## Seen

- The installed preview (0.4.16-rigbuilder.9), frames `~/Downloads/moxir-the-cut/cut-*.png`: the line reads as
  a diagonal slash, but that build has neither the UP-COB200 type nor sloped-run slots, so the curtain sits at
  its rest light in every cue and the X never shows.
- This branch's client (vite :5188 proxied to the same install and desk), frames
  `~/Downloads/moxir-the-cut/branch-code/`: one shaft, the blade, red room, white cathedral with the X and the
  hit all play. **Defect seen, not yet fixed:** the 6 X PARs are drawn lit in *Red room* (red) and *One
  shaft* (white), although the desk's looks give them dimmer 0 (checked in `/light/api/state`). The
  visualiser report on the install also shows every PL5403 at one level per cue. Suspect: the room's
  decode of `UP-PL5403 8ch-assumed` ignores the dimmer (compare known-fixes "colour-only mode could not be
  put OUT"). Owed: find and fix it, with a guard.

## Owed

- A preview install carrying this branch + `feat/moxir-the-cut-patch` (the installed .9 has neither the
  UP-COB200 type nor sloped-run slots).
- Rigging sign-off (crane rated load, lock-out, hoists + safety steels); the rental house's truss,
  hoists and COB200 photometry/channel list.
