## 2026-11-27 — Light desk: cue list on MIDI pads, Akai APC40 mkII layout

- Why: the Reika night (Hayfilm, 27 Nov) runs from the desk's cue list, and an APC40 mkII sits on the desk machine; the MIDI page could only reach the 16 old scene pads.
- `ui/midiCues.js` (plain script, tested by `midiCues.test.js`): cue pad targets (one per cue, up to 40), transport pads (GO next, back, stop, play-in-order, loop), and the APC40 mkII preset from Akai's "APC40 Mk2 Communication Protocol" v1.2, Generic Mode inbound tables.
- Layout: master fader CC 14 = master; grid = cues 1-40 reading top-left first (top row notes 32-39, bottom row 0-7); PLAY 91 = GO; STOP ALL CLIPS 81 = stop; SCENE LAUNCH 82/83/84 = back / play in order / loop; SCENE LAUNCH 86 = blackout (one-way).
- The protocol does not say where CLIP LAUNCH 1 sits on the panel; top-left = note 32 follows the common APC40 mkII scripts. Still to confirm with one real press; the learn row fixes any pad that is wrong.
- Found on the way: a switch pad pressed twice inside one cue poll sent "on" twice (stale poll); the page's own last send now wins for 2.5 s. Pad rows read "catch" like faders; pads no longer wait for takeover.
- Proof: a headless Chromium with a stubbed Web MIDI "APC40 mkII" drove a test desk copy (offline, own data dir, Reika show copy): 13 of 13 checks, 8 runs after the fixes. Lighting tests 88 passed; api contract ok.
- Not done here: pad lights showing the running cue (needs Web MIDI output); a server-side MIDI bridge so no browser tab has to stay open.
