## 2026-10-01 — a rig lamp's real light is fitted to its beam angle

- From emily-41's render audit, finding A (first half). A rig lamp's `light.angle` is half its datasheet BEAM angle, the 50 % point (rig-lib.mjs `half`). three.js reads a SpotLight's angle as the 0 % cutoff, so pools were narrower than the beams landing on them and washes lit surfaces ~2.4× too little.
- `spotBeam.js spotLightCone({ angle, penumbra })` solves the cutoff and penumbra so three's falloff (a smoothstep in cos θ) crosses 50 % exactly at the beam half-angle. On-axis candela is unchanged.
  - The profile is ASSUMED from the lamp's own penumbra. ≥ 0.3 is a wash: penumbra 1, the softest three has, with the 10 % edge ≈1.27× the 50 % point (a real wash is nearer 1.8; three cannot go softer). Below that is a beam: penumbra 0.3, ≈1.1×.
  - No rig datasheet gives a field angle; when one does, fit to it.
- SpotLightObject takes `fitted`, which both renderers set for entities with `components.fixture`. Only the `<spotLight>` uses the fitted cone; the beam in the air (BeamInAir / the flat cone) keeps the datasheet angle. An authored spot is untouched.
- The pools pass for beam-only lamps (the finding's second half) is parked as a joint call. The MOXIR known rooms have every lamp real.
- Tests: spotBeam.test +2, SpotLightObject.cone.test +2 (the fitted case red on the old code); spotLightAim.test's renderer-parity list gains `fitted`. 291 passed in src/objectComponents + src/project/viewport.
- Seen on PONYO (Chrome on the RTX 5060), Known, Red room from the floor: the roof pools and the column spill are wider and softer. Frame rate unchanged (~120 fps).
