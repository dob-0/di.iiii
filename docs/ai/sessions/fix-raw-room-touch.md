# The mobile touch wave (real-S24 audit findings 1–5)

## Findings, from a real-device audit driven over adb

A hands-on audit on the owner's Galaxy S24 (real input stack, screenshots
read) falsified "touch works in the room" and found the phone's real story.

## What changed

1. BLOCKER — objects could not be finger-moved in the scene (fine under
   every emulation, dead on hardware). THE FIX THAT WORKED: the drag's
   move/end handlers now hang on the grabbed object as well as the floor
   plane, so the drag rides the grabbed object's own pointer capture.
   The touch-action lead was a partial red herring: R3F writes an inline
   touch-action auto on the canvas (a class rule loses to it) but an
   inline none on its wrapper div, so browser gestures were already
   blocked by the ancestor intersection. The CSS rule stays as defence in
   depth, with !important so the canvas measurement finally reads none.
2. Hardware Back at ROOT rendered a false-empty canvas over an intact
   document (the depth guard was `> 0` against a stack whose root length is
   1 — Back navigated to index -1). Now Back at root stays put and re-arms;
   inside a scope it still pops one level. Tests prove both.
3. New cards landed under the incoming docked inspector (3/3 creations on
   the S24 occluded). The placement clamp now reserves the lower 45% of the
   canvas on coarse pointers. Test proves the clamp.
4. Wire endpoints: drop radius doubles for touch releases and every port
   dot carries an invisible ~44px halo on coarse pointers.
5. A wire that dies on release SAYS why, where it died ("Colour can't feed
   Size (Vector)" / "release it on a lit port") — the two silent failure
   modes were indistinguishable. Test asserts the notice.

## Verified

Suite 2489/2489, lint below baseline, build/anatomy/wiki/docs green.
REAL-DEVICE CHECK (2026-08-20, S24 over adb, screenshots read): a single
finger swipe moved the seeded cube from [0, 0.5, 0] to [1.11, 0.5, 2.42]
and opened its inspector — drag, selection and inspector all live on
hardware. Emulation is proven meaningless for this bug (it never
reproduced there).
