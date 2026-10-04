# fix/moxir-known-full-from-git-2026-10-05

## What this branch holds

MOXIR's show version (Known · full, project `moxir-hall-known-full` in space `moxir`, copied from PONYO
on 2026-10-04 with `copy-version.mjs --from-api`) had no record tying it to git (audit D1:
`madeFrom: null`, `commit: null`). This branch measures that tie and records it. Nothing was written to
any install: every request was a GET (document, ops), with each install's admin token.

- `scripts/production/rebuild-compare.mjs`: replays, offline, each step a version is made by (versions
  report → pieces → venue plan → show components → `--look <default> --nominal` → realism apertures →
  copy-version's mark → the server's normaliser at its fixed point). It compares per entity and field with
  a project, then puts every git-built part into the project's document and takes the list's own
  fingerprint (`versionList.mjs fingerprintOf`). If the fingerprint is unchanged, every git-built part is
  identical. `--at-version N` replays the project's op log, so a fingerprint listed at an earlier version
  can be re-derived. `--record` takes everything but the install from a committed record.
- `scripts/production/records/moxir-2026-10-17--known-full-ponyo-10-04.json`: the record (the steps,
  the pinned files by blob, the results, and what is not from git, with hashes).
  `….entry.json` holds the list entry (`madeFrom: known-full`, `rig: {file, blob}`) for the owner or
  Emilya to write with `versions.mjs put`. This branch does not write it.
- `scripts/production/rebuild-compare.test.js`: the pinned blobs still match (a moved rig file fails it,
  and the message names the re-check command). It also checks the entry against the record, the replay and
  normaliser parts, and a git-built document compared with itself and with one lamp changed.

## Measured (2026-10-05, aylmo, code at b3d7f76b)

| install | doc version | fingerprint | with git parts | entities identical |
|---|---|---|---|---|
| dev | 1 (replayed) | 3d64a1bc…79a7 (= listed) | 3d64a1bc…79a7 | 125 / 125 |
| dev | 2 (now) | c5df2904…96c4 | c5df2904…96c4 | 125 / 125 |
| local | 1 (replayed) | 3d64a1bc…79a7 | 3d64a1bc…79a7 | 125 / 125 |
| local | 2 (now) | c5df2904…96c4 | c5df2904…96c4 | 125 / 125 |

The equipment list, the 25 looks, the venue plan and the mark (with the copy step) are identical, and so
are the truss and deck bodies (the project's asset ids are the sha256 of the git files).
Version 2 is one op after the listing: `apply-picture.mjs` (PR #761, not in dev) set the background
#030304 and fog 60–250 m on dev at 20:03Z. It touches no git-built part, but the list still holds v1's
fingerprint.

## Not from git (named, not rebuilt)

- The hall model `hall-night.glb` sha256 df837baa…e48b: hall.py runs in Blender, which this session did
  not run. Only this project holds those bytes (D9), and no aylmo backup does (D5).
- place-hall's transform, appearance and animation, rig-show's rigBounce (measured off hall asset
  4b0d561f…), and the world and render settings. Their values do not match the tools' defaults, and the
  arguments used were not recorded. For example, `realism.mjs --scattering 0.02` fits fog.far 80; ambient
  #a39c92 at 0.1 and shadowCasting on come from unrecorded steps.

## Found on the way

- `projectSchema.js planText` trims and then cuts, so it is not idempotent: a 160-character summary that
  ends on a space loses the space on the next write. Harmless, but two installs that wrote a mark a
  different number of times can differ in it. The fix (cut, then trim) is owed. The tool models it as the
  normaliser's fixed point.
