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
