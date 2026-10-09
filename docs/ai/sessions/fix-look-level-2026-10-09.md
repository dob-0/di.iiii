## 2026-10-09 — a look's level is drawn once in the public orbit view, not squared

- MOXIR, owner: "totally dark … I think something is tuned bad". The v2 spread (#864) had read
  `intensity = nominal × level²` in the renderer's own lamp list and could not find the second factor.
- Cause: the public viewer poses its scene in `RoomLookFollower` and hands the posed objects on. Walk / Fly drew them as
  handed. The orbit view (`StudioViewport`, the default) ran `useRigLookEntities` on them a second time, so light and
  haze drew at level², and a moving look's beat and a lighting desk's dimmer were applied twice. The Studio editor and the
  build and cards scenes posed once. Live since the rig-builder line (2026-09-28), on dev and main alike.
- Ruled out with tests that could fail:
  - a lighting desk's dimmer on top of the look (it replaces the look's level, from the document's nominal);
  - a deliberate square-law dimmer curve and a gamma or sRGB decode (one pass is linear at ten fader levels);
  - the measuring method (the renderer takes the object's number unchanged);
  - a build-time bake (the builder writes candela × 0.02, with no level).
- Fix: `StudioViewport` takes `lookDrawn` and draws a scene handed to it already drawn as handed.
  `PublicProjectSceneSurface` sets it whenever `RoomLookFollower` handed posed objects.
- Guard: `src/rigbuild/lookLevel.test.jsx`, 9 tests, traces one lamp from the look's json to the renderer. On the unfixed
  code the orbit view drew 152.39 for 304.78 and the source check failed; with the fix, 9 / 9 pass. Known-fixes row added.
- Owed:
  - every MOXIR level below 1 now draws 1/L brighter in the orbit view. The levels tuned against the squared view (the v2
    spread's stage faders and wing peak; B tuned's T5; v2 planes / lines plane 3; the work-light and motion layers set by
    eye) are listed for the lead to decide, in the MOXIR lead's report `look-level.md`. Nothing was re-tuned here;
  - the renderer's lamp list re-read on moxir-test after the fix is folded, then the owner's look.
