## 2026-10-16 — the MOXIR truss on the ESP controller; the owner's manual photos are a 24/30-ch LED head

- Owner 04:2x at the venue: the ESP light controller (vizzz.di node BA6FCC, AP 192.168.4.1) wired to the truss; his addresses:
  beam 1 · 10 washes from 17 · beam 97 · 5 washes 113–152 · beams from 153 (1 or 11, asked). Patched on the node by its API
  (`/api/fixtures/add`), read back; written into `docs/moxir/devices/README.md` as the node's universe.
- Owner 05:0x, photos of the paper manual: a 250 W LED head, 24 or 30 ch (pan ch 1, tilt ch 3, dimmer 6, strobe 7/8, two
  gobo wheels, prism, focus, zoom, frost, an RGB halo ring). "our found one is not right" — the UP-B380F 16-ch chart is NOT
  the truss beam. New sheet `docs/moxir/devices/led250-head-24-30ch.md` (PHOTO status, model and shutter value owed),
  chart `scripts/place/fixtures/charts/led250-head.json`, photos under `docs/moxir/devices/photos/`.
- Not changed here: the rig file and the project (which units sit on the truss is the owner's word, ledger N882).
  Node profiles for the charts: vizzz.di PR #14 (built, tests 73/73, flash pending on the serial port).
