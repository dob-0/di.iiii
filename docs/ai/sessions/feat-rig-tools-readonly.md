## 2026-09-28 — the rig tools read only for visitors; a hosted tier says where the desk is

- `/{space}/plot|cards|equipment|build/{project}` on a PUBLIC space: a visitor who is not a member
  gets the page read only (build → crew view) instead of the sign-in card; members edit as before;
  private spaces keep the gate. `src/rigbuild/rigToolAccess.js`, `RigToolRoute` in `src/RootApp.jsx`.
- Read only = `NO_WRITE` op path, no auto-patch, no desk calls, no writing controls, one
  "View only — sign in …" line (`ViewOnlyLine.jsx`).
- Hosted (no desk): one sentence instead of "none here"/"no desk here" fragments; "patch this group"
  disabled with it (it used to say "patching…" and never answer); the cards' patch hint read a
  message that is never set, so it never said the lamps stay unpatched (fixed: it reads the probe).
- Item cards never request the makers' kept files on a hosted tier (they 404); they link the maker.
- Tests: RootApp.rigTools, readOnlySurfaces, rigToolAccess, keptMediaHosted — all seen red first.
- Owed: a browser look on dev (desktop + phone) once the integration lands.
