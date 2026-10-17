# feat/la40-graphics-2026-10-17 — the 40 W lasers' graphics: the test pattern and the shapes never used

## 2026-10-17 — test pattern value 24 (square); 37 graphics to avoid, from the owner's sweep video
- Owner: "write in memmoery that is bad shapes that we will not use it in future and what value is the test pater for easy test in future",
  then "you know what values to not use in laser there are 32 ch and it dublicate so you need to calclaute".
- Method: his 86 s fader sweep (di.bo video-1490) matched to the desk's wire log; the video's start fixed on the sweep's slow opening
  (one graphic per second there) and checked against his slow-walk photos, which agree shape for shape from graphic 17 on.
- Result in `scripts/place/fixtures/charts/up-la40wf.json` → `graphics`: testPattern value 24 (graphic 13, square); avoid 11 dot or
  blob graphics, 5 broken, 21 duplicates (each named with the earlier graphic it repeats); 14 not seen in the video. Prose and sheets
  in `docs/moxir/devices/up-la40wf.md`. The list holds for ch 3 and ch 20 of both units.
- Owed: fast-sweep graphics (under 0.35 s in the video) may be one off; a show uses a value only after one look on the real unit.

## 2026-10-17 — the owner's never-use list replaces the agent's categories
- Owner: "i don like heart one and deleted that one and also the numberes and arrows, so dont use that values what itold and you can make it approx".
- `graphics.neverUse` now: hearts 78-79, 166-167; arrows 74-75 (+ arrowheads 92-93, 98-99, 108-109, 177-178); numbers 246-253
  (+ number-like 180, 203-205). Test pattern stays value 24 (the square). Dots and blobs stay as a SAFETY note, not taste.
- Read from the sweep video with the wire value printed under every frame (three sheets `la40wf-shapes-by-value-*`); the earlier
  graphic-numbered sheets are removed (their graphic numbers were one off in places and confused the reading).
