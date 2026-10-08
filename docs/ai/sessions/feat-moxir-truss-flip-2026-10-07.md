## 2026-10-07 — MOXIR: one show version (the cut flipped) and the rest archived

- Owner 2026-10-07: "flip the truss" → mirror the slope: high on house left, low on house right over the press.
  Same 12 m line, 15°, 3 picks. New overlay `scripts/place/rigs/moxir-crane-cut-flipped-2026-10-07.json`
  (the 09-29 cut mirrored: slope −15°, offset +0.25, picks and tie-offs mirrored). `versions.mjs` lets a
  version name its own cut overlay (`craneCut`); `rise_m` is a magnitude; the truss label in `rig-lib.mjs`
  says which side is high.
- Owner, same night: "too many versions, not synced — sync all, one right version, archive the rest".
  `scripts/production/archive-versions.mjs`: keep a list, archive + hide the rest, dry run by default,
  undo file written before any write, read-back, exit 2 on a difference. Dry run 10-07 ~04:0x: the same
  20 projects on dev and local (keep Known · full + versions list, brief, documents, sources). The write
  to dev was refused to the agent by auto mode → the owner runs it.
- Still open: generate the flipped rig file and fold the flip into Known · full (the one version), Emilya's
  safety fixes (#772, conflicts with dev), the laser layout (owner picks after the site visit on 10-08),
  the build-to-project step (`docs/moxir/TOOLS_MAP_2026-10-05.md` §4.3), the desk (#766).
- Known · full now hangs the flipped cut (its candidate names the overlay; the separate `known-full-flipped`
  candidate is gone): bottom chord 6.55 m at house left (x −5.55) → 3.44 m at house right (x 6.04), picks
  59 / 146 / 44 kg (the mirror of 44 / 146 / 59), high bridle 119° ≤ 120°; tie-offs: high end down to 5.5 m
  (6.28 m), low end level at 3.59 m (5.69 m), ~2 m under the cab. 902/902 rig tests pass.
- `bridle-limit.test.js`: the known 144.4° violation against the measured 7.95 m crane (A-01, fixed in #772)
  is now on the mirror pick for Known · full (u −5.25) — recorded per file, not removed. NOT done here: the
  project on dev/local is unchanged until the build step writes it.

## 2026-10-07 (later) — #772 merged into the flip, re-derived on the measured crane

- Merged Emilya's PR #772 (`emilyanikoghosyan/di.iiii` fix/moxir-audit-safety-2026-10-05, 13d2f926) as a
  merge, her authorship kept (d4c57434). Conflicts: known-fixes (both kept), `bridle-limit.test.js` (her
  empty list: the flipped trim is re-derived from the same 7.95 m girder, so the 144° pick is gone),
  known-full.json (regenerated).
- Known · full now hangs on girder 7.95 m (the FAR crane's photo-007 value; the NEAR crane is ASSUMED the
  same type, range 7.7–8.25, written per crane in `moxir-hall-dims-2026-10-02.json`
  `crane_bridge_bottom_basis`). Truss: trim 4.86; ends 6.35 m (HL, x −5.55) / **3.24 m (HR, x 6.04),
  0.74 m over raised hands**; picks 59 / 146 / 44 kg (on the bridge 92 / 179 / 78 kg, legs 85 / 93 / 37 kg);
  bridles **119° / 42° / 26°, all ≤ 120°**; tie-offs hl 6.24 m (down to 5.5 m, crosses no cab), hr 5.69 m
  (level at 3.39 m, **2.46 m under the cab**). 250 kg total.
- #772's 4.6 m house-right anchor stays on the UNflipped 09-29 cut; the flipped house-right is the low end
  and ties level. Her pure checks live in `scripts/rigbuild/safety.mjs`; the build refuses a tie-off through
  a cab too. Clearance reads both ends, low first (`clearance.low_end`).
- `hall.py`: girder inner gap / girder width / cab inset / cab width are dims keys (defaults 1.5 / 0.7 /
  1.0 / 2.0 = the old hard-coded values, unmeasured); `crane_bridge_bottom_basis` per crane.
  `moxir-hall-measured-2026-10-08.json` (the 10-08 template) is on this branch with those keys.
- Tests: 1504/1504 (113 files: scripts/rigbuild, scripts/place, scripts/production, src/rigbuild); eslint clean.
- **OWED:** (1) re-run `hall.py` (Blender, headless, no render) with the 10-02 chain + the 10-08 template
  LAST, copy hall.json to `moxir-hall-2026-10-02-crane-dj.hall.json` — the Blender run was refused by this
  session's permission check, so hall.json does not yet carry `girder_bottom_basis` per crane; values are
  unchanged at the defaults. (2) the room's hall GLB (A-08) and the project on dev/local: no server writes
  here. (3) tape the near crane's girder underside and gap on 10-08; at 7.70 the low end is 2.99 m, under the
  0.5 m margin. (4) rigging sign-off by a rigger.
- Owner, after the scratch rebuild came back on an OLD hall (load-version copies the hall from its `--from`
  project; the rehearsal took archived `moxir-hall`, GLB 70a52a79, not Known · full's df837baa): "you just
  need to flip the truss, nothing to change — why did the crane place change?". New `scripts/rigbuild/mirror-cut.mjs`
  mirrors ONLY the cut's 53 entities about x = 0 in an existing project (position x → −x, Euler (a,b,c) → (a,−b,−c),
  names kept true) and leaves the other 74, the world and the render settings byte-identical. On scratch:
  `moxir-known-full-flip` = local Known · full + the mirror (hall df837baa, 74/127 transforms unchanged, world and
  render identical). Its whole-document write is for scratch only; a followed space (dev) needs ops — owed.
- **The flip is UNDONE.** The owner, on the scratch room with a line drawn: "look from the side of the audience — the
  pink line is the truss": LOW house left, HIGH house right — the 09-29 cut as it always was. "Flip" was my misread.
  Known · full no longer names the flipped overlay (the file stays, unused); regenerated: ends x −6.04 @ 3.24 m /
  x 5.55 @ 6.35 m on the 7.95 m girder of #772; bridles 26/42/119°; tie-off hr 0.23 m under the cab (her anchor).
  safety.test.js now reads the low end's side from the data (either slope). Rig tests 923/923.
