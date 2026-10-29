# LED 250 W moving head, 24 / 30 ch — chart from the owner's photos of the paper manual (2026-10-16 05:0x) — CANDIDATE
**Model and maker: not on the photographed pages** (owner's photo of the cover owed). "2. Technical parameters": AC 100–240 V 50/60 Hz, rated 280 W,
light source 250 W LED, colour temperature 8 300 K, prism "1 round 3 prism", strobe 1–25 /s, dimming 0–100 %. Zoom, frost ("atomization"),
two gobo wheels, one prism, and an RGB "glow" ring (a halo LED ring round the lens with its own master, "glow total tone").
**Which unit this is in the rig is OPEN** (asked 05:0x): the owner first said the truss beams are "16 ch" (UP-B380F chart); these pages are 24 or 30 ch.
Photos: `photos/led250-manual-p1-ch1-9.jpg … p4-ch17-30.jpg`. Status of every row: **PHOTO** (read from the manual's table, not walked on a unit).
Chart with value ranges: `scripts/place/fixtures/charts/led250-head.json`. Node profiles: vizzz.di `led250-24`, `led250-30` (PR #14).

| 24CH | 30CH | function | values | effect |
|---|---|---|---|---|
| 1 | 1 | X (pan) | 0–255 | horizontal sweep |
| 2 | 2 | X fine | 0–255 | |
| 3 | 3 | Y (tilt) | 0–255 | vertical sweep |
| 4 | 4 | Y fine | 0–255 | |
| 5 | 5 | X/Y speed | 0–255 | fast to slow |
| 6 | 6 | total dimming | 0–255 | 0 % to 100 % |
| – | 7 | total dimming fine | 0–255 | |
| 7 | 8 | strobe | 0–5 · 6–37 · 38–69 · 70–101 · 102–133 · 134–165 · 166–197 · 198–229 · 230–255 (the manual prints NO labels; two extra rows 192–223 / 224–255 overlap — a print error) | **UNKNOWN which value opens the shutter**: walk it on the unit (setup-day check) |
| 8 | 9 | colour wheel | 0–5 white · 6–16 c1 · 17–27 c2 · 28–38 c3 · 39–49 c4 · 50–60 c5 · 61–71 c6 · 72–82 c7 · 83–93 c8 · 94–192 any position · 193–223 rotate cw fast→slow · 224 stop · 225–255 rotate ccw slow→fast | |
| – | 10 | colour wheel fine | 0–255 | |
| 9 | 11 | rotating gobo wheel | 0–5 open · 6–15 g1 · 16–25 g2 · 26–35 g3 · 36–45 g4 · 46–55 g5 · 56–65 g6 · 66–75 g7 · 76–80 open · 81–96 g1 shake … 177–192 g7 shake (16-wide, slow→fast) · 193–223 wheel cw fast→slow · 224 stop · 225–255 wheel ccw slow→fast | |
| 10 | 12 | gobo rotation | 0–5 0° · 6–128 position · 129–191 cw fast→slow · 192 stop · 193–255 ccw slow→fast | |
| – | 13 | gobo rotation fine | 0–255 | |
| 11 | 14 | fixed gobo wheel | 0–5 open · 6–10 g1 · 11–15 g2 · 16–20 g3 · 21–25 g4 · 26–30 g5 · 31–35 g6 · 36–40 g7 · 41–45 g8 · 46–48 g9 · 49–64 g1 shake … 177–192 g9 shake (16-wide) · 193–223 cw fast→slow · 224 stop · 225–255 ccw slow→fast | |
| 12 | 15 | prism | 0–5 none · 6–255 prism in | |
| 13 | 16 | prism rotation | 0–5 0° · 6–128 position · 129–191 cw fast→slow · 192 stop · 193–255 ccw slow→fast | |
| – | 17 | prism rotation fine | 0–255 | |
| 14 | 18 | focus | 0–255 | near to far |
| – | 19 | focus fine | 0–255 | |
| 15 | 20 | zoom | 0–255 | near to far |
| – | 21 | zoom fine | 0–255 | |
| 16 | 22 | frost ("atomization") | 0–255 | shallow to deep |
| 17 | 23 | glow ring master ("the glow total tone") | 0–255 | |
| 18 | 24 | glow red | 0–255 | |
| 19 | 25 | glow green | 0–255 | |
| 20 | 26 | glow blue | 0–255 | |
| 21 | 27 | glow effect | 0–255 | |
| 22 | 28 | effect speed | 0–255 | |
| 23 | 29 | effect fade ("dragged down") | 0–255 | |
| 24 | 30 | function | 0–25 none · 26–76 all reset (5 s) · 77–127 XY reset (5 s) · 128–178 head reset (5 s) · 179–254 none | the desk holds it at 0 |

**Desk / node mapping:** pan, pan fine, tilt, tilt fine, dimmer, strobe, and the ring as r/g/b with its master as role `halo`; every other channel is `none` (stays 0: open
white, no gobo, no prism, focus/zoom at 0 = near, no frost, no reset). Owed: the shutter value (walk ch 7/8), the model name (cover photo), and whether
0 on focus/zoom is a usable look (zoom 0 = narrowest? the manual says "near to far").
