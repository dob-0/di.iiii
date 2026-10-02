## 2026-10-02 — MOXIR: the area stage, the corrected hall, the realism renderer, and the audit fixes

One branch for everything MOXIR built on PONYO since #704–#712 landed (Emily: "push what we did … push to dev"). It merges the local integration branch `moxir-local-2026-10-01` onto dev. The fork's dev merged it without a conflict.

- **The stage (Known · full, "the area").** 50 UP-PL5403 + 18 UP-B380F on their tested charts.
  - Blade curtain under the cut, vista PARs behind the press, a lighthouse B380F, neighbour-span red, the press sculpted.
  - A 10-cue loop. Nothing moves on a truss (owner's rule); the movers stand on the ground.
  - Data lives in `scripts/place/rigs/moxir-2026-10-17-known-full.json` and its show/rental files.
- **The hall, 2026-10-02 corrections** (`moxir-hall-dims-2026-10-02.json`, `hall.py`, `swap-hall.mjs`).
  - Two closed bays on the left, an open right row, cab at +x, roof 10.8, lantern 3.2.
  - The permanent objects near the stage, the far crane at 76.2, one floor track.
- **SmartView.** The Inside toggle, landing and preset views composed (no fade), and a clean cut-out instead of a Bayer stipple.
- **Desk and rig pages.** The audit passes: output badge, Touch strip, 44 px phone targets, Blackout says ON, the steps row folding under 1680 px, Touch forwarding.
- **The realism renderer: #716 merged in**, with #719–#723.
  - Haze worked out from the hazers, real bloom, beam optics, the floor's worn concrete and the beams' reflections in it.
  - The rooms' `renderSettings` turn it on; on PONYO, Known · full has `atmosphere.haze {}`, `bloom {enabled}` and `surfaces.floor` (reflect 0.5). That is data, not git.
- **2026-10-02 audit fixes.** Each has a known-fixes row and a guard.
  - The occlusion cut-out never cuts above the roof's underside. It had opened a black disc of sky over the stage.
  - A depth-only roof cap: beams end at the cut roof in the Side view.
  - PCFShadowMap everywhere, so there is no deprecation warning.
  - No bloom and no haze veil on surfaces while the camera is outside the hall: Top had a white blob, Side a white slab.
  - Phone interior presets stop at the room's box and widen the lens instead of leaving the hall.
  - `rigSteps.css` uses rhythm tokens.
  - `knownFullObjects.test.js` now selects the spot lights it meant to check; it had matched 0 lamps.

**How it was checked.** In headless Chrome on PONYO's RTX 5060 (Playwright `channel: 'chrome'`): every view twice through the cue loop, desktop 1710×1630 and phone 390×844, console clean, 70–120 fps. The full suite was compared with clean dev: the four new failures are fixed here; the rest is dev's Windows baseline.

**Owed**
- Four lamps stand inside permanent objects (`KNOWN_INSIDE` in `knownFullObjects.test.js`): `par-press-cut-03`, `par-press-sides-01/02`, `beam380-columns-02`. The owner chooses between moving the lamps and correcting the boxes.
- Haze σ 0.02, bloom 0.03 and floor reflect 0.5 are not yet compared with the RIG_BUILD §20 photographs. The joint call with Gevorg is owed.
- Panorama 037 and full-resolution photos are owed: the walled bays and the shed.
- A Top view with lamp markers was proposed, not built.
