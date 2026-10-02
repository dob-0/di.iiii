## 2026-10-01 — A hall's self-lit zone tape is not drawn in the 3D room

- Found on MOXIR (PONYO), the owner's words: "still not visible ... i think it from the red green blue lines". The hall glb carries the planning zones as emissive tape meshes (`hall-zone-*`); in a dark show room they outshone the rig.
- `src/objectComponents/ModelObject.jsx`: `isPlanningMarker(name)`; such meshes are hidden when the model is cloned for the room. The plot and plan views still draw zones from `venuePlan`.
- Guard: ModelObject.test (red on the old code). known-fixes row added.
