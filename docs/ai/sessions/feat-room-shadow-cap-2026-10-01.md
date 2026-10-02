## 2026-10-01 — A room of many lamps keeps its shadows: the brightest twelve throw

- Asked on MOXIR (PONYO): every lamp a real light, "100% ident what we will have, you can optimize". Known · full has 64 real lamps. Shadows were all-or-nothing: every spot light became a caster, and past ~12 the texture units run out and every lit material fails to compile, so rooms with more real lamps had shadows switched off entirely.
- `src/project/viewport/shadowCasting.js`: `dressForShadows(root, mapSize, { maxLights })`. Past the cap, exactly `maxLights` lamps throw: the ones putting the most light into the room now (`shadowScore` = intensity × the cone's solid angle, as lightPool.js scores), with a 15 % hold for a lamp that already throws so near-equal lamps do not trade shadows back and forth. Exactly that many, lit or not, so the shader's count of shadowed lamps never changes when a look does (no recompile hitch). `shadowLampCap(maxTextures)` = min(12, units − 4).
- `ShadowCasting.jsx` passes the GPU's cap (`gl.capabilities.maxTextures`). It already re-dresses every 30 frames, so shadows follow the look.
- Measured on PONYO, 1440×900, Playwright Chrome (most likely on the AMD 860M iGPU, not confirmed): Known · full, 64 real lamps, shadows on: 36–49 fps; Known, 36 lamps: 58–75 fps; 12 casters, all lit, in every look tried. On the RTX 5060 (emily-41, Chrome): Known · full, shadows on: 61 fps floor view, 65 fps DJ view.
- Not changed: rig-lib `nightOps` / rig.mjs still write shadows OFF past 12 real lamps, because an older viewer without this cap would go black. Lift it once this has shipped.
- Tests: shadowCasting.test +3 (2 red on the old code; the undress one is a guard). Wiki: the shadows paragraph says how a room of many lamps casts.

## 2026-10-01 (later) — the cap counts the units the materials use

- emily-41 (haze work) saw MOXIR Known · full draw black on Chrome/ANGLE D3D11 (16 units): "FRAGMENT shader texture image units count exceeds MAX_TEXTURE_IMAGE_UNITS(16)". On their stack the cause was dev WITHOUT this branch: all 64 lamps cast. With this branch, PONYO under the same D3D11 limit measured 12 casters, no shader error. But the fixed 4-unit reserve was a guess: a lit material with more than 4 maps would still overflow at 12.
- `dressForShadows(…, { maxTextures })` now counts each lit material's own samplers (`materialSamplers`: its maps, plus the scene environment on a standard material without its own), the other lights' shadows and the spot-light maps, and keeps one unit spare. The cap is min(12, what the busiest material leaves). `shadowLampCap` is gone; ShadowCasting.jsx passes `gl.capabilities.maxTextures`.
- Tests: shadowCasting.test +3 (2 red on the old code; the third holds the 12 ceiling on a 32-unit GPU).

## 2026-10-01 (later) — a strobe does not flip the shadows

- Render audit K: a strobing lamp's light is flashed per frame (StrobeDriver). Scored on its instantaneous intensity, it won and lost a shadow on alternate re-dresses, every 30 frames.
- `shadowScore` uses `light.userData.nominalIntensity` when present. SpotLightObject writes it from its `intensity` prop, which a flash does not move.
- Tests: shadowCasting.test +1 (red on the old code); 291 passed in src/project/viewport + src/objectComponents.
