## 2026-10-04 — apply-picture: the code's picture into every MOXIR version

Owner: "go" — every version should show the hall the same, correct way (the round "porthole" on
moxir-hall-known-ground was fog far 32 in a 108 m hall).

- **Cause (cited).** `scripts/rigbuild/realism.mjs`, commit bc511e97 (2026-09-29): `hazeFog(0.05)` = far 32, exposure 3.5, atmosphere
  0.05, written by hand per project. Rig files hold `night.fog` {60, 250}; no rig file holds exposure or atmosphere.
- **Built.** `scripts/rigbuild/apply-picture.mjs` (new; why not `realism.mjs`: that one owns haze, hall copy and apertures and is local-only).
  Tests `scripts/rigbuild/apply-picture.test.js` (6): far 32 → 60/250, lacking fields untouched, undo restores, dry-run writes nothing,
  read-back mismatch refuses, unknown flags refused. Docs: RIG_BUILD.md §23.
- **Not done / owed.** No server was written to. Ambient/directional from the rig assume exposure 1; on exposure-3.5 projects use
  `--fields fog,background`. Match to reality (light-meter + photo test) is owed. Run it: dry-run first, then without `--dry-run`.
