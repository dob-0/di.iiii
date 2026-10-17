## 2026-10-17 — MOXIR venue audit saved: lamp changes with their sources, U1.353 deleted, beam pan corrections, universe-1 checklist

- **What this is:** the records of the 2026-10-17 morning audit at the venue, where the owner compared the hall with the 3D lamp group by lamp
  group, saved from the live session into the repo. The only code change is one flag on `scripts/rigbuild/all-colour.mjs`.
- **Lamp changes, one file each** in `docs/moxir/devices/`, every one with `what` and `source` (the owner's words at the venue):
  `truss-moves-cut07-floor` and `floor-moves-329` (the U1.329 wash on the floor beside the column at z 6), `side-left-swap` (U1.217 nearest the
  audience), `side-right-swap` and then `side-right-unswap` (the right line's first order was right, so the swap was undone) carry `moves` for
  `scripts/place/move_lamps.py`; `delete-353` (the hall has no wash at U1.353; the lamp drawn there, `rig-par-planes-13`, was deleted) carries an
  `undo` that names its backup.
- **Beam pan corrections:** `scripts/place/rigs/moxir-v2-11-pan-corrections-2026-10-17.json` now holds all twelve measured ones: truss beam 2 +90,
  the six DJ beams -90, the five right-side beams 180; truss beam 1 and the left side need none. Each was checked in the hall by the owner; the steps
  with his words are in `docs/moxir/devices/truss-check-2026-10-17.txt` (the 06:33 to 09:0x entries are new here).
- **Universe 1:** `docs/moxir/devices/u1-checklist-2026-10-17.txt` lists every universe-1 lamp with its place in the 3D and its check state (all
  places match, owner "all right").
- **`docs/moxir/devices/audit-loop.md`:** the four commands the audit ran on (light a group in colours, move or readdress in one batch after a
  backup, the physics check, re-patch the desk).
- **`scripts/rigbuild/all-colour.mjs --universe N`:** colours only that universe's lamps, to check one cable at a time.
- Checked here: eslint and a syntax check on `all-colour.mjs`, every JSON file parses, the push gates (lint, schema-sync tests, wiki and AI docs
  checks) pass. Not checked: the `--universe` flag against the rig (this save only copied the files).
- Owed: the script of command 1 in the loop (`group-identify`) is only on branch `feat/group-identify-2026-10-17`, which has no PR, so it is not on
  dev yet; command 4 still runs a scratch script (owed: `patch.mjs --exact` skipping unaddressed lamps); the lasers are next and need the owner's
  safety word.

## 2026-10-17 later: the v1 scenes, the 3D and the hall
- The owner tested the 50 v1 scenes on the rig: "in 3d beams are strobe but in real not". Causes and fixes are in docs/ai/known-fixes.md (2026-10-17, "The 3D and the hall played different shows").
- New command `scripts/rigbuild/look-roundtrip.mjs`: per look and lamp, what the 3D draws from the desk's values against the look (on/off, light = level × colour, aim). Before the colour fix: light off 62 of 3060; after: 0.
- `encodeDmx`/`decodeDmx`: a colour's own darkness is light (dimmer), a wheel slot is drawn as it is. `show-loop.mjs`: a desk show never keeps `showSource: 'clock'`.
- Still open: the looks' level motion on the desk (48 of 51 looks), being built on `feat/desk-look-motion-2026-10-17`.
