# AREA C — picture and performance (MOXIR, moxir-hall-known-full vs moxir-hall-minimal)

Method: read-only. Documents fetched once each from dev `GET /serverXR/api/projects/<id>/document` (saved in this folder as `*.doc.json`) and the known-full document from the local install (same call). Code from `git show origin/dev:<path>` (origin/dev = 7a751cf3) and `origin/land/lite-default-745-2026-10-04` (PR #759, OPEN, mergeable, CI build-and-test still IN_PROGRESS when read). No browser, no render, so NO frame rate was measured by me. Every fps number below is quoted from the PR's own session note and marked as such.

## 0. Values side by side (all CONFIRMED, dev API; local install known-full is byte-equal in worldState, renderSettings, mappingState, 127 entities, same 3 assets)

| value | known-full (THE setup) | minimal |
|---|---|---|
| fog near/far, colour | 0 / 80, null (= background), enabled | 0 / 32, null, enabled |
| background | #000000 | #000000 |
| ambient | #a39c92 x 0.1 | #a39c92 x 0.4 |
| directional | #8fa6d8 x 0 (off) | same, x 0 |
| environment map | none, intensity 1, atmosphereBlend false | same |
| spawn | x0 z20.2 yaw 3.142 eye 1.6 | same |
| walkableAreas | x -36..60, z -54.1..55.5 (one box) | same |
| savedView / fixed camera | pos 0,1.6,20.2 target 0,5.2,3.2 fov 55, near .05 far 400 | same |
| toneMapping / exposure | ACESFilmic / 3.5 | ACESFilmic / 3.5 |
| shadows / shadowCasting | true / enabled, mapSize 1024 | true / disabled |
| antialias, dprMin..Max | true, 1..2 | true, 1..2 |
| bloom | enabled | absent |
| surfaces.floor | albedo 1.7 rough .6 variation .25 scale .35 reflect .5 (reflection model on) | absent |
| atmosphere | scattering 0.02, anisotropy 0.7, haze {} | scattering 0.05, anisotropy 0.7 |
| mappingState.lightPool | ABSENT (pool off) | ABSENT |
| entities | 127: 74 spotLight, 34 box, 11 group, 8 model | 71: 34 spotLight, 25 box, 3 group, 9 model |
| spot lights with beam.only=true (light-less cone) | 0 of 74 | 26 of 34 |
| spot lights that are REAL three.js SpotLights | 74 | 8 |
| hidden/baked rig-wash model | none (no rig-wash entity, no rig-wash.glb asset) | `rig-wash` model, 7 PAR washes baked, assets 103,996 B |
| asset count / bytes to download | 3 / 3,215,624 B (3.07 MiB) | 7 / 9,771,536 B (9.32 MiB) |

Assets known-full: hall-night.glb 3,189,904 B (the hall, 54,624 triangles per hall.json), rigbuild-truss-3m.glb 21,196 B, rigbuild-deck-2x1.glb 4,524 B. Document JSON itself 126,900 B (minimal 63,064 B). Minimal carries FIVE unused/old glbs in addition (hall.glb 3,215,660; hall-show.glb 3,205,404; hall-night.glb 3,205,328; truss-2m 15,432; rig-wash 103,996) of which only hall-night + rig-wash are referenced; the others are dead weight in the asset list (whether the viewer fetches unreferenced assets: unknown, not read).

## 1. Findings

### C1 — show-stopper (for any non-Lite viewer) — 74 real SpotLights, all lit materials compile for 74 lights, 12 of them with shadow maps
- Evidence: known-full document: 74 entities of type spotLight, `components.beam.only` false on all 74, intensity > 0 on all 74, `renderSettings.shadowCasting = {enabled:true,mapSize:1024}`, no `mappingState.lightPool`. Rig file `moxir-2026-10-17-known-full.json` budget: `realLightsAll: true` ("EVERY lamp is a real light … a phone will not hold this: the 8-lamp budget is the fallback"). `src/rigbuild/lightPool.js:3-8`: "a browser runs about eight real three.js SpotLights (90 ran at 1 fps) … three.js compiles every lit material for the NUMBER of spot lights". `shadowCasting.js` SHADOW_LAMP_CAP = 12 → 12 shadow-map depth passes of the whole hall (54,624 tris + rig) per frame plus 12 texture units per lit material.
- Measured by others (quoted, not by me): rig file: 40-52 fps, 36-49 with shadows, on PONYO RTX laptop 1440x900. PR #759 note `docs/ai/sessions/feat-room-output-mode-2026-10-04.md`: on the AMD 860M, Full "still blank after 60 s of shader compiles" (later fixed to a hold capped at 8 s by the warm-up commit, but Full on that GPU is not shown to be usable).
- Why it matters: this is the exact scene the owner chose. On an Intel iGPU (slower than the 860M class): UNKNOWN fps, SUSPECTED unusable and possibly a long black start; no Intel measurement exists in any file I read.
- Fix: do not ship Full as the show picture on weak GPUs. Make the show's own look the pooled/Lite look (see C3), and measure on a real Intel iGPU machine (owed; hardware: one Intel laptop to test on).

### C2 — gap — beam cones: 74 transparent additive cones, haze 0.258 to 1, cones up to 48-50 m long, bloom on, DPR up to 2
- Evidence: known-full spot lights: 50 x up-pl5403 (angle 0.1309 rad, haze 0.258, distance 0.6-5.4 / 24), 18 x up-b380f (angle 0.0157, haze 1, distance up to 25.4), 6 x ext-lc-ultra-mk2 (angle 0.0105, distance 48.2-49.2). `beam.visible` true on 74/74. bloom.enabled true; dprMax 2; surfaces.floor reflect 0.5.
- Why it matters: overdraw (fill rate) on an iGPU at DPR 2 plus a bloom pass plus floor reflection pass. Cost not measured by me: SUSPECTED, magnitude unknown.
- Fix: Lite (below) removes bloom, floor surface model, DPR>1, antialias; keeps the cones. Measure the cone cost on an iGPU with Lite on.

### C3 — wrong-vs-real (and gap) — PR #759 (Lite default) would cover performance, but Lite draws a DIFFERENT picture from Full
- Evidence (`outputMode.js` on the PR branch): Lite keeps every beam cone + lens + haze, pools the light ON the room into OUTPUT_POOL_SLOTS = 4 real lights, drops shadows, bloom, floor surface model, antialias, DPR 1. The PR's own note: "Lite's floor reads black (no surface model) — not yet measured on a real phone". Measured by the PR (quoted): Lite 418 fps desktop / 239 fps phone viewport on the AMD 860M, known-full, 70 lamps; not on Intel.
- Why it matters: owner's bar is "what we see now we will see the same in real life". In Lite the hall is lit by 4 lamps at a time, not 74 and the floor has no reflection, so Full and Lite show two different rooms. Which one is "the 100 % simulation" is undecided.
- Coverage verdict: YES for load/lag (4 lights instead of 74, no shadows/bloom/DPR 1; plus shaderWarmup.js and spotLightSkip.js — skip the BRDF for pixels outside a cone, "9.1 ms to 5.5 ms a frame" on RTX 5060 per the PR). NO for picture parity, NO proof on Intel iGPU. PR is OPEN, not on dev (`outputMode.js`, `shaderWarmup.js`, `spotLightSkip.js` do not exist on origin/dev, confirmed), so today dev.diiii.xyz and the local install run the heavy path.
- Fix: land #759, then decide the show picture = Lite-with-pool, tune the pool (4 slots; `mappingState.lightPool` is clamped at 12) until Lite looks like Full by eye on the owner's screen, and add the cheap floor glow the PR lists as next step.

### C4 — gap — the show machine itself would get FULL by default
- Evidence: `useOutputMode.js` + `outputModeWanted` (PR branch): "else lite unless this is the work machine with a fine pointer"; local/LAN hostname + mouse = Full. PR note: "dev.diiii.xyz and *.ts.net count as non-local, so his own desktop sees Lite there; Full is one tap, remembered per browser".
- Why it matters: the installed di on the show laptop (loopback address, mouse) boots into the 74-light Full renderer, the heavy one, on the machine that must run the show. Choice is remembered in localStorage (can be cleared/private window) with no document-level setting.
- Fix: a document-level default (e.g. `renderSettings.quality`) so the show project forces Lite regardless of who opens it, or the show machine's URL carries `?quality=lite`. Owed; not in the PR.

### C5 — wrong-vs-real / cosmetic-risk — the "two picture worlds"
Two different looks are stored on dev, built by two different tools with different constants:
1. **Rig-file "night" world** (`rig-lib.mjs:1523-1525`, `moxir-2026-10-17-known-full.json` `night`): background #030304, ambient #8ea2c8 x 0.5, directional x 0.22, fog 60..250, exposure 1 (photometry comment "ACES, exposure 1"), lamp intensity = candela x sceneScale 0.02, "tuned by eye on the RTX 3080".
2. **Realism world** (`scripts/rigbuild/realism.mjs:137,238-246`): black hall, ambient 0 (the rig's own bounce `rigBounce` replaces it), fog = linear 0..1.6/sigma, exposure 3.5, bloom + haze atmosphere. This is what is stored in both documents now (exposure 3.5; fog far 80 at sigma 0.02, 32 at sigma 0.05). The documents' ambient (0.1 known-full, 0.4 minimal) is a third value, written by a work-light step (`work-light.mjs`: "ambient x exposure") not by realism.mjs (which writes 0).
- Consequence: the two stored rooms differ on EVERY picture knob (fog far 80 vs 32, ambient 0.1 vs 0.4, shadows on/off, bloom/floor surface on/off, 74 vs 8 real lights). A look judged in one does not carry to the other.
- Fix: one named picture preset per concept, written by one tool, with the knobs listed in section 0 recorded in the version file, not tuned per project.

### C6 — wrong-vs-real — the "porthole" is fog far 32 (minimal), and known-full still hides most of the hall at the entry end
- Evidence: minimal `worldState.fog.far = 32` (= round(1.6 / 0.05), `realism.mjs:137`). `moxir-versions-2026-10-17.json:5271`: "at 0.05 the 32 m fog blanked the vista 62-98 m from the back of the crowd". Known-full is 80 (sigma 0.02), so the porthole is fixed there for the vista, but: fog is LINEAR (near 0, far 80), so a surface 74 m away (spawn z 20.2 to the far gate z -54.5) is ~92 % fogged, vs Beer-Lambert exp(-0.02 x 74) = 77 % extinction in the realism.mjs's own model. The hall is 96.8 x 109 m (outline -36.4..60.4 x -54.5..54.5), so from the entry end the far third of the hall and the vista behind the DJ is faded to near black by construction. The sigma "joint call with Gevorg is still owed" (same file) — OPEN decision, not made.
- Why it matters: "see the same as real life" — in a real hall with haze the far vista stays visible at lower contrast; here it is clipped by the linear fog. SUSPECTED effect on the show picture; value-level evidence is CONFIRMED, visual effect not seen by me.
- Fix: take the sigma decision with the owner, decide the viewing distance to be kept (the DJ is only 15 m from spawn, the vista 50-100 m away), then set far from that.

### C7 — wrong-vs-real — brightness is carried by exposure 3.5 and one lamp's intensity is 1,004,000
- Evidence: known-full spot intensities: 50 x PL5403 = 609.56 (all), 6 x LaserCube = 20, 18 x B380F = 1,004,000 (all identical; ratio 1,647 x a PAR). Sum 18,102,598. Minimal max = 609.56. Rig file: intensity = candela x sceneScale 0.02 (`rig-lib.mjs:869`); fixtures.json uses a proxy for the B380F ("SHEHDS GalaxyJet 380 W 19R … photometric equivalent for UP-B380F", line 77). Exposure 3.5 + ACES is stored on both rooms.
- Why it matters: lamp-to-lamp ratios in the picture rest on a different brand's datasheet; the tone mapping hides it. I did NOT verify the B380F number against the proxy's datasheet: SUSPECTED, "unknown" whether 1,004,000 is correct. Also: intensity 1,004,000 with angle 0.9 deg and haze 1 may clip/bloom into a white lance under ACES x3.5 (SUSPECTED, not seen).
- Fix: re-derive the B380F candela from its own datasheet or a measurement and write the source in the version file; look at the beam on the owner's screen.

### C8 — wrong-vs-real — "measured 10-02 hall" is ESTIMATED from photographs
- Evidence: `moxir-hall-2026-10-02-crane-dj.hall.json`: `"warning": "ESTIMATED from photographs, not taped"`; dimsSource VGGT (facebook/VGGT-1B, CC BY-NC 4.0) + perspective fit + owner's marks; document `venuePlan.warning` repeats it. Hall outline 96.8 x 109 m.
- Why it matters: the owner's bar assumes measured; it is not (provenance rule). Also the weights' licence is NON-COMMERCIAL: a show with a paid element using geometry derived from CC BY-NC weights needs a licence check (law row, SUSPECTED risk).
- Fix: tape the hall (or a laser measure of 3 spans), record taped values with ranges; check the CC BY-NC question.

### C9 — cosmetic / small
- Walkable area maxZ 55.5 vs hall wall at z 54.5 (1.0 m past the north wall; door at 54.5 is 6 m wide) and minX -36 / maxX 60 / minZ -54.1 are 0.4 m inside the walls: walkable box is a plain rectangle, not the hall outline. CONFIRMED values; outside-the-wall 1 m only matters at the entry door.
- `venuePlan`/realism enclosure source says hall asset `4b0d56…` but the document's hall asset is `df837b…` (hall-night.glb): stale provenance string, the enclosure area (28,398 m2, reflectance 0.16) may belong to an older hall file. SUSPECTED stale.
- Minimal's asset list carries 5 unreferenced glbs (6.6 MB of 9.77 MB). Concept versions should drop them.
- `renderSettings.atmosphere.haze: {}` empty object in known-full: what the viewer does with an empty haze object: unknown (not read).
- Download size is NOT a problem: 3.07 MiB known-full (the hall glb is 99.2 % of it). The cost is GPU, not bytes.

## 2. Light count summary
- known-full: 74 spotLights = 74 real lights (no beam-only), 12 of which cast shadows when shadowCasting is on; Lite: 4 real + 74 cones.
- minimal: 34 spotLights = 8 real + 26 beam-only; shadowCasting off; no bloom.
- Lamp types known-full: 50 UP-PL5403, 18 UP-B380F, 6 LaserCube Ultra MK2 (matches the "all 50 + all 18" of the rig file).

## 3. Owed (what this audit could not do)
- A frame-time number on an Intel iGPU, Full and Lite: unknown (no Intel hardware path used; no browser per rules).
- Seeing the picture (fog, exposure 3.5, B380F beam) on the owner's screen: not done.
- B380F candela source: not verified.
- Whether the viewer fetches unreferenced assets: not read.
