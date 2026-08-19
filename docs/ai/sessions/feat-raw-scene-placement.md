## 2026-08-19 — a second object no longer lands inside the first

- Owner, after the scene example shipped: *"so problem in it that i have create other geometry
  what it will happen so there are still something wrong"*. There was. Two things, both found
  by adding objects in a browser rather than by reading.
- **Everything was placed at the same spot.** A new object took its type's declared default
  position, so the second thing you made stood exactly inside the first and a scene became a
  pile at the origin. New objects now step out to the nearest free place — a widening ring of
  eight, not a row: a row marches off into the distance and is out of shot by the fifth object,
  while a ring keeps the scene in view. Pointing INTO the room still wins over stepping aside.
- **THE BUG BEHIND THE BUG, and the reason to write this down.** The first fix tested
  `values.position === undefined`. It read correctly, it passed seven unit tests, and it did
  **nothing at all in the app** — because the palette hands every type's declared defaults in as
  `params`, so `position` is *always* already set by the time that line runs. Only a browser
  showed it: two spheres, both still at `[0, 0.5, 0]`. The test that mattered was not "is it
  missing" but "did anyone actually CHOOSE this", which compares against the type's own declared
  default. A unit test written against the same wrong assumption as the code confirms the
  assumption, not the behaviour.
- **New cards landed half off-screen.** Double-tapping near an edge placed a card centred on
  that point, so part of it — and the door hanging off its left edge — was outside the canvas
  and unreachable. The creation point is now clamped to the visible band, allowing for half a
  card plus the door.
- **Entering a Cube no longer shows the same blank grid as an empty workspace.** It says: *"A
  cube is made of code, not of other nodes — there is nothing inside it to see."* An empty room
  and a thing that HAS no room are different facts, and one screen for both is what made
  entering a node feel broken. `isNodeMadeOfCode` derives this from the registry rather than
  listing it, so it cannot rot as types are added — and the intention is for that set to
  SHRINK. This is the first of the three things the owner asked for when they said *"we all
  have as a constructor"*; the other two (a node shows what it is made of, and a cube that
  truly IS a graph) are still ahead, and the unused `geometry` port type is where the second
  one was started and abandoned.
- **Seen**: built the scene, added a sphere, a cube and another sphere — four separate objects
  standing apart in the room, each card fully on screen. Went inside a cube and read the new
  sentence. Zero console errors.
- Landed from an isolated clone again: the shared checkout still holds another session's
  in-flight vocabulary pass.
- Verified: lint 0 errors · 2315 tests · build clean.
