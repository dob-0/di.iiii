# feat: the APC40 is patched in full (2026-11-27)

Owner N7277: "use the full midi potential ... patch it full ... that it can be suite patched". Stacks on #1394 (`feat/desk-red-pad-follows-2026-11-27`). Design: `agent-reports-2026-11-27/apc40-full-patch-design.md`.

## What (49 -> 73 bound controls, "Map my controller")
- Groups (universe 5 Left truss, 4 Right truss, rest Back bars; a desk group of that name wins): faders 1-3 = dimmer (mean read, soft takeover), activators 1-3 = on/off with the LED on the track channel.
- Layer "cue": fader 7 level, track knob 6 rate (log taper 1/8x-8x).
- Tempo: Tap (beat + speed), Nudge -/+ (25 ms), TEMPO knob relative (1 click = 1 BPM). New relative-encoder kind (1-63 up, 64-127 down), no takeover.
- Zoom fader 6 (only fixtures with a zoom channel: the 15 back bars in Reika), colour FX amount (fader 8), beats (knob 7), spread (knob 8), mode (CUE LEVEL relative knob), on/off (metronome). Modes and amounts only: colours stay with colorfx.js, which skips green.
- Hits (press+release): white (every fixture), Left, Right (api/raw holds, owner apc40: dimmer, shutter, emitters; never strobe), swap (colour FX swap while held, then restored). Let go on release, on disarm, on page close, after 15 s.
- Safety: blackout release (always off), panic (blackout, chase off, FX off, cues stop).
- Strobe on the movers stays UNBOUND: a venue safety decision for the owner.
- Pure parts in `ui/midiPatch.js`; wiring in `app.js`; preset in `midiCues.js`.

## Found by the scratch run
A keepalive fetch is capped near 64 KB; a white hit over 33 fixtures is ~60 KB and was silently refused. Keepalive now only for bodies under 30 KB; a tiny `{owner, clear}` post is the page-close and disarm backstop.

## Checked (test copy `di-dev up apc40-full --api scratch`, Reika checkpoint 2026-11-27-034941, output off, empty map; live desk untouched)
- vitest `serverXR/src/lighting`: 16 files, 194 tests (34 new in midiPatch.test.js).
- `serverXR/src/lighting/tools/apc40-full-sim.mjs` (headless, fake APC40 over Web MIDI stub): 47 of 47 checks: 73 mapped, Safe sends nothing, group dim/on + LEDs, layer, tap/nudge/tempo, zoom, colour FX, three hits + release + release on disarm, blackout release, panic (FX, cues, blackout), strobe unbound.
- Pictures `agent-reports-2026-11-27/apc40-full/pane-*.png` at 1534x830 and 1536x864: new rows readable, nothing cut.
- Not checked: the real APC40 (second-press message of toggle activators, LEDs, device-button channel = bank 1 = ch 1), real Web MIDI, a hit on real lamps, chase off (test show has no chase scenes; unit-tested only). The drawing (`apc40draw.js`) does not yet show the new buttons; the mapping table does.
## Rollback
Revert the PR; "Clear map" + "Map my controller" returns to 49.

## Round 2: strobe, effect knob pages, movement size (N7314, N7315) - engine, preset, tests done; app.js wiring WAITS
State: 73 -> 100 preset controls (73 + 23 device knobs + strobe rate + movement size + 2 strobe hits). The page wiring in `ui/app.js` is not in this commit: #1394 (the base) is being reworked there; head was e6c410f2a (the base) when checked.
- Engine: `layer.headScale` 0-1 (api/layer `headScale`, saved only below 1). `headMotion.headsFrame` scales each look's pan/tilt swing around the look's own rest position. 100 % = the same bytes as before; 0 % = heads hold the centre; never outside 0-255 (`headScale.test.js`).
- Strobe: `midiPatch.capStrobeDmx` caps the BAR1240PIX57 `strobe` hold at DMX 14 (= 2.92 Hz, WCAG 2.3.1); test sweeps the knob 0..1 in 1000 steps. MovingBar43 `shutter` is never written: movers get the software strobe (fx.js, slice >= 350 ms) only.
- Pixel COUNT: the pixel map has no live count / segments / repeat parameter (a strip's `pixels` is a patch, not a live knob); not bound, patch untouched.
- Colour fx page: its 4 parameters (mode, beats, spread, amount) are already on CUE LEVEL, track knobs 7-8 and fader 8; a/b colours stay unbound (no-green rule). No second page.

### Control -> parameter -> range (a key has one control; ch = MIDI channel)
| Control | CC / note | Parameter | Range |
|---|---|---|---|
| Track fader 1-3 | CC 7, ch 1-3 | left / right / back group dimmer | 0-100 % |
| Track fader 6 / 7 / 8 | CC 7, ch 6-8 | zoom / layer level / colour fx amount | 0-255 / 0-100 % / 0-255 |
| Activator 1-3 | note 0x32, ch 1-3 | group on / off | switch |
| Track knob 1 | CC 48 ch 1 | strobe rate (hits) | 1-3 Hz = DMX 4-14 (capped) |
| Track knob 2 | CC 49 ch 1 | movement size (layer.headScale) | 0-100 % (100 = as written) |
| Track knob 6 / 7 / 8 | CC 53-55 ch 1 | layer rate / colour fx beats / spread | 1/8-8 x / 1-32 / 0-1 |
| TEMPO / CUE LEVEL | CC 13 / 47 (relative) | tempo / colour fx mode | 20-300 BPM / none hue chase swap |
| PAN / SENDS | note 0x57 / 0x58 ch 1 | strobe hit: bars + soft / movers soft only | hold |
| Device pads 1-4 | notes 0x3E-0x41 | white / left / right / swap hits | hold |
| TAP, NUDGE -/+, METRONOME | 0x63, 0x64/65, 0x5A | tap tempo, beat nudge, colour fx on | press |
| SESSION REC / BANK LOCK | 0x66 / 0x67 | blackout off / panic | press |

Device knobs 1-8 = CC 0x10-0x17 on the channel of the TRACK SELECT bank (bank 1-4 = ch 1-4); each ring shows the value (CC written back) and its type (CC 0x18-0x1F = 1, once).
| Bank | Page | Knob 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | FX engine | mode (15) | spread (7) | depth 0-255 | tempo 20-300 | - | - | - | - |
| 2 | Pixel map | pixel size 1-30 % | mix 0-255 | speed 0.1-4 x | brightness -100..100 | contrast 0-300 | left-right +-1000 | up-down +-1000 | - |
| 3 | Pixel animation | size 0.1-5 x | beats 0-64 | phase 0-1 | direction (3) | easing (3) | travel x +-1000 | travel y +-1000 | mix breathing 0-1 |
| 4 | LFO 1 | wave (5) | beats 0.25-64 | depth 0-255 | spread 0-1 | - | - | - | - |
