## 2026-10-13 — MOXIR v2.9: eight light scenes, two new colours (flame, ice), seven moving looks

- Owner (16:3x): "i need to other colorts and animations there also"; (15:5x) "scenes that i can understand well". Brief
  B-2026-10-13-scenes-colour from the MOXIR lead. Stacked on fix/moxir-selection-box-and-scenes-2026-10-13.
- `scripts/place/moxir_v2_8_floor.py` step 3b: the palette rule (show = ember + ash, both on the blackbody line; FLAME =
  blackbody 2,000 K, ICE = ember's complement, computed in the script and pinned by an assert; new colours only on the RGBW
  UP-PL5403, the UP-B380F wheel slots are unpublished) and eight looks, each with a one-line intent: ice and fire (still),
  the red wave, embers, ice rings, run to the DJ, left/right, flash (5 s, strobe under 3 Hz), the lasers breathe.
- Moving looks use the existing `motion` field (desk fx.js modes played by src/rigbuild/lookMotion.js). Its limits, from
  the code: one effect per look on every lit lamp of its `kinds`, level only (no pan, tilt or colour change), no beat
  sync with the music (tempo fixed per look).
- `scripts/rigbuild/epic-build.mjs` v1Looks now keeps a look's `motion` (it dropped it, so a v2 rig's moving looks
  landed still). Test in epic-build.test.js.
- Regenerated rig: only `looks` and `cues` changed (15 -> 23 each), old entries byte-equal, idempotent.
- Applied looks-only to moxir-v2-9 on the scratch stack moxir-one (backup in
  ~/di-backups/moxir-scratch/2026-10-13-v2-9-before-colour-motion): 149 entities before and after, only rig-show's
  rigLooks changed, the owner's moved lamp rig-par-planes-12 kept its place.
- Not seen yet: no browser run (heat lock). The owner's look in the Studio/room picker is owed.
