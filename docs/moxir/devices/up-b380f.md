# UP-B380F — U-Plus IP65 380W Beam moving head (18 units, U1, 16 ch each) — chart = the PRINTED manual with the unit (owner, 2026-10-16)
**Desk profile = the printed "MOVEHEAD FIXTURE USER MANUAL" shipped with the unit**, Chapter 3 "Channel description", 1. Channel table (LIST-1), pages 13–15 —
photographed by the owner 2026-10-16 16:22 ("the beam real chart"), read 16:3x, values verbatim in `scripts/place/fixtures/charts/up-b380f.json` (mode `16`, APPROVED).
Photos: `photos/b380f-manual-p13-ch1-9.jpg`, `p14-ch9-10.jpg`, `p15-ch10-16.jpg`. The cover page is not photographed: the owner names it the beams' manual.
Desk list: `MAKER_CHANNEL_LISTS['UP-B380F']` in `src/rigbuild/fixtureTypes.js` (mode `16ch`, the default).

**Order (pan FIRST):** 1 pan (0–540°) · 2 tilt (0–270°) · 3 pan fine · 4 tilt fine · 5 pan/tilt speed (fast→slow) · 6 frost · 7 strobe · 8 dimmer · 9 colour · 10 gobo ·
11 prism 1 · 12 prism 1 rotation · 13 prism 2 · 14 prism 2 rotation · 15 focus (far→near) · 16 reset.
- **6 frost:** 0–127 none · 128–191 "insert colourful" (a colour filter, not frost) · 192–255 insert frost. The room draws frost at 192–255 only.
- **7 strobe:** 0–3 dark · 4–103 pulse strobe slow→fast · 104–107 open · 108–207 fade strobe slow→fast · 208–212 open · 213–251 random strobe slow→fast · 252–255 open. The desk rests at 255.
- **9 colour:** 0–4 white · 5–9 white+colour 1 · 10–14 colour 1 · 15–19 colour 1+2 · … 5-wide slots up to 130–134 colour 13 · 135–139 colour 13+14 · 140–200 rotate forward (fast→slow) · 201–255 rotate reverse (slow→fast).
- **10 gobo:** 0–4 white · 5–9 gobo 1 … 85–89 gobo 17 (5-wide) · 90–128 rotate reverse (fast→slow) · 129–131 stop · 132–170 rotate forward (slow→fast) · 171–175 shake gobo 1 … 251–255 shake gobo 17.
- **11 / 13 prism 1 / prism 2:** 0–127 none · 128–255 insert. **12 / 14 rotation:** 0–127 = 0–360° (an index) · 128–190 forward (fast→slow) · 191–192 stop · 193–255 reverse (slow→fast). The room draws the index; a spin has no phase (`spin: true`).
- **16 reset:** 0–99 none · 100–105 lamp OFF over 3 s · 106–199 none · 200–205 lamp ON over 3 s · 206–209 none · 210–215 reset XY motor · 216–219 none · 220–235 reset effect motor · 236–239 none · 240–255 reset fixture.
  **The desk holds ch 16 at 0:** it never strikes, kills or resets a lamp. There is no separate lamp channel.

**What this settles (2026-10-16):** the 2026-10-09 walk on Sevan's units (`docs/moxir/b380f-16ch-map-check-2026-10-09.md`, ch 1–10 walked) had this very order — the walk was right.
The downloaded U-Plus "380 IP BEAM" PDF (upluslighting.com 2024-01, pan on ch 10, colour first), approved on 2026-10-15 from a product page, is **NOT the unit's chart**.
It is **ARCHIVED**: `up-b380f.json` → `archive.pdf_380_ip_beam` (its value ranges kept), desk mode `pdf-380-ip-beam-2026-10-15` (`ARCHIVED_CHANNEL_LISTS`), manifest `archive.PDF-380-IP-BEAM`.
The walk map stays as desk mode `walk-2026-10-09` (ARCHIVED, same order, its caps were ASSUMED where the manual now states them). Neither archived mode is a default or in the GDTF.
**Still OPEN (manifest `specs.dmx_order.open`):** ch 11–16 are named by the manual but not yet walked on a unit; the old desk's "Beam 16ch" held ch 13 at 145 ("required or no light") — by the manual that inserts prism 2.
Walk one unit 0..255 per channel on setup day; until then ch 11–16 rest at 0.

**Setup-day check #1 (rewritten):** send pan on ch 1 and tilt on ch 2 — the head must follow (the manual, the walk and the desk agree). If it does not, say so at once: that unit runs another mode on its display (set it to the 16-ch mode).

**History:** 2026-10-09 walk (TESTED ch 1–10, pan ch 1) → 2026-10-15 PDF chart approved from the product page (pan ch 10; contradiction written down; setup-day check "ch 10 vs ch 1") →
2026-10-16 the printed manual with the unit (pan ch 1) — approved by the owner's send. Product pages and the maker's identity (U-Plus Lighting = UPlight Stage Equipment (Guangzhou) Co., Ltd.,
owner's eye 2026-10-15 17:0x): see `git log -p` of this file before 2026-10-16 and `fixtures.json` kinds.beam380. The 10-15 "380-IP-BEAM.pdf" stays at `~/Downloads/moxir/devices/`.
Owed: Sevan's own list (confirms, replaces nothing now).
