# MOXIR — the real charts (2026-10-16 16:2x–17:xx)
**Asked:** "i found the beam and the laser real charts ill sent you make it real one and add our base!" — 9 photos via di.bo 16:22 (photo-1093…1101).
**Found:** the beams' PRINTED manual (pp. 13–15, 16 ch) puts **pan on ch 1** — the order of the 10-09 walk (archived on 10-15). The desk's default since 10-15, the downloaded "380 IP BEAM" PDF
(pan ch 10, colour first), is NOT the unit's chart. The laser's printed manual equals our IP-LL30 chart row for row; two misprints decided (ch 2 → the static beam sends 250, inside both readings).
**Changed:** `charts/up-b380f.json` (printed chart APPROVED; the PDF chart in `archive.pdf_380_ip_beam`), `charts/up-la40wf.json` (`manual.printed`, misprints, LCD menu), `fixtures.json`
(manual, `specs.dmx_order` EXACT from B380F-MANUAL-PRINT, two sources, archive.PDF-380-IP-BEAM), `fixtureTypes.js` (MAKER list = the printed order with the manual's caps; ARCHIVED lists may be
an array: walk-2026-10-09 + pdf-380-ip-beam-2026-10-15; laser labels from the print, ch 2 default 250), `dmxDecode.js` (a prism rotation cap may state its index range: 0–127 angle, above = spin with no phase),
`types/moxir.json` regenerated, 9 photos in `docs/moxir/devices/photos/` (1400 px, 2.2 MB), the three sheets.
**Tests:** `vitest run src/rigbuild src/shared/buildLook.test.js scripts/place/fixtures.test.js src/objectComponents` → 1856 passed, 1 failed: `moxirV2Patch.test.js` "lays 71 lamps…" fails on the
show branch 94dfe77d too (moxir-v2-ground-2026-10-09.json: no smoke-planes warning) — pre-existing, not touched here. The parity digest (buildLook) did not move.
**Not tested:** no unit was walked; ch 11–16 of the beam are named by the manual only (manifest `dmx_order.open`). The desk sends pan on ch 1 from the next deploy — the units on the ESP node (N882) still
carry placeholder profiles until the vizzz.di profile follows this order (owed row).
**Cost:** one chat, ~25 tool rounds, ~110 k tokens of context; 9 images read once at 1800 px.
