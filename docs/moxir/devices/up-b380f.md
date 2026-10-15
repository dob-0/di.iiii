# UP-B380F — U-Plus IP65 380W Beam moving head (18 units, U1, 16 ch each) — chart APPROVED (owner, 2026-10-15)
**Desk profile = the unit's own "380 IP BEAM" manual chart** (mode `16ch`, `MAKER_CHANNEL_LISTS` in src/rigbuild/fixtureTypes.js; value ranges verbatim in `scripts/place/fixtures/charts/up-b380f.json`).
Order: 1 colour · 2 strobe · 3 dimmer · 4 gobo · 5 prism · 6 prism 1 rotation · 7 prism 2 rotation · 8 frost · 9 focus · 10 pan · 11 pan fine · 12 tilt · 13 tilt fine · 14 pan/tilt speed · 15 reset · 16 lamp.
The desk holds ch 15 and ch 16 at 0 (no function): it never resets, strikes or kills a lamp.
**ARCHIVED (reason):** the 10-09 TESTED walk map (Sevan's units, ch 1–10 walked; docs/moxir/b380f-16ch-map-check-2026-10-09.md) — 1 pan · 2 tilt · 3 pan fine · 4 tilt fine · 5 speed · 6 frost · 7 strobe · 8 dimmer · 9 colour · 10 gobo · 11–16 prism/focus/reset.
Kept selectable as mode `walk-2026-10-09` (ARCHIVED_CHANNEL_LISTS), never the default, never in the GDTF; replaced by the manual chart on the owner's word. It put pan on ch 1, the manual on ch 10 — setup-day check #1 settles which the units follow.
**ARCHIVED:** the equivalent chart PROST380 (another maker's 380 W head) moved from `sources` to the manifest's `archive` block (fixtures.json). The indoor U-Plus "380 Beam" manual (16/20 ch, IP20, 12 kg) is NOT this unit; its chart is no longer stored (the PDF stays in ~/Downloads/moxir/devices/380-Beam.pdf).
Owed: Sevan's own list (replaces nothing now; confirms it).

**Product pages for the owner's eye (2026-10-15 16:5x):** indoor "380 BEAM" https://www.upluslighting.com/product/mini-380w-beam-moving-head-stage-lights/ (380 W lamp, 600 W draw, 2°, 14 gobos + 14 colours, double prism, 16/20 ch, IP20, 300×240×530 mm, 12 kg) ·
IP65 "380W Beam" https://upluslighting.com/product/stage-lights-ip-outdoor-waterproof-380w-beam-moving-head-lights-for-show-dj/ (371 W Osram, 400 W, 16 ch, 27 kg, tilt 270°) — a different unit. Owner's approval: pending.
**APPROVED by the owner's eye (2026-10-15 17:0x, Screenshot_20261015_154953.png):** UP-B380F = UPlight Stage Equipment (Guangzhou) Co., Ltd. (= U-Plus Lighting), "IP65 380W Waterproof DJ Light Beam Moving Head for Outdoor Events",
https://up-light.en.made-in-china.com/product/qdrawUbcCMAf/China-IP65-380W-Waterproof-DJ-Light-Beam-Moving-Head-for-Outdoor-Events.html (page read 2026-10-15): model no. UP-B380F, 350XL/380 bulb, rated 500 W,
1.8°, pan 540° / tilt 270°, 14 colours, 13 gobos + open + a rotating wheel, 16-facet + honeycomb prism, strobe 0.5–14/s, IP65, 460×310×690 mm, 23 kg, **16 CH** — no channel list on the page.
So the INDOOR "380 Beam" manual's order (above) does not apply to our unit; the IP65 unit's own manual is "380 IP BEAM" on upluslighting.com (downloaded 2026-10-15, see below) — its table is compared with the TESTED map in this file.
**The unit's own chart — "380 IP BEAM" manual (upluslighting.com, 2024-01; ~/Downloads/moxir/devices/380-IP-BEAM.pdf; read 2026-10-15 17:1x) — APPROVED by the owner 17:1x ("yes the chart is right"):**
371 W Osram, 400 W max, 2°, IP65, 16 ch, RDM, pan 540° / tilt 270° (16 bit), 13 colours + white, 13 gobos + white, double prism 8 + 16, frost, strobe 0–25 Hz, 424×367×725 mm, 27 kg.
1 colour (0–4 white, 5-wide slots: 10–14 colour 1 … 130–134 colour 13, 140–199 rotate fwd, 200–255 rotate rev) · 2 strobe (0 close, 1–4 open, 51–240 slow→fast, 252–255 open) · 3 dimmer 0–255 ·
4 gobo (0–4 white, 5–69 gobo 1–13 in 5-wide slots, 70–128 rotate fwd, 129–131 white, 132–190 rotate rev, 191–255 shake gobo 1–13) · 5 prism (0–63 none, 64–127 prism 1, 128–191 prism 2, 192–255 both) ·
6 prism 1 rotation (0–127 0–400°, 128–191 fwd, 192–255 rev) · 7 prism 2 rotation (same) · 8 frost (0–127 none, 128–191 frost, 192–255 colourful) · 9 focus · 10 pan · 11 pan fine · 12 tilt · 13 tilt fine · 14 pan/tilt speed ·
15 reset (26–76 effects, 77–127 XY, 128–255 all) · 16 lamp (10–100 off, 101–255 on).
**Contradiction, stated:** the 10-09 walk on Sevan's units put pan on ch 1 and tilt on ch 2; this chart puts pan on ch 10 and tilt on ch 12. Both cannot be true for one unit in one mode. Decision
(owner's approval 17:1x): the desk sends THIS chart; the 10-09 walk map is archived (fixtureTypes.js keeps it as `up-b380f-walk-2026-10-09`, not the default); setup-day check #1: send pan on ch 10 — if
the head does not move and ch 1 moves it, switch the profile to the archived walk and say so. No lamp is lit by either chart until that check (ch 16 at 0 is "none"; lamp on = 101–255 — a 3-second lamp strike).
