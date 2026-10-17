# UP-LA40WF — 40 W RGB laser, DMX / ILDA (2 units at the entry, U1, **32 ch — the owner's decision 2026-10-15 16:4x**)
**APPROVED (owner, 2026-10-15), U-Plus "IP-LL40"** (product page; manual IP-LL30 covers the 40 W column: R 10 W + G 15 W + B 16 W = 41 W — MOXIR.md §4.0b read the same numbers from the maker page; ~/Downloads/moxir/devices/IP-LL30.pdf, read 2026-10-15):
DMX modes 6 / 19 / 32 (29 / 52 listed, "19 / 32 available only"). 19 ch: 1 dimmer · 2 mode (0–49 auto, 50–99 sound, 100–149 PRG, 150–199 ILD, 200–255 built-in graphics) · 3 graphic (one per two values) · 4 display mode · 5 colour (0–16 white, 17–33 red, 34–50 green, 51–67 blue … 238–255 sound) · 6 X move · 7 Y move · 8 zoom · 9 X rotation · 10 Y rotation · 11 centre rotation · 12 gradual painting · 13 X wave · 14 Y wave · 15 strobe · 16 red · 17 green · 18 blue · 19 out-of-bounds. 32 ch = the same + ch 20–32 for a second graphic at the same time.
Menu: laser lock (closes when the angle is too small), ILDA lock, size X/Y, speed 8–40, DMX state show/black. Safety: scanning system notes, E-stop remote + key.
**Status:** this matches our 32-channel assumption; for a STATIC beam (our use) the desk needs ch 1 dimmer, ch 2 = 200+ (graphics), ch 3 a dot/line graphic, ch 5 colour, ch 6/7 position, ch 16–18 RGB. **APPROVED by the owner 2026-10-15 17:1x** as the IP-LL40 in 32-ch mode.
**Desk profile (static beam):** 1 dimmer · 2 = 200 (built-in graphics) · 3 = 0, graphic 1 — the manual names no graphic (one per two values), so which one is a single line or dot is ASSUMED: graphic 1 is the first, the cheapest to walk; setup-day check #3 · 4 = 0 normal display · 5 colour · 6/7 X/Y from the rig aim · 8 = 0 · 9–15 = 0 · 16–18 = 0 (per-colour levels, 0 = brightest) · 19 = 0 · 20–32 = 0 (the second graphic stays off). Held dark by deskLookValues until the IEC 60825-1 sign-off.

**maker: U-Plus Lighting (owner's eye on the manual, 2026-10-15 16:3x — devices.html). model: IP-LL40 (manual IP-LL30).** Chart with value ranges: `scripts/place/fixtures/charts/up-la40wf.json`; the desk's map: `src/rigbuild/fixtureTypes.js`. Changed 2026-10-15: the desk's 32-ch profile is a STATIC BEAM — it rests at ch 2 = 200, ch 3 = 0, ch 4 = 192 (point display), ch 5 = 8 (white), ch 6/7 = 64 (centre), ch 16–18 = 0 (brightest), the rest 0; ch 1 (dimmer) alone lights it, and a look still holds it dark until the laser sign-off. Which built-in graphic is a dot or a line is NOT in the manual (ASSUMED graphic 1 + point display; walk it on setup day). The tested Sevan values agree with the chart (white 8, red 25, centre 64, rotation 150).

## The printed manual with the unit (owner's photos, 2026-10-16 16:22) — agrees with the chart above row for row
Six photos, `photos/la40wf-manual-19ch-ch1-7.jpg`, `19ch-ch8-19.jpg`, `32ch-ch20-24.jpg`, `32ch-ch25-32.jpg`, `lcd-menu-1-9.jpg`, `lcd-menu-10-23.jpg`; read 16:3x.
"DMX-512 Channel function", 19CH mode and 32CH mode ("CH1 to CH19 is same as 19Chs mode; CH20 to CH32 is for the second graphics"), and "LCD Menu and function introduction".
Every value equals the IP-LL30 PDF chart in `scripts/place/fixtures/charts/up-la40wf.json` (its `manual.printed` block names the photos). Two misprints in the print, decided:
- **ch 2 (mode):** the print reads "250–255 built-in graphics" and lists nothing for 200–249; the PDF reads 200–255. Both hold 250–255, so the **static beam now sends 250** (was 200) — `fixtureTypes.js`, tests follow.
- **ch 25 (32 ch, zoom):** the print repeats "11–87" where the 19-ch table (ch 8) reads "88–150 zoom"; kept 88–150.
Desk labels for ch 8–15 and 19 now carry the print's names (zoom, X/Y rotation, centre rotation, gradual painting, X/Y wave, strobe, out-of-bounds); roles unchanged.

**LCD menu (the unit's own, 24 rows):** 1 DMX Address 1–512 · 2 Show Mode ILD / PRG / Auto / Sound (switches to DMX by itself when DMX is connected) · 3 Program Progr 0–4 ·
4 SD File folder · 5 SizeX −100..100 · 6 SizeY −100..100 · 7 Speed 8–40 (by the galvanometer) · 8 DMX State without signal: Show / **Black** · 9 Master / Slave · 10 Y Phasic · 11 X Phasic ·
12 Color Mode RGB / White · 13 **Laser Lock** ON/OFF (closes when the angle is too small) · 14 Sound sense 0–100 · 15 SD Sound · 16 Highlight 0–100 · 17 **ILDA Lock** · 18 Load Flash ·
19 Update Prog · 20 Red dimmer 0–255 · 21 Green dimmer · 22 Blue dimmer (20–22 valid in Auto/DMX, not ILDA) · 23 **DMX mode** 6ch/19ch/32ch/29ch/52ch ("19CH/32CH available") · 24 Language.
Setup day: menu 23 = 32ch, menu 1 = 401 / 433, menu 8 = Black, menu 13 on; then walk ch 3 for the single-line graphic (still unnamed in both manuals).

## Web search for a shape chart (2026-10-17 08:1x; owner: "mb check in internet mb there are shape chart")
- **No shape (graphics) chart is published.** The maker page (https://www.upluslighting.com/product/ip-ll40-waterproof-40w-rgb-animation-laser-light/,
  read 2026-10-17) shows none, and its "Download File" button has no link. The maker's download list (34 pages) serves files
  only through script buttons; page 1 and the user-manual page 1 list no laser file. The IP-LL30 PDF (19 pages) holds pictures
  only on pages 1, 3, 4 and 8–12 (cover, product views, safety labels, scanner notes, wiring): no pattern pictures (pdfimages).
  The printed manual names no graphic either. Six web searches (model, maker, the menu words "Laser Lock / ILDA Lock / X Phasic",
  the chart words "gradual painting / out-of-bounds") found no other brand's list for this board.
- **Maker page facts, unmeasured:** "TTL Scanning angle: Max 60°" (±30°, against ±18.5° ASSUMED in fixtureTypes.js cap.aim halfDeg)
  and "Scanner: 50K" (no unit given; read as 50 kpps).
- **Our own chart is the way (owed, the owner's choice):** step ch 3 through 0, 2 … 254 at a fixed pace onto a surface the camera
  sees, film it once, cut one picture per graphic into a sheet beside this file.

## Shapes, photographed by the owner (2026-10-17, red unit U2.137, 32 ch, ch 2 = 250 built-in graphics, ch 4 = 0 normal)
The owner moved the shape fader (desk Fader page, U2 ch 139) and photographed each shape on the pillar in front of the unit,
sent to di.bo (door bot, message ids below; originals in the inbox `/mnt/data/footage/inbox/2026-10-17/`). di.bo kept no
texts (ledger N650), so each photo's value comes from the WIRE: a read-only log of U2.137 ch 1-7 every 0.25 s
(`la40wf-shape-wire-log-2026-10-17.txt`, from 08:34 local), at the photo's send time minus 1.5 s. Photos before the log
are matched by ORDER from graphic 1 in steps of two values (the log's first value, 30 at 08:34:01, fits step two).
Graphic = value // 2 + 1 (maker chart: one graphic per two values). Sheet: `photos/la40wf-shapes-red-2026-10-17.jpg`.
From 08:34 the owner stepped by three values, so about one graphic in three has no photo yet. An 86 s video of the walk
(`1490-1116697124_1490.mp4`, sent 08:57) is not matched yet.

| graphic | value on the wire | matched | photo |
|---|---|---|---|
| 1 | 0–1 (assumed) | by order | photo-1296.jpg |
| 2 | 2–3 (assumed) | by order | photo-1300.jpg |
| 3 | 4–5 (assumed) | by order | photo-1304.jpg |
| 4 | 6–7 (assumed) | by order | photo-1308.jpg |
| 5 | 8–9 (assumed) | by order | photo-1312.jpg |
| 6 | 10–11 (assumed) | by order | photo-1316.jpg |
| 7 | 12–13 (assumed) | by order | photo-1320.jpg |
| 8 | 14–15 (assumed) | by order | photo-1324.jpg |
| 9 | 16–17 (assumed) | by order | photo-1328.jpg |
| 10 | 18–19 (assumed) | by order | photo-1332.jpg |
| 11 | 20–21 (assumed) | by order | photo-1336.jpg |
| 12 | 22–23 (assumed) | by order | photo-1340.jpg |
| 13 | 24–25 (assumed) | by order | photo-1344.jpg |
| 14 | 26–27 (assumed) | by order | photo-1348.jpg |
| 15 | 28–29 (assumed) | by order | photo-1352.jpg |
| 17 | 33 | by time | photo-1356.jpg |
| 19 | 36 | by time | photo-1360.jpg |
| 20 | 39 | by time | photo-1364.jpg |
| 22 | 42 | by time | photo-1368.jpg |
| 23 | 45 | by time | photo-1372.jpg |
| 25 | 48 | by time | photo-1376.jpg |
| 32 | 63 | by time | photo-1396.jpg |
| 34 | 66 | by time | photo-1400.jpg |
| 35 | 69 | by time | photo-1404.jpg |
| 37 | 72 | by time | photo-1408.jpg |
| 38 | 75 | by time | photo-1412.jpg |
| 40 | 78 | by time | photo-1416.jpg |
| 41 | 81 | by time | photo-1418.jpg |
| 43 | 84 | by time | photo-1420.jpg |
| 44 | 87 | by time | photo-1422.jpg |
| 46 | 90 | by time | photo-1424.jpg |
| 47 | 93 | by time | photo-1426.jpg |
| 50 | 99 | by time | photo-1428.jpg |
| 49 | 96 | by time | photo-1430.jpg |
| 50 | 99 | by time | photo-1432.jpg |
| 53 | 105 | by time | photo-1436.jpg |
| 55 | 108 | by time | photo-1438.jpg |
| 56 | 111 | by time | photo-1440.jpg |
| 59 | 117 | by time | photo-1444.jpg |
| 61 | 120 | by time | photo-1446.jpg |
| 62 | 123 | by time | photo-1448.jpg |
| 68 | 134 | by time | photo-1456.jpg |
| 71 | 140 | by time | photo-1459.jpg |
| 72 | 143 | by time | photo-1461.jpg |
| 77 | 152 | by time | photo-1467.jpg |
| 78 | 155 | by time | photo-1469.jpg |
| 84 | 167 | by time | photo-1474.jpg |
| 86 | 170 | by time | photo-1476.jpg |
| 87 | 173 | by time | photo-1478.jpg |
| 90 | 179 | by time | photo-1481.jpg |
| 92 | 182 | by time | photo-1483.jpg |
| 93 | 185 | by time | photo-1484.jpg |
| 95 | 188 | by time | photo-1487.jpg |

## The two units do not mix colours the same (TESTED 2026-10-18 02:2x, the owner's eye in the hall)
- Same DMX on both (desk output = wire, checked channel by channel); white (ch5 = 8): unit **137 shows a green cast**, unit 169 clean white.
  Both listen (white test 02:23, one-unit test 02:25). Not a patch fault: the unit's own colour mix.
- Fix in use: `la40-player.mjs --rgb --trim 137:g=100` — colour by the diodes (ch5 white + ch16-18 modulation, 0 = full, 255 = off:
  red = 0/255/255, green = 255/0/255, white = 0/0/0) so both units show the same colour; white on 137 gets green modulation 100 (owner: "now it's ok").
- Never pick a colour by ch5's table alone when both units must match.
- 2026-10-18 02:5x (owner's eye): laser 169 shows WHITE at colour 25 with graphic 2 and with the moving pictures, RED with the plain line
  (graphic 1) at 18 / 22 / 28 / 32. Its 40-120 values follow the chart (green, blue, magenta, segments). In use: every red scene = colour 28 + graphic 1
  on both graphics (motion kept). Owed: a walk of all graphics on 169 at colour 28 to know which other pictures stay red.
