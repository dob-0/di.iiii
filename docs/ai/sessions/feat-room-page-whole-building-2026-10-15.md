## 2026-10-15 — The room page shows the whole building: Cut off by default, a Cut item in Display

Owner 15:2x, a room page seen from above the roof: "why walls not visible". Cause: the smart view's cutaway (roof and the walls facing the camera cut) applied on the public page too. Rule (07:2x, N730): the showcase link shows the building whole; the cutaway is a work reading.

- `PublicProjectViewer.jsx`: the layer state starts with `cut: false` unless `?layers=` names the layers (the address wins). The Display menu already lists every `VIEW_LAYER_IDS` item, so Cut is there; its title is "Cut away the roof and the walls facing you from outside". The link is written back on every toggle: whole building (Cut off, the rest on) = no parameter; any other state = the shown layers in full (so Cut on survives a reload).
- Studio unchanged (cut on). Auto fly, Walk/Fly unchanged.
- Tests: `PublicProjectViewer.test.jsx` (default off, ?layers= wins, the item toggles and writes the address). 144 passed in `PublicProjectViewer` + `smartView`.
- Docs: `docs/architecture/SMART_VIEW.md` layer item 3.
- Pictures: see `~/Downloads/moxir/v2-11/whole-building.html` (made by the job, if lane 2 freed up; else named in the report).
