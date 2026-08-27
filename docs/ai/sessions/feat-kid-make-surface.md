## 2026-08-26 — a making surface for a ten-year-old with a phone

Camp day 2 in Dilijan showed the problem plainly: a kid opening their own project
in Raw got eight window bars stacked down a portrait screen, a node graph at 34%
zoom, and the thing they were actually making nowhere in shot. This branch adds
`/<space>/make/<project>` — the same document underneath, a different lid. Mentors
still open the identical project in Raw and see everything the child made; Raw
itself is unchanged, which was verified by opening the same project both ways.

- The room fills the screen and stays filled. `makeFraming.js` measures every
  object as a box turned onto the camera's axes rather than guessing at a bounding
  sphere — a sphere is the wrong shape for a flat photograph and was standing the
  camera ~55% too far back. Re-fits on rotation and on every add, through a new
  opt-in `viewRequest` prop, and keeps whichever way the child has already turned
  the room. It fills the width edge to edge; it cannot fill the height too — a
  room is wider than it is deep and a portrait phone is the opposite — so the
  leftover is the room's own ground, not void.
- Four words under it, no chrome: ԱՎԵԼԱՑՆԵԼ · ԳՈՒՅՆ · ՆԿԱՐ · ԽՈՍԵԼ. Photo is a
  full-width filled block above the other three, because a photograph of Dilijan
  is what this camp actually produces.
- A real iPhone HEIC was refused by the server — HTTP 415, and not for the reason
  anyone assumed. The libheif inside serverXR's `sharp` rejects the file outright
  ("Number of references in iref box (48) exceeds the security limits of 16"), so
  metadata reading throws and the scrubber correctly refuses to store an image it
  could not strip GPS from. The guard is right, the outcome was not:
  `makePhoto.js` now decodes and re-encodes to JPEG in the browser, so the server
  gets an ordinary JPEG and the child's GPS never leaves the phone at all.
- `ImageObject` lays every image flat on the floor on every surface in the
  platform, so a child's photograph arrived as a rug. Countered in the entity's
  own transform; nothing shared changes.
- The child's name, not `TEAM 3`. Read from the document's `projectMeta.title` —
  the project record is a mirror written on every op batch, so it is only the
  first-paint fallback.
- Calm world behind it: warm ground, fog into the sky at the horizon, a contact
  shadow, no grid, and the mentor's camera gizmo out of the picture. All opt-in
  via a new `ambience` prop, null for every existing caller.

Still unverified, and worth saying plainly: the HEIC re-encode itself needs a real
iPhone — headless Chromium cannot decode HEIC, so it takes the fallback path.
Two children in one room at once, a redeemed guest invite, and camp network
conditions are all untested.
