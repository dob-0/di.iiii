## 2026-08-19 — "Make me a scene": something to open and copy

- The owner, after six stages of container work all shipping green: *"i still cannot connect and
  understand how work"*, then *"i mean i want to create scene with the objects i mean cube light
  or i want upload mine"*. Every single one of those was already possible. None of it was
  legible. The answer is not another feature.
- **The finding that mattered, and it took a browser to see it: a blank Raw workspace opens in
  ZEN, so there is no topbar at all.** No ⋯ menu, no breadcrumb, nothing to press but the
  canvas. Every example, every command, everything the lane can do was behind a menu that does
  not exist for a first-time visitor. Measured: `topbar: false` on a blank workspace.
- **Shipped**: a "Make me a scene" button in the middle of the blank canvas (and the same entry
  in the ⋯ menu for anyone who has chrome). It builds:
  - a room, open, so the scene is visible the moment it is made
  - a light, so the room is lit rather than flat
  - a cube, with a colour node wired into it — the one wire, chosen because its effect is
    unmissable
  - an empty Model node labelled "Your own model goes here"
  - a note giving four moves in plain words: double-tap to add, drag your own file on, drag dot
    to dot to wire, press › to go inside
- **The Model node is deliberately EMPTY.** That is the state a person meets after placing one,
  so the example meets it too — beside an instruction rather than alone. Seeding a fake asset id
  would draw a broken model and teach the opposite.
- **The note is written to the size of its own window, not the other way round.** Three passes,
  each looked at: 17 lines showed 5 and cut mid-sentence; a taller window put the windows back
  over the cards; widening it so the lines do not WRAP was the fix — wrapping, not line count,
  was what pushed the last line below the fold. Windows are top-docked with a card band below,
  the same lesson the starter workspace had to learn twice.
- **Seen**: from a genuinely blank workspace, pressed the button, watched the scene build, then
  dropped a 7.7MB `scan.glb` onto the canvas and watched it arrive in the room beside the cube.
  Zero console errors.
- **Shared-checkout note.** This landed from an isolated clone at `origin/dev`, not from
  `/home/dob/di.iiii`: another session had 70+ files modified in that tree mid-flight, including
  a vocabulary pass that had already renamed this button and the doorway menu items. Committing
  from the shared tree would have taken their unfinished work with it. The 14 test failures seen
  there were theirs; this change is green on 2304 in a clean copy. Expect a trivial wording
  conflict when their pass lands — their naming wins.
- Verified: lint 0 errors · 2304 tests · build clean.
