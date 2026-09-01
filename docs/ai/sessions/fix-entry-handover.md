## 2026-09-02 — the entry stops lurching when the walker takes over

Reported by the owner: *"click to step inside and you will see there are some bag when it
turning the walking mode its like glich or something"*.

- **The flight landed on the wrong spot.** It was written against the walker's DEFAULT
  start, `z = 6`. This room authors `worldState.spawn` at `z = 15` and `LiveProjectScene`
  applies it, so the camera flew to one place and the walker took over nine metres behind
  it. Measured rather than reasoned about: `window.__diiWalkerRef` read `z: 15` while the
  flight's end pose said 6, and sampling the handover every 140ms showed the room visibly
  snapping back between two adjacent frames.
- **The room reports its arrival now.** `onArrivalPose` resolves `worldState.spawn` (or
  the default) into camera terms the moment the document loads, and the flight lands on
  that. The authored spawn is the author's decision about where a visitor stands; the
  flight's job is to deliver them to it, not to guess it.
- **The field of view was moving too.** The composed entry shot is fov 50, the walk camera
  is 60, and the swap happens on the same frame as the handover — a zoom pop on top of the
  jolt. The flight crosses the difference as it goes, so the wider field is already on when
  the walker arrives.

Guards: 3 new cases in `enterFlight.test.js` — a reported pose wins over the default, an
unusable one falls back, and the flight arrives wearing the walk fov. Two existing cases
were loosened from `toEqual(WALK_POSE)` to position/target, because the fov is now
deliberately different at the end.

**Looked at**: the handover sampled every 140ms at `?flight=3000`, before and after. Before,
the last flight frame and the first walk frame are two different shots. After, they are
the same one.

### Two more, reported while this was open

- **The landing reappeared for about a second after arriving.** The originals are only
  `visibility: hidden` while their clones fly, so the moment the flight put them back the
  hero was still at opacity 1 — and `.lp-hero-inner--hidden` then faded it out over half a
  second, which reads as the page coming back after you have already arrived. Two changes:
  `.lp-root--flying` now takes the hero's opacity to 0 *during* the flight (nobody can see
  a hidden element fade), so there is nothing left to hide at the end; and the flight hands
  over FIRST and tears its clones down two frames later, so the clones cover React's commit
  instead of leaving a bare frame between them. Measured per animation frame across the
  handover: hero opacity was 1 → 0 over ~520ms, and is now 0 throughout.
- **Coming back out left the room talking over the page.** The room is given its words back
  at the first frame of the flight; `← Back` restored the page without taking them away
  again, so the wordmark and the line were drawn twice, one behind the other. Going in and
  coming out are the same switch and it is now thrown both ways — `leaveRoom` cancels any
  flight in progress, returns the camera to the composed rest pose, and hushes the room.

### And then the page stopped being a page

The owner, on the entry: *"i want to like in game liminal they all can be 3d objects but
with right physics it can look other's"*. Offered the trade, he chose **swap at the seam** —
real HTML at rest, real objects from the moment the door is pressed.

- **CSS3D was a ceiling, not a bug.** The browser draws DOM in its own compositing layer
  above the WebGL canvas and cannot interleave the two by depth, so a door could pass
  behind the wordmark and never in front of it. No arrangement of the maths gets past that;
  the elements have to become objects in the room's own scene.
- **They do now.** Each visible element is drawn onto a canvas from its own computed style
  — family, weight, size, colour, tracking, border, fill, and each coloured run separately,
  so the wordmark keeps its cyan dot — and handed to a mesh in the room through the
  `sceneExtras` seam. `placeInWorld` is the inverse projection: the piece lands on exactly
  the pixels its element covered, verified to a tenth of a pixel, so the first frame of the
  fall is the last frame of the page.
- **Then gravity.** Hand-written, about forty lines: weight, a floor, and rest. No engine —
  ~500KB on the one page whose load time is already on the defect list, to buy three things
  worth forty lines. Pages do not bounce, so the vertical speed is killed rather than
  reflected and friction eats the slide; they turn as they fall and lie flat, face up, in
  the same pose the room's own 77 floor pages are already in. The page you arrived from
  ends up on the floor of the room, and you walk in among it.
- Deterministic scatter: `Math.random()` during render is impure and React's lint says so.
  Seeded from the piece's index, which also means a fall can be looked at twice and
  compared.
- `pageInSpace.js` and its test are deleted. The CSS3D lift is superseded, and keeping a
  second entry mechanism nobody reaches would be two implementations of one moment.

Guards: 4 in `pagePieces.test.js`, and the no-2D-canvas path in `enterFlight.test.js` —
a browser that refuses a context still opens the door, with nothing to throw.
