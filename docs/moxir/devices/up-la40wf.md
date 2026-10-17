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
