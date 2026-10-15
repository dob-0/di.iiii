## 2026-10-15 — env-pick pictures: same scene, same camera, many light environments (feat/env-pick-shots-2026-10-15)

Owner 07:1x: the first env sheet (room page, two dark scenes) looked dark; "run the same, Studio versions".

- `scripts/measure/env-pick-shots.cjs` — environments (`lightEnvOf` files) applied in the browser copy only, one camera, 1600x900, heat gate.
  A scene can name its own `project`, `page` ('room' | 'studio') and `desk` (false = nothing written to the desk).
  Studio page: the camera is offered as a view button (viewPresets) and clicked; UI hidden by the `studio:ui-toggle` event plus CSS for the viewport's own overlays (there is no `?ui=0` route).
- Result: 33 pictures, sheet `~/Downloads/moxir/v2-11/env-pick-studio.html`; the Studio is not dark with v1-1, v1-1-looks, v1-0, v2-6 (second-drop 25-33 % bright).
- OWED: a Studio route that hides every overlay by itself (`?ui=0`); the sheet builder (`sheet.py`) lives only in the agent data dir.
- Report: ~/work/agent-reports-2026-10-15/moxir-50/env-pick-studio-report.md
