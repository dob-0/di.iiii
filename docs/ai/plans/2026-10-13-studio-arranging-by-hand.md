# 2026-10-13 — arranging a rig by hand in the Studio: what is there, what is missing

Owner, 2026-10-13 19:1x: *"objects move around their anchor point, there is no way to move an object in the world
frame; check all kinds of things that are left, missing, needed now and in future for arranging, add them."* He
arranges lamps by hand in the Studio for the show on 10-17 (space `moxir`, project `v2-9`: 149 entities, 38 laser
beams, 18 B380F heads; looks aim units by point rules in `src/rigbuild/looks.js` and `scripts/rigbuild/epic-build.mjs`).

Reference: Blender 4.x manual. Every "exists" below was read in code on branch
`cloud/studio-arranging-by-hand-2026-10-13` (base `fix/moxir-selection-box-and-scenes-2026-10-13` at e4bbf501). Nothing
here was walked in a browser — every behaviour claim is from code and unit tests, the screen is **UNVERIFIED**.

Size: **S** = one function + one binding, a day or less, no schema. **M** = several files or a new panel row, or a new
document field. **L** = touches the looks/rig pipeline or the schema and scripts together.

## The table

| # | Need (Blender manual page) | Exists? | Where | Size | Risk |
|---|---|---|---|---|---|
| 1 | World vs local axes for the gizmo (Scene Layout › Object › Editing › Transform › Transform Orientations) | **yes**, landed by the lead (40f53d09, b6be3e7f): World default, `Local` button | `StudioControlCluster.jsx`, `StudioViewport.jsx` `tc.setSpace(gizmoSpace)` | — | The multi-selection pivot gizmo is always world (`controls.setSpace('world')`, StudioViewport.jsx ~498); a node's gizmo in `StudioGraphNodes.jsx` is still `local`. |
| 2 | G/R/S X/Y/Z in the object's own axes (press X twice = local, Transform Control › Axis Locking) | **no** — the modal's X/Y/Z are world only; a second X turns the constraint off | `ModalTransform.jsx` keydown | M | Each selected object has its own axes (Blender moves each along its own); needs the entity's world quaternion in `grabStep`. |
| 3 | Plane constraint Shift+X/Y/Z (Axis Locking) — "slide along the floor" | **added** here | `modalMotion.js` `PLANE_OF_KEY`, `indicesOf` | S | Rotate with a plane turns around the left-out axis (Blender's rule). |
| 4 | Snapping by increment with Ctrl (Editing › Snapping) | yes: 0.5 m · 15° · 0.1, gizmo and G/R/S | `gizmoSnap.js`, `modalMotion.js` | — | The increment is fixed; no grid-size setting (#6). |
| 5 | Precision snap Ctrl+Shift (Snapping › "Shift: precision") | **added** here, gizmo and G/R/S: 5 cm · 1.5° · 0.01 | `snapStepFor`, `gizmoSnapSteps` | S | — |
| 6 | Snap increment you choose, absolute grid snap, snap to a surface/vertex (Snapping › Snap Target / Snap To) | **no** | — | M (increment field) / L (to faces) | Snap-to-face needs a raycast against the hall's 3.5 MB mesh each pointer move; BVH or the rig-only ray of `buildAim.js`. |
| 7 | Numeric input during G/R/S (Transform Control › Numeric Input) | partly: with an axis for G; **added**: R and S without an axis (R 90 = view axis, S 2) | `ModalTransform.jsx` | S | G with no axis still ignores digits (Blender types X, Tab, Y, Tab, Z) — M, needs a three-field HUD. |
| 8 | A typed rotation turns about the world axis | **was wrong, fixed** here: R Z 90 added to `rotation.z` (a world turn only for X) | `ModalTransform.jsx` `applyTotal`, known-fixes row | S | — |
| 9 | Duplicate (Object › Duplicate Objects, Shift+D) | yes, hierarchies too; **added**: Shift+D starts a grab on the copy, Ctrl+D copies in place | `StudioEditor.jsx` | S | Esc leaves the copy on its original (Blender does the same); it is one Ctrl+Z away. |
| 10 | Array / line of copies (Modifiers › Array; or Duplicate + Repeat Last, Shift+R) | **no** | — | M | Shift+R is the Studio's "reset layout" (StudioShell). Sketch below. |
| 11 | Align objects (Object › Transform › Align Objects) | **no** | — | M | A row in the Inspector's multi-selection view; pure fn over bounds (`selectionBounds.js` exists). |
| 12 | Mirror (Object › Mirror, Ctrl+M then an axis) | **no** | — | M | A lamp's aim must mirror too (pan → −pan), not just its position; scale −1 is wrong for a lamp. |
| 13 | Aim a lamp at a point (Object › Constraints › Track To / Damped Track) | partly: Inspector Pan/Tilt for a spot light (`AIM_FIELDS`), the build view's first-person aim (`buildAim.js`) | `StudioInspector.jsx` `SpotAimField`, `spotLightAim.js` | M | Rig lamps rotate about the lens, not the yoke (#15). Sketch below. |
| 14 | Lock an axis per object (Object Properties › Transform › the padlocks) | **no** — only the whole-object lock (`runtime.locked`, L / Alt+L) | `selectionTools.js` | M | A new document field (`runtime.lockAxes` or `transform.lock`): schema + server normalize + both inspectors. |
| 15 | Pivot point (3D Viewport › Header › Pivot Point: Median, Individual Origins, Active, 3D Cursor) | partly: one object turns about its origin; several about their centroid ("Median") | `ModalTransform.jsx`, `multiTransform.js` | M (Individual Origins) / L (3D cursor) | A rig lamp's entity origin is its LENS (`looks.js` `lensFromMount`), so turning one by hand pivots at the lens, not the yoke. The owner's "move around their anchor point" may be this as much as world/local — **UNVERIFIED**, ask him. |
| 16 | Clear Location / Rotation / Scale (Object › Clear, Alt+G/R/S) | **added** here | `clearTransform.js` | S | Alt+R on a rig lamp makes rotation 0 = beam straight DOWN (`SPOT_LOCAL_FORWARD` is −Y); "straight up" is `[-π, 0, 0]`. That is Blender's rule, not a rig rule. |
| 17 | Undo depth (Preferences › System › Undo Steps, default 32) | yes: 50 steps, a gizmo release or a batch is one step | `useOpHistory.js` `HISTORY_LIMIT` | — | Undo covers only your own ops (collab-safe). |
| 18 | Transform fields in degrees (Object Properties › Transform) | **added** here: rotation reads in degrees, stored radians | `StudioInspector.jsx` `inDegrees`, `entityRegistry.js` | S | Nodes' inspector still shows radians (ignores `degrees`). |
| 19 | Multi-object editing in the Inspector (Alt+drag a field edits all selected) | **no** — the Inspector edits the primary only | `StudioInspector.jsx` | M | — |
| 20 | Saved views per project (owner decision 2026-10-13, `docs/ai/decisions/2026-10-13-views-library-words-workflow.md` §1) | partly: one `world.savedView` + "Save current view"; the viewer READS `presentationState.viewPresets` (`SmartView.jsx`), the Studio cannot write them | `StudioShellPanels.jsx`, `smartView/` | M | Decision taken; authoring is the missing half. |
| 21 | Building layers (Roof · Walls · Machines · Outside) saved with the project | partly: the switches exist (f859985d); state is `useState`, lost on reload | `StudioViewport.jsx` `studioLayers` | S/M | Per viewer (localStorage) is S; per project is a document write — owner's call which. |
| 22 | A hand aim / hand place survives picking a scene | **no** — a look re-poses every spot light it names from the rig rules (`lookPoses` → `posedEntities` replaces position + rotation); the document's hand aim shows only on "work light" | `looks.js`, `StudioPresentationSurface.jsx` `rigLook` (default: follow the show clock) | L | While a look plays, a gizmo drag writes the document but the room draws the look's pose — the lamp may seem not to move (**UNVERIFIED** in a browser). Sketch below. |
| 23 | Hand-made places back into the rig (`fixture.position`, mounts) | **no** — `lookPoses` groups lamps by derived slots / `fixture.position` words; a lamp moved by hand keeps its old slot's key | `looks.js`, `positions.js` | L | A moved lamp can change rank in its group, so `solo` picks another unit. |

## Order

Done on this branch (each one commit, one test or more): #3, #5, #7 (R/S), #8, #9, #16, #18. Wiki and Help updated.

Before 10-17, in this order (each is what costs the owner most per hour of arranging):

1. **#22 — the look must not hide the hand.** At minimum (S): when the Studio is in Edit and something is selected, the
   room draws the document, not the look (or the ScenePicker defaults to "work light" while editing). Then the L part.
2. **#13 — aim at a point.** He aims 18 heads and 38 beams by hand.
3. **#2 — local axes in G/R/S**, so the modal agrees with the `Local` button.
4. **#11 / #12 — align and mirror**: the rig is symmetric.
5. **#21 — layers remembered**, **#20 — views authored**.
6. After the show: #10, #14, #15, #6, #19, #23.

## Sketches (M / L)

**#22 Keep the hand aim (L).** A look's aims are rules per group key; epic-build already writes one group per unit with
rule `point` at its own target in the stage frame (`epic-build.mjs` `aimOf`). A "Keep this aim" action on a selected
lamp, with a look picked: take the lamp's beam direction from `spotAimDirection(rotation)`, intersect it with the stage
plane the rule `point` uses (`stagePoint(ctx, x, y, a)` inverted: x across, y along, a height), and write
`aims[<the unit's key>] = { rule: 'point', x, y, a }` into that look in the rig-looks entity (`rigLooksOf`). One op, one
undo. For "all looks": the same per look. `scripts/place/rig-lib.mjs` mirrors `AIM_RULES` (parity test in
`lookRules.test.js`) — no new rule needed, which is why `point` is the carrier. Risk: a unit sharing a group key with
others (the floor lamps that stand straight up share one, `epic-build.mjs` ~173) must be split into its own key first.

**#13 Aim at a point (M).** Pure `aimRotationAt(from, target)` → the `rotationFromPanTilt` of the direction (the same
pan/tilt the Inspector writes, so the Inspector reads it back). UI: with lamps selected, a key (Blender has none for
Track To; proposal: `Shift+T`, free in Studio) then a click on a surface: the ray hit is the target, each selected lamp
aims at it, one batch. For rig lamps the lens must move with the aim (`lensFromMount`), which needs the mount — today
only derivable from `plotData`; until then aim about the entity origin and say so.

**#2 Local axes in G/R/S (M).** In `ModalTransform` keep, per entity, its world quaternion at the start; X once = world
X, X twice = that entity's local X (Blender cycles global → local → off). `grabStep` takes the axis vector instead of a
letter; `typedRotateAxis`/`rotateAxis` the same. Follow `gizmoSpace` for the first press when the `Local` button is on.

**#10 Array (M).** "Duplicate along": count N and step vector (default: the last Shift+D move). Pure
`arrayClones(subtree, n, step)` over `cloneSubtree`, one batch. Key: not Shift+R (taken); a button in the Inspector's
multi-selection row.

**#11 Align (M), #12 Mirror (M).** Pure over `selectionBounds.js`: align min / centre / max on an axis to the active
object; mirror positions across the selection centre on an axis and the aim as pan → −pan (or tilt mirrored for Y).
One row of rectangle buttons (0–2 px radius, existing `scc-btn`) in the Inspector when 2+ are selected.

**#14 Axis locks (M).** `runtime.lockAxes: { position: [bool×3], rotation: [...], scale: [...] }`; `isLockedEntity`
stays the whole-object lock; ModalTransform, the gizmo (`showX/Y/Z`) and `clearTransformOps` honour it. Schema change:
`shared/projectSchema` normalize + server mirror (`test:schema-sync`).

**#15 Pivot (M/L).** A pivot choice in the control cluster: Median (today) / Individual Origins (each turns in place).
A real yoke pivot for rig lamps needs the mount on the entity — L, with the rig pipeline.

**#21 Layers remembered (S/M).** Per viewer: `localStorage` key per project in `studioWorkspaceStorage.js`. Per project:
`presentationState.layers` — owner's call.

**#20 Views authored (M).** A "Views" list in the Scene window: Save current view as a named preset into
`presentationState.viewPresets` (the shape `sanitizeViewPresets` reads), a live/work tick per preset (the decision's
"work view until the author ticks it").
