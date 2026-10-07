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
