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
