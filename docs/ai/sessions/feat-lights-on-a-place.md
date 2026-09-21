## 2026-09-21 — lights on a place: a lamp you can aim, a beam you can see, a room that throws shadows

A spot light in di.iiii could be hung and coloured, and that was all. You could not
point it in the language a lamp is pointed in, you could not see where its light was
going until you walked to the wall it hit, and nothing in the room ever cast a shadow.
Three steps, each visible on its own, none of them changing a room that does not ask.

**Aim: pan and tilt.** A lighting person points a lamp with two numbers — tilt, how far
off straight-down, and pan, which way round the vertical — and neither is a raw euler
angle. Both now sit in a spot light's Transform section, in degrees, in both inspectors
(Studio and Raw), and both read and write the SAME `components.transform.rotation` the
gizmo writes. No new field, no new op, nothing for an old document to be missing; a lamp
aimed by dragging reads back as numbers and a lamp aimed by the numbers moves under the
gizmo. The conversion is written once, in `src/project/viewport/spotLightAim.js`, beside
the −Y forward convention it depends on. The inspector remembers the pan while a lamp
hangs dead down, where pan has no meaning at all, so an aim can be set the way a rig is
actually aimed: round first, then tilt into the room.

Found on the way and worth keeping: **rotation.y is inert for a spot ONLY while roll is
zero.** The note from the 2026-09-20 target fix says yaw cannot move a spot's beam,
because the forward vector IS the Y axis — true for yaw alone, and false the moment
`rotation.z` has tipped that vector off the axis, after which Ry pans it round the
vertical like a real pan wheel (`spotAimDirection([0,1.2,0.8])` and
`spotAimDirection([0,0,0.8])` are two different beams at the same height). So pan/tilt is
the canonical spelling of an aim, and it spells yaw 0; an authored yaw left in place
would put the beam somewhere the pan number does not say.

**The beam.** `components.beam = { visible, haze }` — absent in every room published
before this, and absent means no beam, so nothing already out there changes. Drawn by the
shared `SpotLightObject`, so the Studio and a published room cannot drift: a translucent
cone as long as the lamp's reach and as wide as its angle, additively blended, no depth
write, no post-processing (the EffectComposer goes black in WebXR, so volumetrics were
never on the table). It fades along the throw through vertex colours rather than standing
in the room as one flat plastic shape — the first screenshot of it was exactly that, two
solid cones, and the opacity came down with the fade going in. The colour is the lamp's,
which means a lamp joined to a desk fixture beams in the colour the desk is emitting,
live, without a line of new code: the live value is substituted upstream in
StudioViewport and the beam only ever reads the colour it is handed.

The cone is drawn as far as the lamp REACHES, so a lamp with a 15-metre reach hung in a
2-metre room draws its cone through the floor. That is authoring, not a bug — set the
lamp's Distance to where the light lands — and the wiki says so.

**Shadows from the room.** `renderSettings.shadowCasting = { enabled, mapSize }`, off by
default, switched under Project → Render where the other render settings already live.
Deliberately NOT the existing `renderSettings.shadows`: that is the renderer-level switch
(`gl.shadowMap.enabled`), it has defaulted to TRUE since the schema was written, and
nothing ever cast into the map it enabled — every surface paid for a shadow map and drew
a flat stage. Folding the new meaning into it would have meant either changing a shipped
field's type under every saved document or turning shadows on in every published space at
once, and a shadow pass over a scanned venue is not free.

Dressing the scene is a WALK (`shadowCasting.js`), not a prop threaded through fifteen
object components and two entity switches — because the meshes that most need a shadow
arrive from a file long after React rendered the entity, and only a walk catches those.
It only ever switches flags on, so a room with shadows off is untouched; it skips the
reference grid and the gizmo (furniture, not scenery — a grid that cast would drop a
black square under the whole room) and the beam cone itself (light in the air, not
matter). Spot lights get `castShadow` and a shadow camera the size of their own throw.
A directional light needs a frustum sized to the room instead and was left alone: its own
change.

**Fixed on the way — every spot light emitted from a metre behind where it was hung.**
three.js's `SpotLight` constructor does `this.position.copy(Object3D.DEFAULT_UP)`, so an
unpositioned one sits a metre along its parent's local +Y, which for a tilted lamp is a
metre backwards up its own beam. The aim was never wrong (direction is target minus
position and both moved together), which is why it survived the target fix; the lamp's
place, its throw and its falloff were. It surfaced because the editor's marker cone,
drawn at the TRUE entity position, landed inside the lamp's own shadow frustum and
printed a black octagon on the wall it was lighting. `SpotLightObject` now pins the light
at `[0,0,0]`, and `spotLightAim.test.js` holds three.js itself to the quirk so a library
release that changes it is noticed here rather than in a room.

**Looked at, not asserted.** A harness room (floor, three walls, the red post at the
origin, a pillar) rendered through the real `EntityContent`, headless on SwiftShader —
beams off, beams on, shadows on — plus the same room seeded onto a local stack and driven
through the real Studio on desktop and on a phone, and the same document walked in
`LiveProjectScene`. Screenshots in `~/Downloads/lights-on-a-place/`.

**Parked for the owner.** (1) The default haze is 0.4 and the cone's flat opacity peaks at
0.28 — both were tuned by looking at a dark room, and a bright space may want them
higher. (2) A lamp joined to a desk fixture could take its beam ANGLE from the fixture's
profile; it cannot today, because the mirror carries only id/index/name/x/y/colour/level
and the desk's profiles hold no beam angle at all (`src/rigMirror/useLightingMirror.js`,
`serverXR/src/lighting/`). It would mean carrying the Open Fixture Library physical block
through the patch — worth doing, not worth guessing at. (3) A beam stops at the lamp's
reach, not at the surface it hits; clipping it to the room would need either a depth
trick or a raycast per lamp per frame.
