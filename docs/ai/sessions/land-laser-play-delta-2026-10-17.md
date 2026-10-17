## 2026-10-17 — the server keeps a lamp's measured pan correction (the part of #1012 that #1009 and #1011 did not land)

- **Why this branch exists:** #1009 was squash-merged at 03:24 (+04) and #1011 landed the six laser-safety and room-drawing commits
  pushed after it. #1012 (`feat/laser-play-2026-10-16`) carries the rest, but it is CONFLICTING against dev (add/add on two files
  #1009 added and the branch edited afterwards: `docs/moxir/devices/truss-check-2026-10-17.txt` and
  `scripts/place/rigs/moxir-v2-11-pan-corrections-2026-10-17.json`), and that branch is another chat's active branch, so it was not
  touched. This branch applies the five commits #1012 has beyond #1011 to dev unchanged (`-x` lines name the sources).
- **Server schema:** `src/shared/projectSchema.js` has kept a lamp's `panOffsetDeg` and `panInvert` since #1009, but its server twin
  `shared/projectSchema.cjs` did not, so every save through the server dropped the measured pan correction and the 3D could not show it.
  The twin now keeps both with the same clamp. Test: `src/shared/projectSchema.test.js` "a measured pan correction survives a save on
  both sides" runs the server copy and the client copy on one document.
- **Truss data (owner, measured on the rig 2026-10-17):** truss beam 1 needs no pan correction, beam 2 needs +90° — in
  `scripts/place/rigs/moxir-v2-11-pan-corrections-2026-10-17.json`; the step-by-step check is in `docs/moxir/devices/truss-check-2026-10-17.txt`.
- Tested here: see the pull request. Owed: the 3D showing the correction has not been looked at after the server keeps the fields.
