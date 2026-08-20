# Sound learns to speak numbers (plan 3.7)

## What changed

- `media.audio` (Sound) declares four analysis outputs — **Volume, Low,
  Mid, High**, all 0..1. Volume is time-domain RMS (the microphone's exact
  measure); the bands average the byte spectrum under 250 Hz, 250–2000 Hz,
  and above — edges chosen where stage material actually separates (kick /
  voice / air).
- `useSoundAnalysis` — the mic-capture idiom pointed at a FILE: an rAF loop
  over an AnalyserNode, with one deliberate difference: the element's
  output routes into the analyser and NOWHERE else, so the analysis is
  SILENT. The scene's Sound object owns being heard.
- `SoundAnalysisFeed` — invisible editor-level publisher per Sound node,
  the VideoFrameFeed shape, throttled like the mic panel (100 ms), cleared
  on unmount so a deleted Sound reads as silence.
- Colocated `media.audio/runtime.js` reads the four channels back, 0 —
  silence, not undefined — where nothing analyses.
- Known seam, stated: analysis follows the editor's own playback; two
  playbacks of one file started at different moments drift. Owed to the
  show clock.
- `beat` deliberately NOT shipped: a real onset detector or nothing — a
  fake beat that misfires on stage is worse than its absence.

## Verified

Runtime reads unit-proven; full suite 2520/2520; lint at baseline. SEEN
(headed browser, screenshots read): a 110 Hz test tone wired Volume →
Sphere.Radius — the sphere breathes at the tone's level, lands in the Low
band, and VANISHES the moment the tone ends. Headless Chromium's analyser
reads all-zero (environment artifact, cost an hour — headed run settled it).
