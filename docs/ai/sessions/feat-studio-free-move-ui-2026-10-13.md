## 2026-10-13 — The Move settings: Speed and Turn in the Scene window and in the viewer

The owner, 2026-10-13, on the standard move: "one standard model where it will be easy to navigate ... settable in settings that you
can set how you want". The engine (freeMove.js, preference.js, useCameraNavigation.js) reads two per-device settings; this note is the
two places a person sets them. Nothing in the engine changed.

- Studio: a "Move" section in the Scene window (ProjectPanel, after Default camera, open): Speed (empty is Auto, a number is metres a
  wheel step, 0.001 to 10000; the Auto button says "Auto · 2.72 m" once the space has a size), Turn (around a point ahead, or where you
  stand) and one hint line (wheel, Shift, Alt, the flying keys; a hint, not a setting). Only existing classes: insp-field, insp-input,
  insp-select, scc-btn; no new CSS.
- Public viewer: one "Move" button under Lite / Full (same size) that opens a small card with the same two controls; closes on Escape
  and on a press anywhere else. In a rig scene it sits in the scene bar and the card opens under the whole bar. Lazy: the speed
  reading lives in useCameraNavigation.js (three), and PublicProjectViewer.jsx must not import three statically (its own comment).
- One hook and one set of words (navigation/useMoveSettings.js) so both write the same preference (localStorage, per device).

Measured (scripts/nav/measure-move-ui.cjs, RTX 3080 through di-test-browser, MOXIR v1.1, 1600x900): one wheel notch moved the camera
2.7238 m at Auto (the button read "Auto · 2.72 m") and 1.0000 m at 1 m; back one notch 1.0000 m; Shift 5.0000 m; Alt 0.2000 m. The
same in the public viewer: 2.7238 m at Auto, 1.0000 m at 1 m. The preference read back from localStorage after typing 1 and choosing
"Where you stand": speed "1", turn "place"; after a reload the Studio showed 1 and "Where you stand".

Owed: see the report ~/work/agent-reports-2026-10-13/studio-nav/free-move/move-ui.md (final live look at the card anchored to the bar,
the portrait phone, the push).
