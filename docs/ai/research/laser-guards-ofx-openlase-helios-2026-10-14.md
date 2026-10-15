<!-- Landed 2026-10-14 (ledger N645.4) from agent report: laser-guards-ofx-openlase-helios.md (date 2026-10-14).
Source of facts: external repos/pages named in the body with URLs and commit SHAs; licences as recorded there.
Licence rule: GPL-3.0 code may be quoted briefly with attribution, never copied wholesale; no code from this note is in the product.
MEASURED vs CLAIMED: read-only source reading at the cited SHAs; nothing built or run.
UNVALIDATED: ofxLaser licence not opened in detail (check before copying); OpenLase is GPL, ideas and numbers only.
Provenance: written by an agent, so a claim until re-checked at the cited commit. -->

# How open-source laser software protects galvos (read 2026-10-14, read-only, nothing built/run)

Clones (shallow) in session scratchpad `.../scratchpad/lg/`. Line numbers are at these commits.
- ofxLaser  https://github.com/sebleedelisle/ofxLaser  @51288b44a2fb0339966a1cdb8e675a3d82ee8a46 (2026-08-17). Licence: ofxLaser LICENSE file (not opened in detail; repo also has FONT_LICENSE.txt). Check before copying code. LaserCube drivers are NOT in this repo: they live in submodule libs/libera-laser (sebleedelisle/libera-laser, .gitmodules), which was empty in the clone and NOT read.
- OpenLase  https://github.com/marcan/openlase  @e6c80165479a1fa85774673257e938f4066c939e (2020-09-01). Licence: GPL-2/GPL-3 (libs LGPL-2.1/3, COPYING.* files). Copying code into non-GPL tree is not possible; ideas/numbers only.
- Helios DAC  https://github.com/Grix/helios_dac  @f772cbbfb3e0e5e7e61afc48868c88a85e3d5741 (2026-09-07). SDK: MIT (sdk/cpp/LICENSE.md, HeliosDac.h:5). Firmware: Commons Clause (firmware/LICENSE.md). Hardware: separate.
- Fourth project (LaserShark / ROS): skipped, not needed.

## 1. ofxLaser
(a) Step limit / interpolation: YES, speed-based, not a hard clamp. Shapes are resampled by a trapezoid velocity profile (speed + acceleration): src/shapes/ofxLaserShape.cpp:13-70 `getPointsAlongDistance(distance, acceleration, speed, speedMultiplier)`, `acceleratedistance = (speed*speed)/(2*acceleration)`. Profiles (src/core/ofxLaserScannerSettings.cpp:34-47): DEFAULT speed 4 / accel 0.5 / corner 30deg / dotMaxPoints 10; FAST 6 / 1.2 / 80 / 5; DETAIL 2.5 / 0.4 / 15 / 20. UI ranges RenderProfile.h:29-32 (speed 1..40, accel 0.01..10). Units: canvas-pixel distance per point (800-ish canvas); not stated in code. Blank jumps between shapes: `addPointsForMoveTo` ofxLaserLaser.cpp:1409-1421, `blanknum = (v.length()/scannerSettings.moveSpeed)/getSpeedMultiplier()`, eased with `Quint::easeInOut`; moveSpeed default 4.0 (range 0.1..50), ScannerSettings.cpp:14. So a full-screen jump is spread over many points and eased in/out. Speed is scaled by pps: `30000.0f/pps * speed` (Laser.cpp:1818), i.e. tuned at 30 kpps.
(b) Dwell / pre- post-blank: ScannerSettings.cpp:15-18 "Hold off before" default 1, "Hold on before" 0, "Hold on after" 0, "Hold off after" 1 (range 0..8 each); applied Laser.cpp:1049-1070. Corner handling: polyline is split at corners above `cornerThreshold` degrees (Polyline.cpp:89-101) so each segment accelerates/decelerates to rest at the corner (that is its "dwell"). dotMaxPoints = points held for a dot. Also a colour-shift (blank shift) for galvo/laser lag (Laser.cpp:1480-1495).
(c) Stream stops / disconnect: in this repo, little. DacBase re-arm: after arming it sends `blankTimeAfterReArm` = 0.1 s of blank points (DacBase.h:102, DacBase.cpp:6-9; comment says 0.2 s, code 0.1 - mismatch). Libera DAC path deliberately delegates blanking to libera (DacLibera.cpp:9-10, 132-135). Timeout/disconnect behaviour is in libera-laser: NOT READ, so unknown.
(d) Thermal: silent. grep for temperature/thermal/overheat in src: nothing.
(e) Hardware-protects-galvos claim: none. README.md:31-35 "Safety Notice" is about eyes/fire only; says have an e-stop. Nothing about galvo damage.
(f) Default rate: 30000 pps, range 1000..80000 (Laser.cpp:136), rounded to 100s, DAC may override (Laser.cpp:204-210). No reason stated; 30k is the ILDA/de-facto standard.

## 2. OpenLase (libol)
(a) YES, the clearest numbers. Per-sample step caps in the renderer: `on_speed` (beam on) and `off_speed` (blank jumps) are max step per sample, in fractions of output size, 2 = full width (comment tools/svg2ild.py:23). Defaults in svg2ild.py:24-26: on_speed = 2/90 (~2.2 % of width/sample), off_speed = 2/20 (10 %/sample); showsvg.py:12-13: 2/110 and 2/70; ugoira_player.py:105-106: 2/60 and 2/30. Code: lines are subdivided `points = ceilf(distance/params.on_speed)` (libol.c:468-469, 494-495); blank moves `ceilf(distance/params.off_speed)` (libol.c:727-728), step measured Chebyshev (max of |dx|,|dy|). Linear, no acceleration curve. Params struct: include/libol.h:63-79. `snap` (libol.h:75): moves shorter than it are not bridged with blanking (libol.c:729).
(b) Dwell: start_dwell 3, curve_dwell 0, corner_dwell 4, end_dwell 3, switch_on_dwell 3, switch_off_dwell 6 samples (svg2ild.py:30-41); showsvg.py:15 corner_dwell 4. `get_dwell()` libol.c:415-447 picks corner_dwell vs curve_dwell by angle (`curve_angle` 30 deg). start_wait/end_wait = blank dwell at both ends of every blank move (libol.c:730-741).
(c) Stream stops: no watchdog in libol; output is a JACK audio callback (libol.c:163). If JACK stops, the audio device stops; behaviour of the analog chain is not addressed. `max_framelen` truncates frames (libol.c:823). Silent otherwise.
(d) Thermal: silent (grep: none).
(e) Hardware claim: none found. README.txt is a stub (wiki not read).
(f) Rate: 48000 Hz in svg2ild.py:19 (audio-card DAC; rate = JACK sample rate). Default in code not found; rate is a param (libol.h:64).

## 3. Helios DAC
(a) Step/jump limit: silent. SDK only bounds counts and rate: HELIOS_MAX_POINTS 0xFFF, MAX_PPS 0xFFFF, MIN_PPS 7 (HeliosDac.h:50-52); IDN variant 0x2000 points, 100 000 pps (h:55-57); errors for too many points / pps too high / frame too small (h:66-84). Coordinates are 12 bit (0..0xFFF, h:156); no clamp-to-safe-region, no slew limit.
(b) Dwell/blank: silent in SDK/firmware.
(c) Watchdog: YES, the best example. Firmware: hardware WDT, 500 ms, resets the MCU on inactivity (main.h:30; main.c:413-417). USB disconnect calls `stop()` (main.c:322-333). `stop()`/`stop_weak()` output "a blanked and centered point" (center = 0x800, colours off) and stop playback (main.c:260-272, 291-292), plus a timer-delayed stop for a frame in flight. SDK: HELIOS_FLAGS_SINGLE_MODE (default) = frame plays once and "if a new frame has not arrived before the currently playing one is done, the laser will turn off" (HeliosDac.h:122-124,134). Looping is opt-in. Stop() docs h:18. Shutter command exists (main.c:175).
(d) Thermal: silent.
(e) Claim that DAC protects galvos: none. The protection is only blank+centre on stop/underrun/disconnect; nothing limits scan speed or step.
(f) Rate: no default; pps is per frame. ILDA 30k/8deg: not referenced in the repo (grep ILDA hits only "ISP-DB25 (ILDA)" connector text in README.md:6). docs/getting_started.pdf has only generic safety text.

## Synthesis for di.iiii
- No project has a hard "reject jump > N" clamp; all three use RESAMPLING (OpenLase: fixed max step per point; ofxLaser: velocity/acceleration profile + eased blank moves). Galvo protection = never emit large steps, by inserting points, at the (pps) rate they were tuned for (30 kpps).
- Concrete reference numbers: OpenLase on 2.2 %/sample, off 10 %/sample, corner dwell 4, start/end dwell 3, switch-on 3 / off 6; ofxLaser blank-move speed 4 px/pt eased, hold-off before/after 1, corner split at 30deg, 30 kpps.
- Watchdog best practice = Helios: blank + centre on stop/underrun/disconnect, play-once by default, 500 ms HW watchdog. di.iiii's 200 ms blank matches the idea; add centre-on-blank if the cube allows.
- Thermal: none of the three has any. A thermal stop would be our own design, mark it unvalidated unless the Wicked Lasers docs give a limit.
- Not verified: LaserCube-specific handling in libera-laser; ILDA 30k/8deg spec text (not in these repos); the OpenLase wiki.
- Scratchpad also held pre-existing dirs laserdocklib/ and libLaserdockCore/ (not mine, untouched, not read).
