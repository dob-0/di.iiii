<!-- Landed 2026-10-14 (ledger N645.4) from agent report: laser-raw-gap-audit.md (date 2026-10-14).
Source of facts: external repos/pages named in the body with URLs and commit SHAs; licences as recorded there.
Licence rule: GPL-3.0 code may be quoted briefly with attribution, never copied wholesale; no code from this note is in the product.
MEASURED vs CLAIMED: vendor pages were fetched through a summariser, so vendor claims are second-hand; the Raw side is read from origin/dev 4a10bc1c.
UNVALIDATED: every vendor feature claim until the page is re-read before quoting.
Provenance: written by an agent, so a claim until re-checked at the cited commit. -->

# Laser / Raw gap audit (2026-10-14, read-only, origin/dev)

## 1. Pro reference (official pages; fetched via summariser, so claims are second-hand: re-read pages before quoting)
- Pangolin BEYOND wiki (wiki.pangolin.com): Projection Zones /beyond:projection_zones-new (geometric correction: sliders + free-form mesh 1x1..9x9; 64x64 Beam Attenuation Map 0-100 % per pixel; zone mute; zone name must match content or output blocked; up to 40 projectors, "Also To", Distribution across up to 8 lasers (FB4 only)); /beyond:timeline (tracks, cues as containers, DMX/beam sequences); /beyond:dmx_server (each zone = fixture, own cue player; Abstract Generator oscillators/modulators linkable to DMX; projector/zone/beam settings deliberately NOT DMX-controllable for safety); /beyond:osc_commands; /beyond:midi_settings-new (notes -> zones/mute, PangoScript); /beyond:artnet_dmx_sacn; MIDI + Art-Net timecode out. Scan-fail not on the zones page (not verified).
- LaserOS (laseros.com): 80+ effects, 75+ visualizers, abstracts (music-reactive), beam show, text, import logo/animation, draw/mapping, clock, MIDI piano; integrates Ableton/TD/Resolume/MadMapper. Timeline/ILDA/DMX/zones not on page (wiki.laseros.com not read).
- TouchDesigner: docs.derivative.ca/Laser_CHOP (SOP/POP/CHOP in; step size, blanking step, corner hold, closed-shape overlap, colour delay/blank delays, brightness curve, 10k-96k sample rate default 48k, X/Y scale, rotate; no zones; safety = warnings only); /Laser_Device_CHOP (EtherDream, Helios, ShowNET; NOT LaserCube; queue time, X/Y/RGB scale; blank when RGB 0).
- MadMapper/MadLaser (docs.madmapper.com MadLaser section; madmapper.com/extensions/madlaser): laser mesh warping + soft edge, generators, Laser FX, GLSL vector shaders, ILDA in/out + snapshot, SVG, OBJ wireframe, video vectorisation; EtherDream/Helios/ShowNET/FB4. (search-result level only.)
- ofxLaser (github.com/sebleedelisle/ofxLaser README): input zones -> lasers, masks (blank areas), per-zone warp, scanner presets (default/fast/detailed, saved), multi-laser, SVG, DACs incl. LaserCube USB/WiFi, IDN, Helios, EtherDream; no ILDA file import listed; non-commercial licence.

## 2. What Raw has (origin/dev)
- laser.shape (nodeRegistry.js:2133; nodes/laser.shape/runtime.js, laserShapes.js): 8 shapes, size/height/rotation/spin/colour/level/points -> one `{kind:'laser',points}` frame. Single colour, no per-point colour programme, no text/SVG/ILDA.
- device.laser.out (:834; runtime.js 8 lines; src/raw/components/LaserOutPanelWindow.jsx): inputs frame, cube ('all' or id), blackout. ONE frame in, panel posts to serverXR (25 fps cap, 50 ms keep-alive). Frame cap 2000 pts (shared/laserFrame.cjs). No merge/combine of several lasers into one Out; no transform (scale/offset/mirror/warp) node; one Out per cube is the only multi-cube path (not verified in UI).
- Server safety (serverXR/src/laser/laserEngine.js): sign-off ARM phrase, keep-in zone (default y 0..1, upper half), cube must answer info before arming, 200 ms signal-loss blank, still-beam guard with officer-approved list, DAC-rate ceiling, 6 default cubes. Good; this is stronger than TD/ofxLaser docs.
- signal.lfo (:2163): sine/square/triangle/saw from frequency+phase (Hz, document clock). No BPM sync, no random/S&H waveform, no amplitude/offset/duty, no shape/tempo-ratio. value.noise, value.random exist. `time` node has bpm (nodeGraphRuntime.test.js:297) = beat-phase source, not wired to LFO.
- signal.counter/timer/trigger/ease/lag/hold/delay/speed, math.*, logic.*, colour.ramp: scalar plumbing. No step sequencer, no envelope (ADSR), no tap tempo, no clock divider.
- source.mic (:542): volume + frequency (any). src/raw/utils/soundAnalysis.js: FFT 1024, 3 bands (<250, 250-2000, >2000 Hz). No beat/onset, no BPM detection as node. BPM/tap/LFO/FX are in serverXR/src/lighting (desk.js, lfo.js, fx.js, looks.js) = the /light desk, confirmed NOT exposed as Raw nodes or to laser.
- device.midi.in (note/velocity/cc/value/trigger/channel), device.osc.in/out, device.dmx.out, device.midi.out, view.timeline (playhead/playing), view.button, device.keyboard: control I/O exists; no Art-Net/sACN *in* node seen (serverXR/lighting/dmxin* exists, not a Raw node, not checked).
- Import: git grep finds no ILDA/.ild or SVG-to-laser code in src/shared; ilda word appears only as keyword. Missing.

## 3. Gap table  (* = top 10 for live techno, 6 cubes)
| Feature | Pro (cited) | Raw today | Size | Safety note |
|---|---|---|---|---|
| *BPM clock + tap tempo -> all modulators | BEYOND timecode/abstract; LaserOS abstracts | `time` node bpm only; tap/BPM in /light desk, not Raw | S-M | none |
| *LFO with BPM sync, ratios, offset/amp, random/S&H | BEYOND abstract generator oscillators/modulators | signal.lfo Hz only, 4 waves | S | rate limits on size/speed |
| *Step sequencer / cue sequencer (pattern -> shape/colour/zone) | BEYOND cue grid+timeline; LaserOS | missing (counter+route by hand) | M | tied to guards |
| *Audio analysis: beat/onset, bands, level | LaserOS music-reactive abstracts | mic volume + 3 bands, no beat | M | audio must not bypass blackout |
| *Combine/layer several frames into one Out | BEYOND zones/cues layering; ofxLaser zones | missing (one frame per Out) | M | point budget 2000 must hold after merge |
| *Per-cube routing / zones (shape A to cubes 1-3, B to 4-6) | BEYOND zones + Also To/Distribution; ofxLaser zones->lasers | Out.cube string, 1 Out per cube | M | keep-in zone per cube stays server-side |
| *Transform/mirror/array/duplicate effects (scale, offset, mirror, rotate-spin, multi-copy) | BEYOND effects; LaserOS 80+ effects; TD scale/rotate | only rotation/spin/size/height inside shape | M | output still clipped by server zone |
| *More generators: beam fans/tunnels, lines array, text, polyline | BEYOND abstracts/beams; LaserOS beam show/text | 8 shapes | M-L | beam shows need still-beam rules, haze rules |
| *Geometric correction / warp per cube + brightness map | BEYOND mesh+BAM; MadLaser warp; ofxLaser warp | missing | L | BAM = safety tool; do server-side, not wire-controlled |
| *Live control: MIDI/OSC to cue + master dimmer, global blackout | BEYOND MIDI/OSC/DMX | midi.in, osc.in exist; Out has blackout input; no master level/panic node | S | blackout must be hardware-path-independent |
| Scanner optimisation (blanking dwell, corner hold, point distribution, scan-fail) | TD Laser CHOP; ofxLaser presets; BEYOND min points | none seen (server paces to DAC rate) | M-L | affects scanner heating |
| Timeline w/ laser track | BEYOND timeline, LaserOS | view.timeline outputs playhead only | L | |
| Import ILDA .ild / SVG / text | MadLaser, ofxLaser(SVG), LaserOS import | missing | M each | point cap, colour check |
| Colour per point / gradients | all | one colour per frame (colour.ramp unwired) | S-M | |
| DMX/Art-Net/sACN in, timecode | BEYOND | dmx.out only (in not found) | M | BEYOND deliberately blocks DMX from safety settings: copy |
| Multi-projector (40 in BEYOND) | BEYOND, ofxLaser | server 6 cubes; fan-out by Out nodes | S | |
| Mask / blank regions | ofxLaser masks, BEYOND BAM | missing | M | |

Limits: pro sites were read through a summarising fetcher, not full manuals; BEYOND scan-fail, LaserOS wiki, MadLaser guide PDF, ofxLaser docs site not read in full. Raw runtime behaviours beyond registry entries (e.g. LFO internals, multi-Out UI) not exercised.
Sterile: yes (no repo changes, nothing running).
