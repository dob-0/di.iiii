## 2026-09-03 — a door can be a square-cornered frame, not only a glowing ring

- `PortalObject.jsx` hardcoded one door: a torus ring lying flat on the floor
  (`args=[1.1,0.12,16,48]`), an additive circular tap membrane, and an additive
  radial-gradient glow sprite at scale 3.4. The brand's geometry rule is
  absolute — square corners only, hairline borders, flat fills, never shadow,
  glow or bevel — so the platform could not author a doorway that belonged in a
  room built to its own identity. Every door was a glowing coloured circle.
- `reference.style` on a portal now picks the shape: `'gateway'` (default, the
  ring exactly as it was) or `'frame'` — four thin boxes (jamb left/right,
  lintel, sill), butt-jointed, square corners, `meshBasicMaterial` in the
  entity's `appearance.color`, no glow sprite and no additive blending. The
  opening carries a flat 10% fill that is also the tap target, the same
  "nearly invisible, full-size hit area" trick the ring's membrane uses, but
  with normal blending — additive over a dark room *is* a glow.
- Opt-in by construction: an unknown or absent `style` normalises to
  `'gateway'`, so nothing authored before this changes.
- The frame's opening half-width is deliberately the ring's major radius (1.1)
  and its bar the ring's tube (0.12), so `portalWalkThrough`'s
  `1.3 × XZ-scale` latch fits both shapes and needed **no** change — only a
  comment saying why. Asserted in `PortalObject.frame.test.js` rather than left
  to a coincidence.
- The whole frame sits ABOVE y = 0 rather than centring the sill on it. The
  first build centred it, and the screenshot showed why that is wrong: a room
  whose floor is at y = 0 swallows the sill and leaves a П where the mark's
  closed square should be. A sill is the thing you step over; 12cm of it now
  stands on the floor and the rectangle closes.
- The nameplate is the one thing that moves: a ring's plate floats at y=1.9
  over a marker lying flat, which for a 2.64-tall frame would hang it in the
  middle of the doorway. `portalLabelHeight(style)` clears the lintel instead.
  Reveal, fade, plate and font behaviour are untouched.
- **The mirror was the trap.** `shared/projectSchema.cjs` is what the SERVER
  normalises with, and it silently dropped `style` — the ESM copy was correct,
  every unit test was green, and the door still rendered as a ring in the
  browser. Found by running the stack and looking, not by testing. Both copies
  updated; `schemaSync.test.js` gained fixtures plus an explicit assertion,
  because parity alone is satisfied by both copies dropping the field.
- Verified by looking, as an anonymous visitor on a throwaway stack (vite 5198
  / serverXR 4098, scratchpad DATA_ROOT), headless Chromium swiftshader at
  1440×900: orbit arrival shows a glowing ring and a square-cornered doorway
  side by side; walk mode shows both; walking into the frame travels to the
  room it names.
- Both renderers already delegate portals to `PortalObject`
  (`EntityContent.jsx` in orbit, `LiveProjectScene.jsx` in walk), so one change
  covers both — confirmed in the browser on both paths.
- Not done: no Studio inspector control for `style`. It is document-authored,
  exactly like `labelPlate`/`labelFont`/`labelColor`, which have no control
  either.
