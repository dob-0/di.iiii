# Measurement mode

The 3D scene read with numbers instead of by eye: one stated camera, no picture effects, and
probes that read linear light values back from the GPU before tone mapping. It is step 2 of the
simulation method (`~/work/agent-reports-2026-10-09/devices/simulation-method.md`, §3.4), and it
is what the acceptance tests T1–T6 of that method (§3.3) are measured with.

Code: `src/project/viewport/measure/`. Hooks into the scene, each a few lines:
`HdrBloom.jsx` (no glow, no auto exposure while measuring), `atmosphereStore.js`
(`holdGlareVeil`), `RenderSettingsEffect.jsx` (mounts the mode when asked), `RigBodies.jsx`
(names the rig's bounce light `rig-bounce`; no bounce glow in the haze when measuring direct light).

## How to turn it on

It is not on the visitor's UI.

| Ask | What it does |
|---|---|
| `?measure` | on, at the scene's own exposure, stated as an EV100 |
| `?measure&ev100=3` | on, at a fixed EV100 of 3 |
| `&scale=0.02` | the rig's `sceneScale` (see Units) when the document does not carry `renderSettings.photometry.sceneScale` |
| `&bounce=1` | keep the rig's bounce light (`rigBounce.js`); off by default, so probes read **direct** light only |
| `&scene=<id>` | the scene id written into each result (default: the page path) |
| Alt+Shift+M | toggles the mode on any page that shows a scene |

Example: `http://diiii.localhost/moxir/v1-0?measure&scale=0.02`. The frame then carries a
label at its top centre, above the scene's own panels: `MEASUREMENT · EV100 2.84 fixed …`, and
the canvas carries `data-measure-ev100`.

## What changes while it is on

| | Normal | Measurement mode |
|---|---|---|
| Exposure | `toneMappingExposure` × auto exposure gain ×0.5…×3 (`autoExposure.js`) | fixed: `toneMappingExposure` set from the EV100 every frame; auto exposure off |
| Bloom (`HdrBloom.jsx`, UnrealBloomPass) | on in scenes that ask | off |
| Glare veil (`beamAirMaterial.js`, CIE 146 eye model) | on when bloom is off | off |
| Work light (`worldState.ambientLight`, MOXIR `#a39c92` 0.1), arrival directional light, hemisphere lights, light probes, environment map | on | held at 0 (each value is put back when the mode ends) |
| Rig bounce (`rigBounce.js`) and its glow in the haze | on | off unless `&bounce=1` |
| Fixtures (SpotLight, PointLight), beams in haze, fog, shadows, floor reflections of beams | as authored | as authored |

The frame-rate governor (`qualityGovernor.js`) still sets the screen's resolution and beam
samples, but the probes render at their own resolution and with the full 12 beam samples, so
their readings do not depend on it.

## Units

- Lengths are metres in world space.
- A rig lamp's `intensity` is its candela × the rig's one **`sceneScale`**
  (`scripts/place/rig-lib.mjs`, "PHOTOMETRY"; MOXIR rigs use 0.02). `decay` 2 is the
  inverse-square law. A value read back from the renderer is therefore in **scene units**;
  divided by `sceneScale` it is in physical units.
- The `sceneScale` comes from `&scale=`, else `renderSettings.photometry.sceneScale` in the
  document, else it is **unknown**. When it is unknown every physical number in a result is
  `null` and the label says `sceneScale UNKNOWN`; nothing is guessed. The MOXIR documents do not
  carry it today (owed, see Limits), so MOXIR needs `&scale=0.02`.
- Luminance from RGB uses the Rec.709 / sRGB weights 0.2126, 0.7152, 0.0722 (ITU-R BT.709-6),
  because three.js renders in linear Rec.709.

## The camera: EV100

A picture is a camera at a stated exposure (Lagarde & de Rousiers, *Moving Frostbite to
Physically Based Rendering*, SIGGRAPH 2014 course notes §5.1, after the ISO 12232
saturation-based speed): the luminance L in cd/m² enters the tone curve as `L / (1.2 · 2^EV100)`.

three.js multiplies the tone curve's input by `renderer.toneMappingExposure`, and its ACES
operator by a further 1/0.6 (`tonemapping_pars_fragment`: `color *= toneMappingExposure / 0.6`).
That factor is counted as part of the camera, so a change of operator never changes the stated
EV100 silently:

```
curve input = toneMappingExposure · k_op · sceneScale · L        k_op = 1/0.6 for ACES, else 1
EV100       = log2( 1 / (1.2 · toneMappingExposure · k_op · sceneScale) )
```

MOXIR (ACES, exposure 3.5, sceneScale 0.02) is **EV100 2.84**. The method report gives 3.6 for
the same scene because it leaves out three.js's 1/0.6; both numbers describe the same picture,
the difference is only that factor.

Without `&ev100=`, the mode keeps the scene's own `toneMappingExposure` (the picture does not
jump; only auto exposure, bloom, veil and the work light go) and states its EV100.

EV100 sets only what the screen shows. The probes read linear values and do not depend on it;
every result still records it.

## The probes

Both render the scene again with their own camera into their **own half-float target**
(RGBA16F) and read it back as 32-bit floats (`readPixels` RGBA/FLOAT, which WebGL2 with
`EXT_color_buffer_float` always allows; half values convert exactly). three.js applies no tone
mapping and no output colour transform when it draws into a render target, so a value read is
the radiance the scene's shaders computed.

### Lux probe

`window.__diMeasure.lux([{ name, position: [x, y, z], normal: [x, y, z] }, …])`

At each point an ideal white Lambertian patch (2 cm, `MeshLambertMaterial`, ρ = 1, no fog,
receiving shadows) faces the given normal (default up). An orthographic camera 10 cm in front
of it sees only the probe layer (layer 31), so nothing in the scene stands between it and the
patch. The scene's lights are put on that layer for the draw; the shadow maps are the ones the
scene's last frame drew. three.js's Lambert BRDF is ρ/π, so the patch's radiance is L = E/π and

```
E = π · L          (E_scene in scene units; E_lx = E_scene / sceneScale)
```

Result `data[i]`: `name`, `position` (m), `normal`, `E_lx` (lx), `E_scene`,
`radiance_rgb_scene` (linear RGB), `overflow`.

### Beam-profile probe

`window.__diMeasure.beamProfile({ lamp: 0 | origin, direction, distances: [3, 10, 20], halfSpan, viewFrom: 10, across })`

At each distance d along the beam axis a pinhole camera stands `viewFrom` metres off the axis,
square to it, and reads one row of 257 pixels across the beam. `lamp: n` takes the origin and
direction from the n-th SpotLight of `window.__diMeasure.lamps()`. Each sample is the
luminance the camera sees at offset x (m) in the plane through the axis. Everything the camera
sees is in the reading (the haze in the beam, the scene behind it); `stats` subtracts the
background (the median of the outer 10 % of samples on both sides) and gives the peak, the full
width at 50 % (beam) and 10 % (field) of the peak, and ∫(L − background) dx. A width is `null`
when the profile does not fall that far inside the span read.

Use it so the camera sees only the beam asked for: in a row of beams a neighbour can sit in
the read span (choose `across`, `viewFrom` and `halfSpan`), and the camera must stand inside the
hall with no wall between it and the beam (a reading of 0 everywhere usually means a wall).
Seen on MOXIR v1.0 (2026-10-09): the 18 B380F beams stand 1.05 m apart, and at 10 m up the
default camera stood outside the hall.

### Lamps

`window.__diMeasure.lamps()`: every SpotLight with its world position and direction,
`intensity_scene`, `candela`, cone angle and penumbra, `distance_m` (three.js's cutoff; anything
but 0 multiplies by (1 − (d/cutoff)⁴)², which is not physical) and `decay`.

### The JSON

Every call returns one envelope (`measureReport.js`):

```
{ schema: 'di.measure/1', kind: 'lux' | 'beamProfile' | 'lamps' | 'state', time (ISO 8601),
  scene, renderer: { app, version, commit, branch, three, gpu, gpuVendor, readback },
  camera: { ev100, ev100Source, toneMappingExposure, operatorInputScale, method,
            autoExposure: 'off', bloom: 'off', glareVeil: 'off' },
  sceneScale, sceneScaleSource, directOnly, switchedOff: [ { kind, name, colour, intensity } ],
  units: { … each field's unit … }, data }
```

`window.__diMeasure.save(result)` downloads it as a file.

## Tests

| Test | What it checks | How to run |
|---|---|---|
| Unit (`src/project/viewport/measure/*.test.js`, `harness/t1Cases.test.js`, `src/objectComponents/atmosphereStore.glare.test.js`) | EV100 ↔ exposure, URL flag and hidden key, sceneScale precedence (unknown stays unknown), viewing aids held and restored, E = π·L, half-float ceiling, profile widths, report envelope, glare veil held under bloom, T1 reference values | `npm run test` |
| **T1 on the GPU** (`scripts/measure/t1-gpu.cjs`, page `src/project/viewport/measure/harness/t1.html`) | the scene's own lamp (`SpotLightObject`) at 30 500 cd, 10 m above a plane, read by the lux probe: on axis E = I/d²; the cosine law with the patch tilted 30° and 60°; cos³θ off axis at 30° and 60°; the rig's fitted cone at 50 % on its beam half-angle — each within **1 %**. The beam probe on a 4° Gaussian beam in haze: FWHM = 2·(a + d·tan θ½) at 3, 10, 20 m within 5 %. The mode's switches seen in the running pipeline (bloom, auto exposure, veil, work light off; exposure = the stated EV100). A **control** with the mode off (the work light on) must fail. The runner refuses a software renderer. | `di-dev up <tree>`, then `di-test-browser run scripts/measure/t1-gpu.cjs --url http://<tree>.diiii.localhost/project/viewport/measure/harness/t1.html --out <file>.json` |

The harness page is served only by the dev server (vite's root is `src/`; the build's only input
is `index.html`).

The beam check is the beam model's **own** consistency (its Gaussian profile, `beamAir.js`), not
a check against physics; T3 against a reference renderer is owed (method §3.4 step 4).

## Limits

- **Half-float ceiling:** a channel at 65 504 scene units overflows; the reading is then `null`
  and `overflow: true`. At sceneScale 0.02 that is E ≈ 1.0 × 10⁷ lx on a probe and
  L ≈ 3.3 × 10⁶ cd/m² in a beam: a B380F-class beam (≈ 50 Mcd EQUIVALENT) overflows a probe
  closer than about 2.2 m. Precision is 11 bits (≈ 0.05 %).
- **WebGL2 ceilings (the scene, not the probe):** the probes read what the renderer computes,
  including its approximations: three.js's smoothstep cone, not a candela table; `distance > 0`
  cutoff windows; beams not cut by objects inside them; no multiple scattering; only the lamps
  that cast shadows are occluded (12 of 74 on MOXIR). A probe reading is "what the browser
  scene says", to be compared with a reference renderer, not the truth about the place.
- **Display range:** no screen shows a beam's luminance (10⁶ cd/m² and more) or the eye's dark
  adaptation (CIE 191:2010). The picture in the mode is a camera at a stated EV100, not what an
  eye in the hall sees. Compare numbers, not screenshots.
- **Laser colours:** 455 nm and 525 nm lie outside the sRGB gamut; the renderer cannot carry
  them and the readings are of the in-gamut colour the scene draws. No gamut mapping is
  applied or claimed.
- **Probe geometry:** a probe is a 2 cm patch; it reads the light at its centre, not an average
  over a meter's real 1–2 cm cosine-corrected head (the difference is negligible beyond a few
  metres from a lamp). A probe inside a solid object reads that object's shadow state, not the
  light around it.
- **Beam length with `distance: 0`:** a lamp whose `distance` is 0 (three.js's "no limit", the
  physical choice for the light) draws its beam in air only `UNLIMITED_THROW` = 20 m long
  (`spotBeam.js`). Found by this mode's beam probe (T1 harness, 2026-10-09): the 20 m profile
  read zero. Reported to the physics branch; the T1 beam case gives its lamp a 40 m throw.
- **Scene id:** the page path unless `&scene=` is given; documents do not carry a scene id the
  viewer can read here.
- **Owed:** the rig build should write `renderSettings.photometry.sceneScale` into each rig
  document so `&scale=` is not needed (a data change, simulation-method step 1/3); a probe-point
  list per cue for T2; the Cycles reference (step 4) before T2/T3 can pass or fail.
