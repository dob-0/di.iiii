## 2026-10-15 — the devices' makers and charts into di.iiii (owner 16:3x: "yes fine, that's right — so fix it now, and add it to our equipment list")

Branch `feat/moxir-devices-charts-2026-10-15` off `feat/moxir-v2-10-forty-2026-10-15`; Sonnet on the API credit (lead f41c885f).

- **Maker:** UP-PL5403, UP-B380F, UP-LA40WF, UP-YZ31P are U-Plus Lighting (owner's eye on the manuals, devices.html). `scripts/place/fixtures/fixtures.json`
  kinds `par`, `beam380`, `laser`, `smoke` gain `maker`, `maker_basis`, `maker_model`, `manual` (url, date, local file, read date, basis CANDIDATE) and
  `maker_chart` (a pointer to the chart file). `typesFromManifest` prefers `kind.maker` over the rental label's, so the type library, the equipment sheet,
  the patch CSV and the GDTF file name now say U-Plus. The lasercube is not U-Plus (`maker_note`, `control`: network).
- **Charts with value ranges:** `scripts/place/fixtures/charts/<code>.json` — PL5403 4/8 ch, LA40WF 19/32 ch (from the IP-LL30 manual), B380F 16/20 ch
  (the U-Plus "380 Beam", marked `order_differs_from_tested`), YZ31P 1 ch ASSUMED (source: none). Ranges are `[from, to, meaning]`. Never what the desk sends.
- **The desk (`src/rigbuild/fixtureTypes.js` TESTED_CHANNEL_LISTS + `dmxDecode.js` `encodeDmx`):** PL5403 8ch ch 7/8 named (function choice, speed), rest 0 —
  bytes unchanged. LA40WF 32ch is a STATIC BEAM: rests at ch 2 = 200, ch 3 = 0, ch 4 = 192 (point display), ch 5 = 8 (white), ch 6/7 = 64, ch 16–18 = 0
  (0 = brightest), ch 20–32 = 0; new caps `laserColour` (ch 5 slots) and `aim` (ch 6/7: pan/tilt degrees over ±`scan_field_half_deg` 18.5, ASSUMED, centre 64,
  clamped). B380F stays the TESTED map. Roles are unchanged, so a desk that holds these profiles keeps them (rigpatch 14/14).
- **Not in the manual:** which built-in graphic is a dot or a line (ch 3 lists none; "one graphic per two values"). ASSUMED graphic 1 + point display; walk on
  setup day. A laser in a look is still held dark (deskLookValues), and looks do not pass pan/tilt for a laser: the aim bytes work through `encodeDmx` only until
  that is wired with the sign-off (owed, row below).
- **Equipment list:** `docs/moxir/MOXIR.md` §4.3 gains the by-kind table and the re-checked universe maths (U1 353 of 512, U2 40 × 8 = 320; the old "400" was the
  50-PAR order). The rig's `kit` stays plain counts (`moxir-v2-cranes.test.js` compares it); maker/model/manual per kind are the sibling `kit_makers`.
  The project's `rentalList` has no maker/model field (`normalizeRentalList`, client + server twin), so it is not extended: the sheet reads the maker from the types.
- **Tests:** `src/rigbuild/uplusProfiles.test.js` (11: channel counts, known look → exact bytes, chart agrees with the desk's colour slots). Re-pinned two
  expectations the maker change moves on purpose (`mvr.test.js` GDTF file name, `sheet.test.js` CSV). `rigpatch` 14/14.
- **Not mine, found red:** `src/shared/buildLook.test.js` "epic-build still gives… (0 differences)" fails on the show branch before this change too
  (digest b8c2bd1a…, pinned a9018456…) — checked by reverting my four source files; left alone.
- **Owed (ledger rows needed):** walk B380F ch 11–16 and the laser's graphic on setup day; Sevan's own DMX lists replace every ASSUMED/CANDIDATE row; lasers in looks
  with the aim once the sign-off exists; the other UP-* kinds (250BSW, HK1915…) still say "UPlight Stage Equipment" until the owner's eye covers them.
