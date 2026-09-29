## 2026-09-29 — smart view: a building stays in sight from anywhere (occlusion fade, cutaway from outside, six view presets, x-ray, camera limits)

- The owner on MOXIR: "when i move the mouse i go out from the building and nothing visible
  … when something front it will be transparent … i need and want smart view methods". A
  platform feature for every room with a building in it: `src/project/viewport/smartView/`,
  mounted by `StudioViewport` for the published room (orbit) and the Studio viewport panes.
  Method, sources and limits: `docs/architecture/SMART_VIEW.md`.
- Occlusion fade: 5-ray BVH raycast (three-mesh-bvh, now a direct dependency) at 15 Hz decides;
  the building's fragments in front of the target inside a screen circle are screen-door
  dithered (Bayer 4×4, up to 85 %). Cutaway: six shared clip planes (roof, four walls, a
  preset's section); the authored fog stands back by the camera's distance outside. Presets
  on keys 1–6 and a row (Floor, DJ, Top, Side, Rig, Crane) computed from the room and rig,
  overridable by `presentationState.viewPresets`; `#view-<id>` deep links. X-ray on Alt+Z.
  Visitor camera limits through camera-controls (maxPolarAngle for the floor, maxDistance,
  setBoundary for the target).
- The building is found through what the place pipeline writes (`place-hall`, `venuePlan`
  outline, `hall.py` mesh names) with a bounds fallback; the rig is never touched.
- Studio: same views and x-ray at the top of each pane, keys act on the pane under the
  pointer, a digit a cue claims stays the cue's; no camera limits there.
- Not done / owed: the visualiser split (#644) needs `&views=1` on its room frame for the
  row; the fade circle is a fixed share of the screen; clicks still hit cut-away parts;
  no MOXIR document carries authored `viewPresets` yet (owner's call); the realism PR #660
  (atmosphere/beams) was not on dev — its haze needs a look together with the fog offset.
