<!-- Landed 2026-10-14 (ledger N645.4) from agent report: laser-guards-wicked-nannou.md (date 2026-10-14).
Source of facts: external repos/pages named in the body with URLs and commit SHAs; licences as recorded there.
Licence rule: GPL-3.0 code may be quoted briefly with attribution, never copied wholesale; no code from this note is in the product.
MEASURED vs CLAIMED: read-only source reading at the cited SHAs; nothing was built or run. Line numbers are at those commits.
UNVALIDATED: any behaviour of Wicked Lasers firmware (no firmware source is published); the LaserCube UDP spec PDF was not read.
Provenance: written by an agent, so a claim until re-checked at the cited commit. -->

# Laser guards: how Wicked Lasers and nannou handle bad values (read 2026-10-14)

Sources (shallow clones, read only, nothing built or run):
- Wickedlasers/libLaserdockCore c77cdc25 (2025-06-24), GPL-3.0 - https://github.com/Wickedlasers/libLaserdockCore
- Wickedlasers/laserdocklib 51d13bca (2022-10-11), LGPL-3.0 (USB only)
- Wickedlasers/lzr d36fbf67 (2019), LGPL-3.0 (own repo; UDP spec is a PDF, not read)
- Wickedlasers/laserdockdocs cd4f8290 (2026-10-14) = wiki.laseros.com manual, no licence stated; file docs/guides/ultra-mk2-pro-manual/index.html
- Wickedlasers/mk2 : empty repo. No firmware source or headers are published anywhere in the org.
- nannou-org/lasercube a9c60d4f (2025-04-01), MIT - SPECIFICATION.md, crates/
- nannou-org/nannou bffa9887 (2026-07-16), MIT OR Apache-2.0 - nannou_laser
- nannou-org/lasy a9e79a5e, MIT OR Apache-2.0 - holds the interpolation code nannou_laser uses
Note: nannou_laser does NOT speak LaserCube (Cargo.toml:18 only ether-dream). Its interpolation is general, aimed at galvos.

## 1. Wicked Lasers
(a) Jump/step limit or interpolation: none in the cube protocol layer or the network hardware code found. The point stream is not rate-limited by step size. What exists is the openlase renderer (libLaserdockCore ldCore/src/Render/ldRendererOpenlase.cpp:282-297):
  on_speed = 2.0f/80.0f, off_speed = 2.0f/80.0f, curve_angle = cos(30 deg), max_framelen = rate/min_fps.
  on_speed/off_speed is a speed limit in OpenLase's sense: max travel per point, so a jump is split into several points. Source is OpenLase, not Wicked. ldDeadzoneFilter.cpp:310 uses interpolation only for deadzone borders.
(b) Corner dwell / blank delay: yes, via openlase params: start_wait=6, start_dwell=1, curve_dwell=1, corner_dwell=1, end_dwell=1, end_wait=2 (ldRendererOpenlase.cpp:284-292); a "quality" preset uses start_dwell 2, corner_dwell 3, end_dwell 2 (lines 342-346). Also ldLogoLaserdock.cpp:39-42 (start_dwell=2, corner_dwell=2). No comment says why; the manual says only that complex SVG gives flicker "as the laser will need to render more points in order to display the image with sharper corners" (manual line ~1014).
(c) Stream stops / watchdog: silent in the host code (ldNetworkHardware.cpp only emits deviceDisconnected at :193). Manual and code never describe a firmware blank on stream loss. nannou/lasercube SPECIFICATION.md:184-191 tells implementers to "Include safety timeouts that disable the laser if communication is lost" - so the host is expected to do it, not the cube.
(d) Temperature: YES, the strongest finding. ldCore/src/Filter/ldHardwareFilter.cpp:67-142, class ldLaserPowerLimiter: reads the cube temperature (status byte 24, signal TemperatureUpdated), averages 150 samples at 100 ms, and from 60 C scales all laser brightness linearly to 50 % at 75 C. Quote (line 140): "laser power will be reduced to its minimum when this temperature is reached (laser cut-off temp is 76 Deg C in firmware)." Also an OverTemperatureUpdated signal (ldNetworkHardware.cpp:98). Manual (line ~3351): "The LaserCube has a temperature cut-off. If it gets too hot ... the cut-off stops it. It does not restart by itself"; use only 10-40 C.
(e) Firmware protects galvos? Not stated. Manual line ~711: "The LaserCube includes all required safety features per international regulations" - that is laser-safety law (key, interlock/E-Stop jumper, FDA), not galvo protection. Firmware protections that ARE documented: temperature cut-off 76 C, key switch, E-Stop/interlock, 35 kpps rating ">35,000pps @ 7 deg" (spec table, line 530). Silent on galvo overdrive, scan-fail, jump limits.
(f) Default rate: ldAbstractRenderer.cpp:31 DEFAULT_RATE = 30000; setRate accepts only 20000/30000/35000/40000 (line 43). Manual (line 508) "we suggest configuring the scan rate to 30000 points per second" for the ILDA external DAC. No reason given.
Silent: scan-fail, galvo damage, max jump.

## 2. nannou-org/lasercube (SPECIFICATION.md, MIT)
(a) Silent on jump limits and interpolation. Only 12-bit coordinates centred at 0x800 (line ~125-139).
(b) Silent.
(c) SPECIFICATION.md:184-191 "Safety Considerations": implementations should (1) "Include safety timeouts that disable the laser if communication is lost", (2) "Provide emergency stop functionality", (3) "Respect the device's buffer management to prevent erratic behavior", (4) test with safety lenses. Shutdown sequence (lines ~181-182): disable buffer responses, then SET_OUTPUT off. The spec does not say what the cube itself does on silence.
(d) Temperature byte at offset 24 (line 55). crates/lasercube-core/src/status.rs:11-25 defines TEMPERATURE_WARNING and OVER_TEMPERATURE flags (fw >= 0.13 bits 2 and 3; fw <= 0.12 bits 4 and 5), plus PACKET_ERRORS_MASK (upper 4 bits). Nothing acts on them in the examples.
(e) Silent.
(f) examples/circle.rs:74-76: buffer capped at dac_rate/1000 * MAX_LATENCY_MS (=64 ms), min with rx_buffer_size - they cap latency, not rate; they send at the device's reported dac_rate. Spec line ~155: wait when free space drops below ~5000 of ~6000.

## 3. nannou_laser + lasy (what the interpolation parameters are for)
(a)+(b) lasy/src/lib.rs:185-219 (InterpolationConfig; defaults on by default per nannou_laser stream/mod.rs:11 DEFAULT_ENABLE_OPTIMISATIONS = true):
  - distance_per_point = 0.1 : "The minimum distance the interpolator can travel along an edge before a new point is required." Solves long lines: a point is inserted every 0.1 units (of a -1..1 range), i.e. a max step between points. This is the jump limit.
  - blank_delay_points = 10 : "The number of points to insert at the end of a blank to account for light modulator delay." (lit/blank modulation lags the galvo; blank ab = [a, a.blanked(), b.blanked(), 10x b.blanked()], BLANK_MIN_POINTS=3, lib.rs:223).
  - radians_per_point = 0.6 : "The amount of delay to add based on the angle of the corner in radians." Solves "corner inertia" (lib.rs:218: "reduce corner inertia"): sharp corner gets one extra point per 0.6 rad of turn angle.
  - Method cited at lib.rs:5-8: Abderyim et al., "Accurate and Efficient Drawing Method for Laser Projection", https://art-science.org/journal/v7n4/v7n4pp155/artsci-v7n4pp155.pdf (graph optimisation, draw order, blanking delays, sharp angle delays).
  - latency_points (stream/mod.rs:25-29): max latency in points; fills the DAC buffer only up to it. Solves buffer bloat/lag, not safety.
(c) Stream stop: nannou_laser raw stream has StreamError/StreamErrorAction (lib.rs:13); I did not trace watchdog behaviour; Ether Dream hardware, not LaserCube.
(d) Silent (grep for temperat/galvo/damage/jump: nothing). Only comment: "tuning brightness of colours based on safety zones" listed as a user-side TODO (stream/frame.rs:274).
(e) Silent. lasy says its goal is "optimising linear vector images for galvanometer-based LASER projection" (lib.rs:3), i.e. interpolation is treated as the host's job.
(f) stream/mod.rs:5-8: DEFAULT_POINT_HZ = 10_000, DEFAULT_FRAME_HZ = 60. No reason given; doc says point_hz should be no greater than the DAC's max_point_hz.

## Answer to the owner's question, from this evidence
- Nobody publishes a firmware-side jump limit for the LaserCube. The only firmware protection documented is the 76 C over-temperature cut-off (needs manual restart) plus key/interlock/E-Stop. Not documented either way: whether firmware bounds galvo slew. Treat as not protected.
- Both ecosystems put jump handling in the HOST: Wicked via OpenLase on_speed/off_speed + dwell params; nannou via lasy distance_per_point 0.1 + corner delay + blank delay. di.iiii has none of these.
- Wicked's host also ships a temperature power limiter (60-75 C, down to 50 %) ahead of the firmware cut-off at 76 C. di.iiii has no temperature stop; status byte 24 is already in the 0x77 reply.
- Gaps owed to verify: Wicked UDP PDF (lzr/udp-streaming-protocol.pdf) not read; no measured galvo-damage data exists in either project.
