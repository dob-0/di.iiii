# Room light and reflections — how light reaches a surface, and the knobs

Audit of the MOXIR ground rooms (`moxir-hall-minimal-ground`, `moxir-hall-full-ground`), 2026-09-30.
Read-only: no code, data, render or browser was touched. Written after the owner looked at the
minimal-ground room on his screen: *"it is too dark, but when we make the lights it will not be
dark — how is it in the scenes now — there are also reflections."*

## 0. What this document is, and how far to trust it

- **READ** = read in the code or in the project data at the path cited. **COMPUTED** = arithmetic
  from the code's own light model (three ^0.185.1, `package.json:133`; the same model
  `scripts/place/wash-glb.mjs` documents), not a measurement. **UNVERIFIED** = not read, or not seen.
- Nothing here was **seen on a screen**. Every brightness figure is COMPUTED and owes a
  measurement on the owner's real screen (section 7). The owner's Chromium draws on the Intel iGPU at
  14-19 fps (brief; not re-measured here).
- Project data: only `moxir-hall-minimal-ground` was fetched (read only) —

  ```
  curl -s https://local.thedi.studio/serverXR/api/projects/moxir-hall-minimal-ground/document
  ```

  and the rig file `scripts/place/rigs/moxir-2026-10-17-minimal-ground.json`. `full-ground` is built
  by the same code from the same hall: its numbers are UNVERIFIED.
- Size estimates (S under half a day, M one to three days, L a week or more) are reading estimates,
  not measured.

## 1. How light reaches a surface today, end to end

Six routes make a pixel brighter. Only the first two are real lighting.

| # | Route | Where (READ) | State in minimal-ground (READ from the document) |
|---|---|---|---|
| R0 | Fill: the room's ambient and directional light | written by `nightOps`, `scripts/place/rig-lib.mjs:1484-1496` from the rig's `night` block (`...minimal-ground.json:669-680`); drawn by `arrivalLightsOf`, `src/project/viewport/worldLights.js:9-17` | ambient `#8ea2c8` x 0.5; directional `#8fa6d8` x 0.22 from (-20, 30, 10) |
| R1 | Real spot lights: an entity whose beam is not `only` mounts a three.js `<spotLight>` | `beamCastsLight`, `src/objectComponents/spotBeam.js:116`; `<spotLight>`, `src/objectComponents/SpotLightObject.jsx:107-128` | **8 of 53** lamps: 3 backstage UP-B380F, 2 column UP-B380F, 2 UP-250BSW, 1 column PAR. Shadows off (`renderSettings.shadowCasting.enabled` false) |
| R2 | Beam-only lamps: an additive cone in the air, no light | `SpotLightObject.jsx:150-166`; cone: additive, `depthWrite` off, `toneMapped` false (line 162), `fog` false | **45 of 53** lamps |
| R3 | Baked wash: PAR light painted on column faces and the press as one unlit alpha decal | baker `scripts/place/wash-glb.mjs`; surfaces `washSurface`, `rig-lib.mjs:1391-1436`; drawn at the look's level by `withWashLevel`, `src/rigbuild/looks.js:285-295` | entity `rig-wash`, 10 washes, one mesh, 117,580 bytes, baked for `gs-white-cathedral` |
| R4 | Emissive surfaces: glow on their own, light nothing | roof glazing `scripts/place/hall.py:193` (strength `:198`); floor-zone tape `:194-196` (default strength 0.6, `:494`) | in the hall model |
| R5 | Display: tone mapping, then fog | `gl.toneMapping` / `toneMappingExposure`, `src/project/viewport/RenderSettingsEffect.jsx:34-35`; fog from `worldState.fog` | ACESFilmic, exposure 1; fog 60-250 m (colour null); cones skip both (toneMapped and fog false) |

The lamp's own numbers: `light.intensity` = candela x `photometry.sceneScale` (0.02), cutoff
`distance` = 2 x the throw for real lamps (`lightDistance`, `rig-lib.mjs:803`), `decay` 2, angle and
penumbra from the class (READ, `rig-lib.mjs:1167-1194`). The document stores the NOMINAL intensity;
a look scales it at show time (`atLevel`, `looks.js:182-188`).

What is **absent** (READ, by search over `src/`): no environment map in these projects
(`worldState.environmentAssetId` is null, so `src/project/viewport/WorldEnvironment.jsx:57-58` never
runs), no bloom / glare / lens flare / post-processing (`spotBeam.js:5-8` says why: the composer goes
black in WebXR), no planar or cube-camera mirror. Physical beams (`SpotLightObject.jsx:74`) need
`renderSettings.atmosphere`, which the document does not have (whether `atmosphereOf` then returns
"off" is UNVERIFIED), so the cheap cone is what draws.

**Per-look chain** (READ, `src/rigbuild/useRigLook.js:49-55`): document entities -> `lookPoses`
(aim, colour, level per lamp) -> `posedEntities` (`atLevel` scales light and haze) ->
`withWashLevel(..., washLevelOf(look))` -> fades `blendEntities` -> `flashEntities`. **Which lamps are
real lives in the document (`beam.only`), never in the look**: a look only sets a level.

**The maths** (same as `wash-glb.mjs:5-25`): `E = I x spot x cos(incidence) / d^2`,
`L = albedo / pi x E` (plus a specular lobe), then ACES: `v = L x exposure / 0.6`, Hill's fit, sRGB.

## 2. The surfaces, and where a reflection could come from

Materials (`scripts/place/hall.py:177-198`; linear albedo, mean of the channels, roughness, metalness):

| Surface | Albedo (mean) | Rough | Metal | Note |
|---|---|---|---|---|
| floor | 0.094 0.069 0.046 (0.07) | 0.95 | 0 | "dust on concrete" |
| concrete (columns) | 0.36 0.30 0.20 (0.29) | 0.92 | 0 | anchor: aged concrete 0.25-0.35 (Levinson and Akbari 2002, per the comment) |
| block wall | 0.40 0.32 0.25 (0.32) | 0.95 | 0 | |
| deck (roof underside) | 0.09 0.084 0.073 (0.083) | 0.90 | 0 | |
| frame / steel / girder | 0.23 / 0.20 / 0.15 (0.20 / 0.18 / 0.14) | 0.6 | 0 | the trusses |
| crane, machine, rust, brick | 0.17, 0.16, 0.09, 0.18 | 0.6, 0.7, 0.85, 0.95 | 0 | |
| **press** (the backdrop) | 0.045 0.041 0.036 (0.04) | **0.45** | 0.3 | the glossiest big surface |
| glass | 0.05 0.06 0.065 | 0.25 | 0 | outer windows |
| skylight | 0.70 0.76 0.82, **emissive same x 1.0** | 0.3 | 0 | lantern glazing |
| zone tape | emissive blue / green / red (x 0.6) | 0.9 | 0 | floor outlines |

In the document (READ): hoist chain and safety steel roughness 0.35, metal 0.9; bridle legs 0.35 / 0.9;
crowd barrier opacity 0.35, rough 0.5, metal 0.6; DJ table 0.7 / 0. The hall entity carries no material
override (`materialsAssetId` null), so the model's own values apply (that the loader passes them
through unchanged is UNVERIFIED).

| Mechanism | In the room? | Evidence | How it would look |
|---|---|---|---|
| Specular of a real spot on a glossy surface | Yes, weak | 8 real lamps; almost everything is 0.9+ rough. COMPUTED, order of magnitude: on concrete the specular lobe is a few percent of the diffuse; on the **press** (albedo 0.04, rough 0.45) it can exceed its diffuse | glare patches on the press and steel where a lamp mirrors toward the camera |
| Environment map (IBL) | **No** | `environmentAssetId` null | metals (hoists m 0.9, barrier m 0.6) have nothing to reflect: near black except the 8 lamps' highlights |
| Clipped hot spots | Yes | COMPUTED below | a white disc on a dark surface with a hard edge; reads as a reflection |
| Additive cones | Yes | `SpotLightObject.jsx:155-164` | glow in the air; overlapping cones add; a bright edge where a cone meets floor or wall |
| Emissive skylights | Yes | `hall.py:193` | COMPUTED about 217/255 blue-white panels at night, which light nothing |
| Baked wash decals | Yes | `wash-glb.mjs` | lit paint on the columns; reads as light bounced up from the floor |
| Bloom / glare / mirror floor | **No** | search | -- |

Hot spots, COMPUTED at each real lamp's throw (half the cutoff), surface square-on, concrete albedo 0.29:
UP-B380F: 1,004,000 (I), footprint radius 0.20 m (0.13 m2), radiance about 600 (white is 1) -> a clipped
white dot. UP-250BSW: I 5,469, radius 1.7 m (9.4 m2), about 247/255. PAR: I 610, radius 1.6 m (7.8 m2),
about 176/255 at full level. Total lit by all 8: about 27 m2 at most, against a walkable floor of
96 x 110 m (`worldState.walkableAreas`) = 10,500 m2, before walls and roof.

**What the owner sees as "reflections" is UNVERIFIED** (nobody has looked with him at a frame). From
the code the likely candidates, in this order: the additive cones, the clipped hot spots, the glowing
roof glazing, the painted column light. None is a mirror reflection. Section 7 says how to tell which.

## 3. The scenes as they are now (COMPUTED from the document's looks and the code)

The show plays cues 1-6 in this order (READ, `mappingState.cues`): one-shaft (hold 10 s), columns-below
(fade 4, hold 10), roof-reveal (5, 12), slow-fan (6, 14), cross-beams (4, 10), red-room; the remaining
cues are UNVERIFIED. The 8 real lamps sit at backstage 380 ranks 0/3/6 of 7, column 380 ranks 0/5 of 6,
250BSW ranks 0/5 of 6, and column PAR rank 0 of 8 (rank = x, then z, then y; a look's `solo` uses the
same rank). "Wash shown" is `washLevelOf` (`looks.js:279-284`) as coded; "PAR level" is the level the
look gives the two PAR groups that were baked into the wash.

| Look | Real lamps lit of 8 (level) | Beam-only lit of 45 | PAR level (the wash's own lamps) | Wash shown |
|---|---|---|---|---|
| gs-one-shaft | 1 (380 at 1.0) | 0 | 0 | **1.0** |
| gs-columns-below | 3 (PAR 0.55, 250BSW 0.3 x2) | 11 | 0.55 | 0.55 |
| gs-roof-reveal | 5 (380 x3 0.9, x2 0.7) | 12 | 0 | **0.9** |
| gs-slow-fan | 7 | 16 | 0 | **0.8** |
| gs-cross-beams | 7 | 16 | 0 | **0.4** |
| gs-red-room | 6 (PAR 0.5, 380 x3 0.4, 250BSW x2 0.25) | 26 | 0.5 / 0.6 | 0.6, drawn white |
| gs-white-cathedral (the baked look) | 8 | 30 | 0.3 / 0.4 | 0.7 on top of the baked level |
| gs-blinder-hit | **0** | 7 (the COB blinders) | 0 | 0 |
| gs-laser-roof | 1 (380 at 0.35) | 2 | 0 | **0.35** |

Read it plainly:

1. **Between the beams the room is COMPUTED black-grey.** With ambient 0.5 and directional 0.22:
   floor about 3/255, deck about 3/255, press about 1/255, concrete columns about 17-22/255. (`luma.mjs`
   counts below 16 as "black".) The scenes' light is the 1-8 dots and the cones; the rest is fill.
2. **The roof is lit only by the real lamps.** `washSurface` knows two surface kinds, a column face and
   the press face; a beam into the roof, the crane or the truss has no wash. In `gs-roof-reveal` "the
   roof appears in pieces" is 5 dots of 0.2 m plus cones.
3. **The wash lights the columns in scenes that say black** (bold cells): see section 5.
4. **`gs-blinder-hit` lights nothing real**: the seven 45-degree COB blinders are the widest lamps in
   the rig, none is real, so the "hit" is a face flash (`RigFlashes.jsx`) and cones. COMPUTED: one COB
   as a real lamp would put about 174/255 on a 2 m pool of floor.

## 4. The knobs, ranked

Ranked by how much each moves "too dark" in the ground scenes, per unit of cost and risk. "Now" is
minimal-ground (READ). fps figures for the iGPU are UNVERIFIED unless stated: nothing in the repo
measures fps against these knobs on the owner's screen.

| # | Knob | File:line | Now | What changing it does | Risk (fps / mood / rule) | Measured by |
|---|---|---|---|---|---|---|
| 1 | **Fill: ambient light** | `rig-lib.mjs:1484-1496`; rig `night.ambient` `...ground.json:669-675`; `worldLights.js:13` | `#8ea2c8` x 0.5 | Adds albedo/pi x intensity to every surface equally. COMPUTED: x2 lifts columns 17 -> 35/255, floor and deck 3 -> 9/255 | 0 fps. Mood: lifts the black between the beams and lowers cone contrast; the rig's own note says 0.8 -> 0.5 was chosen by eye on the RTX 3080, not on his screen | luma `black`, `median`, per cue |
| 2 | **Exposure** | `RenderSettingsEffect.jsx:35`; document `renderSettings.toneMappingExposure` | 1 (ACESFilmic) | Scales every lit surface and the wash; **not the cones** (toneMapped false). x2 = the same lift as ambient x2 | 0 fps, document-only, no re-bake. Mood as row 1, and pools clip harder | luma |
| 3 | **Which lamps are real, and how many** | `budget.realLights` `...ground.json:647-664`; `realIndices` `rig-lib.mjs:787`; ceiling `SHADOW_SAFE_REAL_LIGHTS` `:1445` | 8 (3+2+2+1), fixed per version | Real lamps light surfaces; a wide lamp lights area, a 380 lights a dot (0.13 m2 vs 9 m2 for a 250BSW) | fps: about 90 real lamps ran at 1 fps (`scripts/place/README.md`, "The rig"); 8 is a budget, fps against N on the iGPU is owed. Each extra lamp costs shader time on every lit pixel | fps and luma per cue with N = 0, 4, 8, 12 |
| 4 | **Baked wash: which lamps, which surfaces, per look** | `bake: true` groups; `washSurface` `rig-lib.mjs:1391-1436`; `wash-glb.mjs:47,69,92`; `looks.js:270-295` | 10 PAR lamps, columns and press only; one mesh, white | Paints light where a lamp's light is fixed; one draw call for any number of lamps | about 0 fps. Stale when a lamp is re-aimed; wrong per look (section 5) | luma of the column crop, per cue |
| 5 | **Lamp scale** | `photometry.sceneScale` `...ground.json:687`; used `rig-lib.mjs:857` | 0.02 | Multiplies every lamp's candela: bigger clipped pools, longer wash up the columns. Real beams are already white in their pools | 0 fps; re-writes intensities and re-bakes the wash; mood medium | luma `bright` |
| 6 | **Surface albedo** | `hall.py:177-193`; mirrored in `wash-glb.mjs:47` | floor 0.07, deck 0.083, press 0.04, concrete 0.29 | How much light comes back; the floor returns 4x less than concrete | Regenerate the hall model in Blender, re-upload to every version, re-bake: L. Rule 7: the numbers come from the owner's photos; change with a reason, not by eye | luma of a lit pool on floor vs column |
| 7 | **Cone strength** | `spotBeam.js:26-27` (0.16, 0.28 max); per-lamp `beam.haze`; `photometry.air` 1.5 | 380: 1.0 (opacity 0.16); 250BSW 0.54; PAR 0.26; COB 0.32 | The visible light in the scenes; independent of surfaces and of exposure | fps: 45 transparent double-sided cones = overdraw on an iGPU (cost UNVERIFIED). Adds the "glare" look where they stack | luma `bright`, fps per cue |
| 8 | **Emissive glow** | `hall.py:193,198,194-196` | skylight about 217/255 (COMPUTED); zone tape | Turn down at night: more mood-true, fewer glow "reflections" | Hall model regenerate (L); a per-material override in the document is UNVERIFIED | luma `bright`, per cue |
| 9 | **Environment map (IBL)** | `worldState.environmentAssetId`, `environmentIntensity`; `WorldEnvironment.jsx:57-58` | none, 1 | The route to real reflections on metal and a soft fill; low intensity keeps the mood | Load + prefilter cost UNVERIFIED; needs a licensed dark-hall HDR (rule 7: source, licence, date); it also raises the fill | luma, fps |
| 10 | **Roughness / metalness** | `hall.py:177-193`; document `appearance` on the rig boxes | 0.9-0.95 floor and concrete; press 0.45 | Lower floor roughness gives glossy streaks of the 8 real lamps only (no environment): a cheap "reflection" | 0 fps; whether he wants reflections or wants them gone is UNVERIFIED: ask | look at a frame |
| 11 | **Shadows** | `renderSettings.shadowCasting`; `nightOps` `rig-lib.mjs:1502` | off (`shadows` true, casting false) | Light stops at deck and columns; roof "in pieces" reads truer, room gets darker | 8 shadow passes per frame: likely too much at 14-19 fps, UNVERIFIED; keep off until measured | fps |
| 12 | **Small ones** | directional 0.22 (`rig-lib.mjs:1495`); fog 60-250 m; background `#030304`; `renderSettings.dprMin/dprMax` 1/2 (`LiveProjectScene.jsx:1842`, `src/shared/projectSchema.js:149`) | as shown | Directional: about one 8-bit step on the floor. Fog: nothing at the 24 m opening; cones ignore it. Background: only through openings. **dpr is an fps knob, not a light one**: fill cost goes with dpr squared; the first lever for 14-19 fps | -- | fps |

Rule 2 (measured, not claimed): rows 1, 2, 5 and 12 are safe to trial because they are document or
rig values with no fps cost, and each trial is one before/after luma set per cue. Rows 3, 7, 9 and 11
cost fps and must be measured on the iGPU before they are kept.

## 5. The wash and the looks

**Is it true that the wash stays the white-cathedral one? Yes (READ).** `rig.mjs --wash-only --look
<one look>` builds the wash from that look's aims, colours and levels
(`scripts/place/rig.mjs:190-233`) into one entity, `rig-wash`. Nothing at show time swaps it:
`RoomLookFollower.jsx` and `useRigLookEntities` only pass entities through `roomInLook`, and
`withWashLevel` sets that one entity's opacity (`looks.js:285-295`). The comment at `looks.js:270-276`
says a look that washes in another colour "would need its own bake (owed)". On the owner's install it
was baked with `--look gs-white-cathedral` (`docs/ai/sessions/fix-ground-real-lights.md`).

What a scene other than the baked one gets (READ + section 3):

1. **Colour**: always the baked hue. `gs-red-room` lights its lamps red; the column wash stays white.
2. **Level is not the look's level.** `washLevelOf` (`looks.js:279-284`) takes the maximum over **every
   group sitting at a washing position** (`column-faces`, `backdrop`, ...) and the 380 movers stand at
   `backdrop`. So in `gs-one-shaft` (PARs out) the wash is drawn at 1.0, in `gs-roof-reveal` 0.9, in
   `gs-slow-fan` 0.8, `gs-cross-beams` 0.4, `gs-laser-roof` 0.35: **the columns and the press glow in
   five scenes whose design says the PARs are out.** For the mood this is the most visible fault.
   (Drawn strength is baked alpha x opacity; that the loader applies `appearance.opacity` to the
   decal's material is implied by `looks.js` and its tests but UNVERIFIED on screen.)
3. **Double attenuation** in the baked look: the level (0.3, 0.4) is inside the bake and the follower
   multiplies again (0.7). No look can raise the wash above what was baked.
4. **Aim and lamp set** are the baked look's; a look that re-aims a PAR keeps the old patch.
5. **Reach**: only column faces and the press; no roof, truss, crane or floor patch exists.

**What a proper fix needs**, in the order to do it:

| Step | What | Size |
|---|---|---|
| A | `washLevelOf` reads only the wash lamps' own keys (the two PAR groups), not any group at a washing position. Two lines and a test in `src/rigbuild/looks.test.js`; changes what 5 looks draw, so look at them | S |
| B | One wash mesh **per look** (the request): `rig.mjs --wash-only --look X` for each of the 9 scenes into 9 entities (each about 115 KB for 10 washes, measured 117,580 B; under 1 MB in all); the follower picks the entity of the look now playing, hides the others, cross-fades the two during a cue's fade (`blendEntities`, `looks.js:243-268`), and stops multiplying by a level the bake already holds. Touches `rig.mjs`, `looks.js`, `useRigLook.js`, the keep lists (`BAKED_KEPT` `scripts/rigbuild/load-plot.mjs:49`, `KEEP` `scripts/rigbuild/rehang.mjs:47`), the tests, and needs `versions.mjs --check` | **M** |
| C | Alternative to B, smaller: one wash mesh per wash lamp **group** at full level, white and red variants, opacity = that group's own level in the look. Fixes levels and colour, not aim | S-M |
| D | Reach: new wash surface kinds (a roof patch, a floor pool) so the beams into the roof and the blinders light something; each is a new case in `washSurface` and the baker | M each |

## 6. Real lights: a fixed 8, or the 8 brightest per look

**Now (READ)**: the choice is made at build time. `realIndices` (`rig-lib.mjs:787-798`) reads
`budget.realLights`; the entity of every other lamp is written with `beam.only` (`rig-lib.mjs:1167-1194`);
`beamCastsLight` (`spotBeam.js:116`) mounts a `<spotLight>` only for the rest. A look can change a real
lamp's level (even to 0) and can never change which lamps are real. So a scene that leaves the real
groups out has no real light (`gs-blinder-hit`: 0 of 8; `gs-one-shaft`: 1).

**What "the 8 brightest per look at runtime" would need:**

1. A score per lamp per look, in the room: level x candela at least, better the illuminance it puts on
   the surface it is aimed at (`I / d^2`, from `lookPoses` and the hall's own geometry;
   `surfaceHit`, `rig-lib.mjs:650`, exists only in the build scripts, so a runtime equivalent is
   needed: UNVERIFIED how much hall geometry the room holds).
2. **A fixed pool, not mount and unmount.** Changing the number of lights changes every lit material's
   shader, and three.js recompiles them all (a hitch; its size on the iGPU is UNVERIFIED). So the room
   keeps exactly N `<spotLight>` objects (N = 8, the count now measured as workable, at most
   `SHADOW_SAFE_REAL_LIGHTS` = 12) owned by the follower, and each cue copies a chosen lamp's position,
   aim, colour, intensity, angle, penumbra and distance onto a pool light. All 53 entities become
   `beam.only`.
3. Fades: a lamp that stays in the top N across a fade keeps its pool light; leaving and entering
   lamps cross-fade their intensity over the cue's fade, or the scene pops.
4. Both surfaces: `RoomLookFollower` is mounted by `src/project/components/PublicProjectViewer.jsx`
   (READ); whether the Studio and walk views need the same pool is UNVERIFIED.
5. Tests in `looks.test.js`, and one on-screen measurement on the iGPU: fps and luma per cue, pool of 8
   against the fixed 8 now.

Size: **L** for the pool with fades on both surfaces; M without fades (a hard swap at the cue); **S**
for the data-only variant, re-picking the fixed 8 at build time to cover the nine scenes (a trade, not
a fix: giving the blinders two real lamps takes them from the columns scene).

## 7. Measuring it on the owner's real screen

- **`scripts/rigbuild/luma.mjs`** (`lumaStats`): the luma (BT.709 on the 8-bit sRGB values) of a raw
  pixel buffer, cropped to 20-90% of the height; returns `mean`, `median`, `p10`, `p90`, `p99`, `max`,
  `black` (share below 16, "black between the beams") and `bright` (share above 200, "beam cores").
  It measures how bright a frame **reads after** tone mapping. It is pure and needs no GPU: it can be
  pointed at any screenshot, including one taken on his screen. It does not measure fps or light.
- **`scripts/rigbuild/look-probe.mjs`**: for each cue it pins the show to that cue in the browser's own
  copy (`pinCue`; nothing is written to a server), opens the room's opening shot at desktop (1440 x 900,
  dpr 1) and phone (390 x 844, dpr 3), counts frames over `--seconds` (fps), takes `--shots` screenshots
  and runs `lumaStats` on each (the brightest is kept). It refuses to run without `--gpu`, waits for the
  CPU to cool, and takes the machine's one GPU-browser lock. It measures luma and fps **per cue on the
  GPU its Playwright browser gets** — here the discrete card the rig was tuned on — which is **not**
  the owner's iGPU Chromium. Rule 3: a run of it on his machine, or his screenshots through `lumaStats`,
  is owed before any "brighter" is claimed.
- **To tell which "reflection" he means** (owed, not run): one cue, one opening shot, four frames:
  as it is; wash hidden; cone haze 0; real lamps off. Same view-only method as `pinCue`, so `look-probe`
  needs those flags (S). He points at the frame where it shows; the frame that removes it names it.
- The COMPUTED values in sections 2 and 3 are the predictions to test: predicted column about 17-22/255,
  floor and deck about 3/255. A run that differs by more than a few steps means the model (or the
  assumption that ambient is `albedo/pi x intensity` in three ^0.185) is wrong somewhere.

## 8. For the owner, in plain words

1. It is dark because almost nothing in the hall is really lit. Only 8 lamps of 53 throw real light,
   and most of those 8 are needle beams that light a dot the size of a plate.
2. The other lamps draw their beam in the air but do not light the wall or the floor.
3. The floor is dusty and the roof is dark steel, so they give back very little of the little they get.
4. "When we make the lights it will not be dark" is true for the columns and the press: their light is
   painted on. It is not yet true for the roof, the floor or the crowd: only the 8 lamps reach those.
5. That painted light is made once, for one scene, and every scene reuses it. So the columns glow in
   scenes that should be black, and never turn red. That is a fault to fix first.
6. The "reflections" are not mirrors: the room has no shiny floor and no glare filter. They are the
   beams in the air, hot white dots where a strong beam lands, the glowing roof windows, and the painted
   column light. Show us the frame and we will name which.
7. Order: (1) fix the painted light so each scene controls it; (2) look at your real screen with numbers,
   one frame per scene; (3) if it is still too dark, lift the room's own light a little; (4) let each
   scene pick its own 8 real lamps; (5) real reflections only if you want them.

## 9. Owed and UNVERIFIED (nothing here is hidden)

- No number in this document was measured on a screen; sections 2-4 are COMPUTED from the code's model.
- `full-ground` was not read. Cues 7-9 of the show and its playing order were not read.
- The owner's "reflections" are not identified.
- Not read: `LiveProjectScene`'s light and fog code (walk mode) — `worldLights.js` says it reads
  intensity with `??`; the model loader's handling of material values and of `appearance.opacity` on the
  wash decal; whether `atmosphereOf` returns "off" for the missing `atmosphere` block.
- Costs on the iGPU (real-lamp count, shadows, cones, environment map, light-count recompile) are
  unmeasured. Owed: fps against N real lamps (0, 4, 8, 12) on his screen.
- Owed by the fix branch too (`docs/ai/sessions/fix-ground-real-lights.md`): the ground versions with
  real mover light have not been seen on a real screen.
- The size estimates are estimates.
