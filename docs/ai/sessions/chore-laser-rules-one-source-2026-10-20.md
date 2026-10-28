
## Laser safety rules: one home each

- Distances: `scripts/place/laser-distance.mjs` now also holds `LASER_HAND_REACH_M` (2.4) and `LASER_HAND_RULE_M` (= 3 m + 2.4 m = 5.4 m, owner 2026-10-12). Source of the 3 m: US FDA laser-light-show variance (see the file's comment); the 2.4 m hand is the owner's.
- 40 W UP-LA40WF never-use DMX values (74-75, 78-79, 166-167, 246-253, owner 2026-10-17, ledger N1037): home is the device's chart `scripts/place/fixtures/charts/up-la40wf.json` (`graphics.neverUseValues`, new `safety.dotValueRanges`), documented in `docs/moxir/devices/up-la40wf.md`.
- Readers: `scripts/place/laser_rules.py` (python reads the .mjs and the chart; fails loudly) used by laser_margin.py, laser_sheet.py, moxir_v2_7_lines.py, moxir_v2_8_floor.py; `scripts/rigbuild/la40-player.mjs` reads the chart. Copies removed: 5 (laser_margin 5.4, v2_7 5.4, v2_8 5.4, la40-player never list, la40-player dot ranges).
- Test `scripts/place/laser-rules-one-source.test.js` fails if a script retypes the list, the dot ranges or 5.4.
- Owed (show behaviour, needs the owner): the desk raw API (`serverXR/src/lighting`) does NOT refuse never-use values; only la40-player refuses them. Not changed here.
- Not done: other 3 m literals in prose strings of dated generators (narrative, not rules).
