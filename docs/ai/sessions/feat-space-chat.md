## 2026-08-27 — the room stands on the lower part of the screen

The toybox fit the camera so nothing was ever cropped, and on a portrait phone
that meant the width binding at 94% while the height reached 35%. Measured on
Gor's real room at every bearing from 0 to 180 and every elevation from 18 to
42: the leftover two-thirds is geometry, not arithmetic anyone got wrong.

What was wrong was where it went. Centring the content splits it evenly, and the
lower half is blank near-floor, flat-lit, under the child's own thumb — which is
what "the room looks empty" meant when it was said. `makeFraming.js` now seats
the room below the middle of the screen and gives the rest to the sky, so the
horizon is in the picture and the room has a distance in it. It PANS the eye
rather than tilting it, so the elevation the rest of that file reasons about
stays what it says and nothing in frame leaves it sideways; the seat asks, and a
foot margin and a headroom margin refuse.

Three were looked at on a 390×844 screen before this one was picked: centred
(the even split), 0.5 (objects standing on the bottom edge with two-thirds of
haze above them), and 0.22.

`makeFraming.test.js` is new and measures every corner of every object in
normalised device coordinates — nothing off any edge, the room seated low but
not touching the bar, the horizon in shot, and the same on a laptop. It fails at
`SEAT = 0`, which is what it is for.

Not code, but the larger half of the same fix and recorded in `known-fixes.md`:
the camp scaffold stood its pieces in a ROW across the room, and a row across is
the one shape a portrait phone cannot hold. Re-seated as a room you look into,
the same objects come out two to three times bigger.
