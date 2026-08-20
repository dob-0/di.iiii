# The vector/colour wave (TD audit, wave 3 of 5)

## What changed

Six pure taps and joins for the two compound wire types — the openers every
node tool has and this desk was missing:
- **Split** / **Combine** — a vector into its X/Y/Z and back; drive just
  the height, read just the sideways.
- **Channels** — a colour opened in BOTH alphabets at once: Red/Green/Blue
  and Hue/Saturation/Lightness, all 0..1, wire the reading you mean.
- **Compose** — R/G/B numbers back into a colour.
- **Distance** — how far apart A and B stand, and how long A itself is
  (the proximity trigger's other half: Distance → Compare → anything).
- **Ramp** — a three-stop gradient read at Position: sunrise through noon,
  where Mix only blends two.

Shared `colourMaths.js`: pure hex↔RGB↔HSL arithmetic; the colour wire
carries '#rrggbb', channels travel 0..1.

## Verified

Split/Combine inverse, 3-4-5 length, both colour alphabets on pure red,
hex recomposition, ramp endpoints/midpoint/quarter and clamping — all
unit-proven; example graph wires every one; family count 34→40; full
suite green; lint at baseline.
