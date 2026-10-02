## 2026-10-01 — MOXIR previs: the haze worked out from the hazers, real beam fall-off, real bloom

- Owner's ask (Emily, 2026-10-01): "we will smoke there right haze … simulate elite level close to real one … look the known device tech specs … so we can see the show in virtual than move it to the real."
- **Haze as a field** (`src/objectComponents/hazeField.js`): `renderSettings.atmosphere.haze` works σs out from the room's own hazers and fog machines (the rig's `fixture.dmx:false` effect entities, typed by the library) — fluid ml/min × level × density × the part that stays a droplet, mixed through the hall (V, air changes/hour; fog also dries), extinction σ = 3QC/(2ρD) with Q = 2; each running machine's turbulent jet near its nozzle (centreline ∝ 5d/u, 1/e width 0.11u); a drifting 3-octave noise for unevenness. Six HZ-1000s at full in an assumed 12 000 m³ at 6 ACH give σ ≈ 0.033 /m — the same order as the 0.05 /m §20 set by eye. ASSUMED (no maker states them): droplet sizes, fan flows, dry time, reach, the hall's volume and ventilation. A room without `haze` draws exactly as before.
- Shader: `hazeSigma()` per sample in world space, shared haze uniforms per renderer (`hazeUniforms.js`), no recompile when the rig changes (12 machines max). The room's fog follows the field (base 0 … 1.6/σ); SmartView adds its outside-the-building offset on top of that base (`atmosphereStore.js hazeFogBase`).
- Types: `fluid_ml_per_min` and `nozzle_d_mm` now reach `src/rigbuild/types/moxir.json` (generator change in `fixtureTypes.js`).
- Schema (cjs + esm): `renderSettings.atmosphere.haze`, validated and clamped.
- **Beam cross-section** (`beamAir.js beamProfile`): 50 % at the beam angle, exp(−ln2·ρ^p), p 8 (hard, a beam fixture) … 2 (soft, a wash's Gaussian); the hull reaches the 2 % point. The flat-top-plus-smoothstep profile clipped every beam to a solid white bar. The glare veil no longer counts throw below the floor.
- **Real bloom** (`src/project/viewport/HdrBloom.jsx`, `bloom.js`): `renderSettings.bloom { enabled }`, off unless a room asks; half-float 4× MSAA target → UnrealBloomPass → OutputPass (three's own, no new dependency); plain rendering in XR, where the glare veil comes back. Default strength 0.03 with threshold 1 — the physical point-spread; three's 0.6 washed the hall white, and a high threshold with 0.3 went milky (both seen). Composer capped at DPR 1.5.
- Measured on PONYO's **NVIDIA RTX 5060 Laptop** (headless Chrome, ANGLE D3D11, `--force_high_performance_gpu`; without it Chrome takes the AMD 860M iGPU and reads ~12 fps), MOXIR Known · full, shadows on (#711 merged in): floor view 61.4 fps → 58.8 with bloom; DJ view 65.2 → 67.7; phone 390×844 DPR 3: 82 fps with bloom. The haze field alone cost ~8 fps on the floor view.
- Still owed: comparing beam peaks and the hall against the §20 photographs and luma numbers before any room turns `haze` or `bloom` on; entering/leaving VR with bloom on; PortalObject's fake bloom doubles in a bloom room (skip it when bloom is on); EntryGlide's captured still has no bloom (a pop at the end of the glide); per-look haze levels; the hall's real volume.
- Stacked on #712 (feat/moxir-known-full) and #711 (feat/room-shadow-cap): lands after them.

## 2026-10-01 — prism, honeycomb, frost and gobos in the beams, from the desk

- `components.beam.optics` (`src/objectComponents/beamOptics.js`): a radial prism (N beams of 1/N each, fanned PRISM_SPREAD_DEG out), the honeycomb (centre + 6), frost (angle × (1 + 2f), candela ÷ that², edge Gaussian), a gobo (17 procedural stencils). Drawn inside the beam's own hull: a flat loop over the nearest 8 parts, the gobo cut once on the nearest; where the parts still overlap near the lens they are one wider beam with the same light. Tests hold the flux within 10 % with any optic in.
- ASSUMED and labelled: the prism spreads (5°, 3.5°) and the gobo SHAPES — no image of the B380F's wheel was found; replace with the real images when the rental house sends them.
- From the desk: the UP-B380F 16ch list (fixtureTypes.js) gained caps — roles, labels, defaults, order and basis unchanged (emily-9f's conditions): goboSlots 5–89 / goboShake 171+ and prismIn 128+ are the chart's; the even gobo slots are DERIVED; prism 2's threshold, the rotation channels (read as an index) and frost's curve are ASSUMED and say so; 90–170 on the gobo channel is left unmapped. `dmxDecode` → `optics`; `dmxPose` → `beam.optics`. Lasers untouched.
- Schema (cjs + esm): `beam.optics`, clamped, stored only when given.
- ANGLE trap found and fixed: on Windows (Direct3D 11) the beam shader with nested constant-bound loops (12 samples × 12 jets × prism × honeycomb) failed to link with an EMPTY log and then lost the context. Loops are now bounded by uniforms (uSamples, uHazeCount) so ANGLE keeps them loops, and the split-beam loop is flat.
- Seen on the RTX 5060, Known · full, DJ view, haze + bloom, shadows on: prism 62.6 fps, honeycomb 61.9, gobo 62.0, frost 64.2, no errors. The gobo is faint from the audience (a 1.8° beam) — it shows looking up the beam.

## 2026-10-02 — the beams reflected in the floor

- Owner's ask (Emily, 2026-10-01): "ok go on with the floor reflections" (after the research pass: in a club photo the reflections are the beams and lenses mirrored in the concrete).
- `src/project/viewport/BeamMirrors.jsx`: each beam core drawn a second time, mirrored through y = FLOOR_Y, only where the floor is the visible surface — the floor's override marks stencil 1 and is drawn last of the opaque room (`surfaces.js`, `SurfaceOverrides.jsx`); its neighbours in the same mesh clear the mark. One extra draw per beam, no second render of the room. The composer target carries the stencil (`HdrBloom.jsx`).
- Weighted by Schlick's Fresnel (F0 0.04) × `surfaces.floor.reflect`, and blurred by the floor's roughness where each ray lands (the same wear pattern as the lit floor): a sample h metres up keeps R / (R + 1.3·α·h) of its peak (`mirrorBlur`). Crisp where a beam meets the floor, gone high up, patchy with the wear.
- The mirror program never discards (a discard turned off early stencil: 27 fps against ~100 on the RTX 5060) and runs 6 samples.
- Not in a headset yet (the XR layer has no stencil; the mirrors hide while presenting). Only in a room with bloom on (the half-float path).
- Seen in headless Chrome on PONYO's RTX 5060 (the owner's own visualiser tab held the GPU at 89–96 %, so the 24–26 fps read then is contention, not this — reflections on and off read the same): Known · full, the-x / tunnel / white-cathedral, Floor and DJ views.

## 2026-10-02 — the black square at the end of the DJ view

- Owner: "fix the black square in dj view". It was the hall's 6 × 6 m entry gate (DJ camera at z 6.6, gate at z 54: 47 m, 74 px, matching the projection) showing the scene background, which three.js never fogs.
- `src/project/viewport/NightOutside.jsx`: a dark box just around the building, found from the floor mesh, fog on, no bottom face, visible only while the camera is inside it. Mounted by RenderSettingsEffect in rooms with `atmosphere.haze` (opt-in like the rest). Seen on the RTX 5060: DJ view veiled, Top and Side views as before.

## 2026-10-02 — the human audit: walk mode, white specks, console, fps reading

- Owner: "check all for bugs, make the human audit", then "walk as a real human … you are the event organiser". Three auditors (room/renderer, tool pages read-only on :5184, operator test of desk + visualiser on the :5310 preview) plus my own walk at eye height (8 stops × 4 looks).
- Fixed here: the decorative motes in hazy rooms (white snow); walk mode Esc / fly floor / header under the steps row / touch controls; the visualiser fps reading; the PCFSoftShadowMap and X4000 warnings. known-fixes rows added.
- Not a bug: standing in a column-base beam whites out the view (you are inside a 380 W beam 1 m from its lens).
- Open: the speckled beams and the dotted dome on the crane are the IGN sample jitter at the governor's lowest notch (5 samples, DPR 0.75). The room sat at notch 5 at ~23 fps because several Chrome windows were rendering the 70-light room at once (GPU 97 %). Clean fps owed with one window. Also open: the milky grey wash from the crowd in bright looks; the hard horizon line in the Floor view; walk collision with objects (no infrastructure; walkableAreas only).
- Tool-page and desk bugs went to emily-d6 (moxir-local commits 8b2a4749, d5f90815, 0f79e27f); the hall corrections from the photo + standards audit went to emily-d6 too.

## 2026-10-02 — the frame rate: MSAA on the HDR target was the cost

- Same measure (Playwright rAF count over 3 s, 1440×900, RTX 5060, GPU otherwise idle): emily-d6's :5184 (plain path) 120 fps with all 70 lights; mine 39–45 at notch 5. Off one at a time: reflections ±0, beams ±0, shadows +10 %, real lights off → 62 at notch 0, MSAA off → 109–120 at notch 0.
- HdrBloom: samples 4 → 0, SMAAPass after OutputPass. Every view now 120 fps (the cap) at FULL quality: bloom on, 12 samples. A light pool was proposed to emily-d6 and then dropped: every lamp stays a real light.
- Still open: a dotted dome on the crane girder over the press and a dotted strip on the press at full quality (not shadows, not sample count; the next isolation).
