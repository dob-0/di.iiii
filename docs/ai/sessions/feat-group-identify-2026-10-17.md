## 2026-10-17 — group-identify: one command lights a group of lamps, each in its own colour, for the lamp-by-lamp photo audit

- The beam chat audited the rig by hand with throwaway scripts (a group of lamps, each lit in its own colour, the owner sends one
  photo, the 3D must show the same colours so each lamp's place and address can be confirmed or fixed). That is now
  `scripts/rigbuild/group-identify.mjs`; the audit's loop is `--universe 1 --from 17 --to 96 --dry`, then the same without
  `--dry`, one photo, `--release --held-file <f>`. No production name is in the code or its defaults.
- The group is picked by `--universe` / `--from` `--to` (the lamp's first channel) / `--type` / `--name` (exact-case substring, so
  "line R" is the R washes and not "side line right"), combinable. The lamps are ordered along the longer x/z extent, colours come
  from a fixed list of ten (violet #b000ff and lime #a0ff00 chosen so the closest pair is 27 ΔE apart, not 17; measured in the
  test), encoded by `encodeDmx` with the running mode like a scene; dimmer full; pan/tilt never; the rest of the group's universes
  dark; lasers, hazers and the smoke, CO2 and spark machines never lit (every channel held at 0).
- Measured on the live rig (read-only dry runs, nothing posted): U1.17-96 is ten PL5403 washes, ten distinct colours. The 380 W
  beam's colour wheel has fewer slots than the list has colours: ten colours land on eight looks (violet = blue, lime = green),
  so a group of beams is best taken in groups of eight or fewer; the output names the lamps that come out alike.
- Beyond the brief, each from a hazard seen in the code or on the live desk: a channel the desk already held (the beam chat's
  dark holds were on 46 of the 87 channels of the first group) goes back to that value on `--release`, not to the show; a new group
  replaces the last one's holds in the same request; blackout, a master below full (holds ride both, engine.js), DMX output off and
  overlapping patches are warned.
- Tests: `group-identify.test.js`, run against a stand-in desk and against the real desk code (`serverXR/src/lighting/desk.js`) in
  process on loopback, with the DMX frame read back. Not run against the live rig; that, and a look at the lamps themselves, is owed.
