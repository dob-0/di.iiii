# Nodes audit: what's pure, what isn't (2026-10-02)

Owner, after four sketches: *"keep things pure — a Text has an OUT that we can connect to something; a Scene is
a scene, for now it's maybe just a raw space again; we need to change Scene. Audit what we need, then go next."*
The build (A–E + F) is on hold until this is settled. Read from `src/project/nodeRegistry.js` on dev 170340f5.

## Findings (measured)

1. **23 of 123 node types have no output.** Text, List, Image, Browser, Model, Light, Point light, Camera,
   Background, Grid, Environment and Desk are among them. They're dead ends: nothing can be wired *from* them.
2. **Text:** IN `content:string`, OUT nothing. **List:** no IN and no OUT. Its comment says a list "is read by
   people", and the dead-port rule forbids a socket nothing consumes.
3. **Scene (`universe.world`):** IN title, sky. OUT title, sky (its own settings only). It has **no input for what's in
   it**. Contents arrive only by nesting: you enter it (›) and get a canvas again, the "raw space again".
   Objects (Model, Light, Camera) are *placed inside*, not *wired in*.
4. Geometry does flow by wires (Cube/Geo OUT geometry → Merge, Array, Transform), but the line stops there.
   Nothing takes geometry and makes a picture of it.
5. Only 3 nodes take a string as content: Plane, Text, Keyboard.

## The established pattern this points to (not invented here)

Node tools that keep a scene "pure" make the scene a **consumer of wires**, not a folder:
- **TouchDesigner:** the Render TOP takes Geometry COMPs, a Camera and Lights and outputs a picture.
- **Blender** geometry nodes: Join Geometry → Group Output. **Notch** and **Unreal Niagara** follow the same in → out flow.

So a pure Scene would take **inputs**: objects (geometry, any number), lights, a camera, background and info
(text, list), and give an **output**: the picture, plus what it holds. Text and List would get an OUT
(`text:string`, `items:any`) so they can feed a Scene, a screen or a light cue.

## Open for the owner (next step)

- Scene: keep it a container (enter ›) **and** add inputs, or make it purely wired (no nesting)?
- What a Scene outputs: the picture (texture), so it can go to Projection or a stream?
- Then A–E are re-checked against this before building (B and C may change).
