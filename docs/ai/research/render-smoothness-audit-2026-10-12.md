# Render smoothness audit: Studio viewport, MOXIR v1.1 (2026-10-12)

Owner: "movement is not smooth". The camera side is done (`smooth-navigation-2026-10-12.md`). This audit covers the
render side: WebGL, the GLSL cost per pixel, the on-demand loop, and the frame cadence on his panel.

## Method (how every number below was made)

- Real GPU: RTX 3080 Laptop, Chromium (Flatpak) with `--ozone-platform=x11 --use-angle=vulkan` (the same
  `chromium-flags.conf` as his di browser), ANGLE renderer string `ANGLE (NVIDIA, Vulkan 1.4.351 … RTX 3080 Laptop GPU)`.
  It ran on the agent screen through `di-test-browser run` (lane 2). That screen is a virtual output at **60 Hz**, so rAF
  gaps here are 16.7/33.3 ms steps. The numbers that carry over to his machine are the **GPU ms** and **CPU ms per frame**,
  not the gaps.
- Page: `http://studio-nav-test.diiii.localhost/moxir/studio/projects/moxir-v1-1` (navfix Vite dev tree). Size set with CDP
  `Emulation.setDeviceMetricsOverride` (CSS size + `deviceScaleFactor`).
- Script: `scripts/nav/measure-render.cjs`, new. It is read-only and changes no app code:
  - a `requestAnimationFrame` wrapper groups every rAF callback by frame and gives the CPU ms per frame;
  - a `WebGLRenderer.render` wrapper sets `info.autoReset=false`, which gives per-frame draw calls and triangles over all passes;
  - one `EXT_disjoint_timer_query_webgl2` TIME_ELAPSED query per frame, from the first `render()` to the end of the
    R3F rAF task (microtask), for **GPU ms per frame**;
  - a React DevTools-hook stub counts commits and names the top re-rendered component;
  - a `long-animation-frame` observer catches main-thread stalls;
  - the camera-controls instance and the R3F store are found through the fibre tree.
  `nvidia-smi -lms 100` logged the GPU clock alongside.
- A/B protocol (`R_MODE=ab`): the camera is restored to the same pose, (-5.2, 1.6, 20) looking at (-5.2, 4.5, -4), inside the hall. One
  variant is applied at runtime, R3F is invalidated every rAF, there is 2 s of warm-up (recompiles, clock), then 2 s are measured. Each run
  starts and ends with `base`, and the two agree within 0.2 ms.
- Instrumentation overhead: one `getPosition` and one query per frame, under 0.1 ms CPU. Not subtracted.
- Rerun: `R_MODE=ab R_W=853 R_H=960 R_DPR=1.5 R_URL=<url> di-test-browser run scripts/nav/measure-render.cjs`. Without
  `R_MODE` it runs the drag, wheel and notch scenarios.

**His real geometry, corrected:** the brief said 2560×1440 CSS at DPR 1.5. In fact `kscreen-doctor` reports eDP-2 as
2560×1440 **device** px @ 240 Hz with scale 1.5, which is **1707×960 CSS**. A second output, HDMI-A-1 1920×1080 @ **60 Hz**,
is enabled too. So the largest canvas he can have is 2560×1440 device px. With `di-show` halving the screen it is about 1280×1440.

## 1. Render pipeline inventory (code + live scene)

| item | where | value (live, MOXIR v1.1) |
|---|---|---|
| Canvas `dpr` | StudioViewport.jsx:1249 | `[dprMin??1, dprMax??2]`, effective = device DPR (1.5). QualityGovernor caps it at device DPR at level 0 |
| `antialias` | :1246 | `true` (MSAA default framebuffer) |
| `powerPreference` | :1247 | `default` (`low-power` for cards) |
| `shadows` | :1244 | `'percentage'` → `shadowMap.enabled=true`, type 1 = PCFShadowMap, **autoUpdate=true** |
| shadow casting | ShadowCasting.jsx / shadowCasting.js | **12 spot lights cast** (SHADOW_LAMP_CAP), 163 meshes cast, re-dressed every N frames |
| `frameloop` | renderDemand.jsx | `demand` at rest, `always` while a hold or a kick (1500 ms after pointer/wheel/key) is active, switched by React state |
| post-processing | HdrBloom.jsx (three `EffectComposer`) | HalfFloat RT, no MSAA, stencil; RenderPass → UnrealBloomPass → AutoExposurePass (off in this room) → OutputPass → SMAAPass = **18 `render()` calls/frame**; composer pixel ratio ≤ 1.5 (BLOOM_MAX_DPR) |
| tone mapping | RenderSettingsEffect.jsx | ACESFilmic (4), exposure 3.5, outputColorSpace srgb (applied by OutputPass) |
| fog | StudioViewport.jsx:761 + SmartView | linear fog near 0 / far 32 (SmartView moves it each frame it runs) |
| environment / PMREM | WorldEnvironment | none in this room (`scene.environment` null) |
| lights | scene | **96 SpotLight** (all visible), 1 Directional, 2 Ambient |
| GLSL | beamAirMaterial.js, spotBeam.js, hazeUniforms | 289 ShaderMaterials (beams in air, glare), haze samples uniform 12 (governor notch 0) |
| geometry | scene | 497 meshes (399 visible), 51 InstancedMesh (688 instances), 476 materials (181 Standard, 289 Shader, 6 Basic), 288 transparent |
| per frame | renderer.info | **637 draw calls, 833 k triangles** (687 k of them are the 12 shadow passes), 44 programs, 370 geometries, 43 textures |
| SmartView | SmartView.jsx | BVH raycasts at 15 Hz, fog offset, occlusion fade; invalidates while moving |
| QualityGovernor | QualityGovernor.jsx | mounted (room has haze). In a burst it may step haze samples, bloom and **DPR** down when fps < 55 over 2 s, and restores level 0 when the burst ends |

Per-frame GPU cost sources, in measured order: forward lighting of 96 spot lights per fragment (with 12 PCF shadow
lookups), beam/haze shaders, bloom chain + SMAA, shadow-map passes.

## 2. Measurements

### 2a. GPU and CPU per frame vs drawing-buffer size (fixed pose, `base`)

| CSS @ DPR | drawing buffer | MP | GPU ms med / p90 | CPU ms all rAF med / p90 |
|---|---|---|---|---|
| 853×960 @1.5 (his half screen) | 1279×1440 | 1.84 | **5.96 / 6.02** | **5.1 / 5.9** |
| 1707×960 @1.5 (his full screen) | 2560×1440 | 3.69 | **9.74 / 9.78** | 5.2 / 5.8 |
| 2560×1440 @1.25 (setDpr) | 3200×1800 | 5.76 | 13.79 / 13.97 | 5.2 |
| 2560×1440 @1.5 | 3840×2160 | 8.29 | 18.98 / 19.32 | 5.3 |
| 2560×1440 @2 | 5120×2880 canvas, scene 3840×2160 (composer ≤1.5) | 14.7 | 19.12 / 19.50 | 5.4 |

GPU ≈ 2.2 ms + 2.0 ms per megapixel, so the frame is fragment-bound. CPU stays at about 5.2 ms whatever the size.

### 2b. What the GPU and CPU time is spent on (A/B at fixed pose)

| variant | 1279×1440 GPU | 2560×1440 GPU | 3840×2160 GPU | CPU (3840) |
|---|---|---|---|---|
| base | 5.96 | 9.74 | 18.98 | 5.3 |
| 48 of 84 non-shadow spot lights hidden | 4.40 | 5.34 | 10.10 | 5.2 |
| all 97 lights hidden (no shadows either) | 2.09 | 2.46 | 4.62 | 3.5 |
| 195 beam/glare ShaderMaterial meshes hidden | 5.06 | 8.43 | 15.90 | 3.7 |
| shadow maps frozen (`autoUpdate=false`) | – | – | 18.80 (draw calls 637→384, tris 833 k→146 k) | **4.5** |
| SMAA off | – | – | 18.54 | 5.3 |
| bloom off (`debug.noGlow`; the glare veil stands in) | – | – | 19.22 | 6.4 |

Reading: at his sizes the **lights are 65–75 % of the GPU frame**: 3.9 ms of 6.0 at half screen, 7.3 ms of 9.7 at full
screen, about 0.075 ms per spot light at 2560×1440. Beams cost 0.9–1.3 ms GPU and 1.4 ms CPU. Shadow-map *rendering* costs ≤ 0.2 ms
GPU but 0.8 ms CPU. Bloom and SMAA are not the problem. The cost of *sampling* the 12 shadow maps per fragment was not isolated:
turning `castShadow` off at runtime is undone by ShadowCasting's re-dress.

### 2c. On-demand loop (3840×2160 run, real mouse via CDP)

| window | rAF ticks | frames drawn | camera-moving frames | React commits |
|---|---|---|---|---|
| idle 3 s, a look fade running | 180 | 91 | 0 | 92 |
| idle 3 s, no fade | 180 | 1 | 0 | 2 |
| orbit drag 3 s (left, 94 moves) | 159 | 159 | 153 | 30 |
| 2 s after release | 108 | 96 | 39 | 3 |
| wheel burst 3 s (every 100 ms) | 136 | 135 | 134 | 3 |
| single notch, first 400 ms | 21 | **20** | – | – |

- The loop never drops a frame during input: frames drawn equals rAF ticks.
- After one wheel notch the camera moves until 917 ms and frames run until 2001 ms (the 1500 ms kick). The real camera ends **on**
  camera-controls' end pose (gap 0.00000 m), so **the ease is never cut short**.
- Idle frames come from the look **fade clock** (`src/rigbuild/useRigLook.js`, `setInterval` about 30 Hz while a fade runs).
  Each tick re-renders `StudioSceneContent` and its whole entity tree (about 147 entity nodes, 140 BeamPart per commit,
  top re-render named by the hook: `StudioSceneContent < RenderDemandProvider`). Each one is a full frame. No long animation
  frame over 50 ms was seen at idle.

### 2d. Shadow and DPR settings

`shadowMap.autoUpdate = true`, so all 12 spot shadow maps are re-rendered **every frame**, although the lamps and the hall do not move
while he navigates. `renderer.getPixelRatio()` = 1.5 = device DPR (the `[1,2]` range is capped by the device). The composer is capped at 1.5.

### 2e. Cold start: GPU clock after a rest

- Rest with no frames: `nvidia-smi` shows the graphics clock falling from 1755 MHz to **225 MHz within about 4 s**.
- First frames of a drag after that rest, GPU ms:
  - at 3840×2160: **143.7, 98.1**, then 20.5;
  - again: 120.5, 93.4, 89.8, 41.5, then 20;
  - at 2560×1440: **78, 75, 52, 52, 53, 26**, then about 10.
- The clock is back at 1680 MHz about 300 ms after input.
- The first rAF callback of that drag took 46 ms of CPU (LoAF entries 59–101 ms).
- When a fade had kept the GPU busy just before, there was no spike: 6.7 ms first frame at half screen.
- This matches his own sampler: worst frame 54 ms in the first 3 s.

### 2f. QualityGovernor during a drag (measured at 60 Hz, 3840×2160 only)

Quality stepped 0→1→2 inside the drag, and the buffer went **3840×2160 → 3200×1800** mid-gesture. When the burst ended it went back to
level 0 (3840). That is two resolution changes per gesture, and one 46 ms CPU frame after release. On his machine (≥ 100 fps at his sizes)
it should never fall under its 55 fps target. That is inferred, not seen.

## 3. DPR 1 vs 1.5 vs 2, and shadows off

DPR comparison: see 2a. DPR 2 costs the same GPU as 1.5 for the scene, because the composer is capped at 1.5.
- "Shadows off" as a document setting: not measured. The runtime `shadowMap.enabled=false` does not recompile programs, and
  ShadowCasting restores `castShadow`.
- Frozen shadow maps are the measurable part: −0.2 ms GPU and −0.8 ms CPU at 3840×2160.

## 4. Established practice (sources)

- three.js, How to update things, "shadow maps … `renderer.shadowMap.autoUpdate = false`, set `needsUpdate = true` when needed": https://threejs.org/manual/#en/how-to-update-things and https://threejs.org/docs/#api/en/renderers/WebGLRenderer.shadowMap
- three.js forward renderer: every light is evaluated in every lit fragment's shader. Many-light scenes use tiled lighting (WebGPU): https://threejs.org/examples/#webgpu_lights_tiled ; light cost guidance: https://discoverthreejs.com/tips-and-tricks/
- R3F scaling performance: `frameloop="demand"`, `invalidate()`, controls that invalidate on change, `regress`/`PerformanceMonitor`: https://r3f.docs.pmnd.rs/advanced/scaling-performance
- drei CameraControls (camera-controls) invalidates on `update` in demand mode: https://drei.docs.pmnd.rs/controls/camera-controls ; camera-controls `smoothTime`/`draggingSmoothTime`: https://github.com/yomotsu/camera-controls
- Post-processing: create the renderer with `antialias: false` when an EffectComposer draws the frame (AA belongs in a pass): https://github.com/pmndrs/postprocessing#usage ; three UnrealBloom/SMAA: https://threejs.org/docs/#examples/en/postprocessing/EffectComposer
- MDN `devicePixelRatio` and canvas sizing: https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio
- GPU timing: MDN https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query_webgl2 , Khronos https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
- Long animation frames API (main-thread stalls): https://developer.chrome.com/docs/web-platform/long-animation-frames
- NVIDIA clocks (`nvidia-smi --lock-gpu-clocks`, P-states): https://docs.nvidia.com/deploy/nvidia-smi/index.html
- Chromium `--use-angle=vulkan` on Linux NVIDIA: mixed, driver-dependent community reports. ANGLE-Vulkan is not allowed on Ozone Wayland, which is why X11 is used: https://gitlab.archlinux.org/archlinux/packaging/packages/chromium/-/merge_requests/6 ; https://forums.developer.nvidia.com/t/drm-kernel-error-for-chromium-based-apps-on-wayland/276876
- XWayland / mixed refresh rates: X11 clients under KWin can be paced at **half** the panel rate or at another output's rate (Plasma 6, 2025): https://bbs.archlinux.org/viewtopic.php?id=302587 ; https://bugs.kde.org/show_bug.cgi?id=401797 ; https://bugs.freedesktop.org/show_bug.cgi?id=103282

## 5. Ranked causes on HIS machine (240 Hz → 4.17 ms budget per frame)

| # | cause | evidence | fix (specific) | expected gain | risk |
|---|---|---|---|---|---|
| 1 | **96 spot lights shaded per fragment** (forward, with 12 PCF shadow lookups) | measured: 3.9 of 6.0 ms GPU (half screen), 7.3 of 9.7 (full) | Studio viewport uses a fixed small set of live light slots (the published viewer's "Lite = 4 slots" path exists, memory `reference_dii_room_light_quality.md`), with "every lamp real" as a toggle. A **fixed** slot count, because changing the light count recompiles all 44 programs | −3 to −4 ms GPU (half) / −5 to −7 ms (full) | the editor picture differs from the full look. **Design question for the owner** |
| 2 | **Main thread 5.1–5.4 ms per frame** > 4.17 ms | measured, all sizes | (a) `gl.shadowMap.autoUpdate=false` + `needsUpdate=true` on document/light/look change (ShadowCasting.jsx) → −0.8 ms CPU; (b) light slots (#1) → about −1.7 ms CPU (lights-off delta); (c) beams batched/instanced → up to −1.4 ms CPU | about 5.2 → 3 ms | (a) a shadow could go stale if a change path forgets `needsUpdate` |
| 3 | **Cadence at 240 Hz**: GPU 6 ms + CPU 5 ms means each frame spans 2 vblanks (120 fps, his median 8.3 ms) with some 3-vblank frames (12.5/16.6 ms) = judder | inferred from 2a + his sampler | fixes #1 + #2 bring the frame under 4.17 ms. Still possible: XWayland pacing at half rate or at the 60 Hz HDMI output's rate | consistent 4.17 ms instead of 8.3/12.5 | **not measurable without his screen.** Owed: rAF sampler on an EMPTY page in his di browser on eDP. If it is also 8.3 ms, the compositor/XWayland is the cap, not the app (then: test with HDMI disabled, or native Wayland Chromium on ANGLE-GL) |
| 4 | **GPU clock ramp after a rest** (225 MHz → 1680 MHz in about 300 ms) | measured: first 3–6 frames 52–144 ms | (a) start the burst on `pointerenter` of the viewport and hold frames while the pointer is over it (renderDemand `hold('pointer-over')`); (b) machine level `nvidia-smi -lgc <min>,<max>` (root, heat, owner's call); (c) #1 makes cold frames proportionally shorter | removes the 50–140 ms hitch at drag start | (a) GPU busy while hovering = heat; (b) power/heat |
| 5 | **Fade clock re-renders the whole entity tree at 30 Hz** | measured: 92 commits / 3 s idle, each a full frame | drive the fade in `useFrame` on the three objects (no React state), or memo `SceneEntityNode` on entity identity | CPU during fades; GPU idle load 30–57 % → about 0 | regression risk in look blending (known-fixes 2026-09-28 / 10-09 entries) |
| 6 | QualityGovernor DPR flip inside a gesture | measured at 60 Hz/4K only; inferred not on his machine | in on-demand bursts step only samples/bloom, never DPR; or require two bad windows | removes resize hitch (46 ms) + sharpness pop | low |
| 7 | `antialias: true` with the composer path (MSAA backbuffer only gets the final SMAA quad) | code; not measurable at runtime (needs a new context) | `antialias: !bloomPath` in StudioViewport.jsx:1246 (Canvas `key` already re-creates the context) | inferred < 0.5 ms at his size, plus memory | non-bloom rooms must keep AA |
| 8 | Bloom, SMAA, shadow-map passes | measured: ≤ 0.4 ms GPU each | none needed | – | – |

**Measured here:** 1, 2, 4, 5, 6 (at 60 Hz), 8. **Inferred:** 3 (from GPU/CPU numbers + his sampler), 6 on his machine, 7.
**Not measurable without his screen:** true 240 Hz cadence, XWayland/mixed-output pacing, his canvas size with panels.

## Limits

One room, one pose. The light share depends on how many lit pixels the view holds. The agent screen is a 60 Hz virtual output.
`TIME_ELAPSED` excludes Chromium's compositor (canvas quad + page layers) and the KWin composite. Runs used lane 2 with the GPU
otherwise idle (0 % before the runs).

Sterile: every run closed its page on exit and on error. Lanes 9223/9225 hold only `about:blank` tabs afterwards.
