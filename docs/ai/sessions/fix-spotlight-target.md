## 2026-09-20 — every spot light in di.iiii aimed at (0,0,0); rotation did nothing

Found by reading, then proved with a picture before a line was changed.

Both entity renderers mounted `<spotLight …/>` inside the entity's transform group
with **no target object**. three.js aims a `SpotLight` at `light.target`, and a fresh
SpotLight's target is a bare `Object3D` at the parent space's origin — so the entity's
own `components.transform.rotation` was inert and every spot in every room pointed at
the world origin, wherever it hung.

The proof: a harness room (floor, three walls, a red post marking (0,0,0)) rendered
through the real `EntityContent`. Two spots, one pitched at the back wall and one
rolled at the left wall, pooled **on top of each other on the red post** — cyan and
amber overlapping into white. Screenshots in `~/Downloads/spotlight/` (before-*.png).

**The fix.** A shared `SpotLightObject` (`src/objectComponents/`) renders the light
plus an `<object3D>` target as its **sibling inside the entity's transform group**.
That is the whole trick: the target is in the scene graph (three.js will not aim at a
detached object), the group's own transform carries it so nothing has to recompute on
a drag or an animation frame, it stays correct for an entity nested under a parent
group (where `transform` is local and a world-space calculation would be wrong), and
React unmounts it with the light so no edit can leak an Object3D. Both renderers —
`EntityContent.jsx` (Studio viewport, Raw, portals) and `LiveProjectScene.jsx`
(published rooms, walk mode) — now use it.

**The forward axis is -Y, and that is a deliberate departure.** An *entity* in di.iiii
faces +Z: `vector.aim`'s runtime says so in as many words ("'Face' means the flat +Z
side, the way a monitor faces you") and `facingViewerYaw` repeats it. But that
convention is about things with a flat front — it is applied to exactly
`['text','image','video','plane']` — and a light has no front. A spot has an aperture,
and this repo already draws it pointing down: the marker mesh beside the light is a
`coneGeometry`, mouth at -Y. Decisively, -Y is what keeps published rooms lit: today's
authored spot is a fixture hung at height with rotation `[0,0,0]` aiming at the world
origin, which for a light above the origin **is** straight down. +Z would swing every
one of those beams from the floor to the horizon. The before/after screenshots of the
unrotated case are byte-identical (same md5) — that is the compatibility claim, checked
rather than asserted.

**Known consequence, stated rather than discovered:** under three.js's XYZ euler order
the forward vector IS the Y axis, so `rotation.y` (yaw) does not move a spot's beam at
all. `rotation.x` and `rotation.z` together still reach every direction on the sphere
— nothing is unaimable — but the gizmo's yaw ring on a spot light is inert. Pinned in
`spotLightAim.test.js` so a later change of axis has to come and say so. Related and
unfixed: wiring `vector.aim`'s output into a spot light's rotation aims the beam 90°
below where the same rotation aims a shape.

**What changes for existing rooms:** a spot hung directly above the origin is
unchanged. A spot hung off-centre with no rotation now lights the floor beneath itself
instead of reaching sideways to the origin. A spot with any rotation on it now points
where it is turned. Rooms in the last two groups will look different, and that is the
fix working.

**Not done here, on purpose:** `directionalLight` has exactly the same missing-target
shape (`EntityContent.jsx`, `LiveProjectScene.jsx`) and was left alone — its own change,
its own before/after. No `target` field was added to the schema; aim comes from
rotation, which already exists and already travels through the op log.
