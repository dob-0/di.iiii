## 2026-08-22 — Emily's algovrithm branch, landed without its typography half

Emily pushed one commit to `emilyanikoghosyan/di.iiii feat/algovrithm-space` on
2026-08-20, on a base three weeks behind dev. It carried three unrelated strands;
this branch is two of them, rebased onto dev, with the third left where it was.

- **Kept — algovrithm audio.** `audioWake.js` keeps the AudioContext running as a
  repeatable question (gesture, tab visibility, XR sessionstart/sessionend, and the
  context's own `statechange`), instead of the one-shot gesture unlock that left the
  piece silent for good when a headset switched audio device mid-entry. The reel pool
  now applies the unlock state to a pool built after the gesture, so the
  idle-callback warm-up can no longer land on the wrong side of the first tap.
- **Kept — the reel globe's "holes".** Black patches in the headset were never
  geometry: they were video decoders that could not be allocated, failing silently at
  a pool of 31. Two ceilings now, chosen by `navigator.xr.isSessionSupported`.
  Left at nine on the merge and marked OPEN in the file — nine was measured against
  full-resolution sources, and dev has since compressed the reels to 360x640, so the
  headset ceiling is very likely raisable once someone measures it on the device.
- **Kept — viewport.** `ringTour` and `textReveal` as pure helpers with tests; the
  typewriter reveal on text objects, which needed a real defect fixed first (text was
  the only type whose `appearance.opacity` did nothing, so timelines animating opacity
  silently no-op'd); positional video sound, opt-in per video; a parented entity no
  longer gets the legacy idle bob/spin, which is what pulled the 360 Cinema's cabinets
  away from their video planes in the walk viewer but never in the editor.
- **Dropped — the typography strand.** Self-hosted Montserrat, `muiTheme.js`, the
  `--di-sans` pass across landing, studio, inspector, panels, wiki and wcc, and the
  wiki's `platform-typeface` article are NOT here. They stay on Emily's fork for a
  decision of their own. `@fontsource/arimo` is kept, because portal labels use it.

Re-homed during the rebase, since dev had moved underneath all of it:
- `playTimelines` and the `?xrdebug=1` panel now live in `PublicProjectSceneSurface`,
  which dev extracted out of `PublicProjectViewer` after Emily's base.
- Spatial video sound became a child component (`SpatialVideoSound`) rather than an
  effect in `VideoObject`: dev's shared video cache means `VideoObject` is rendered
  by plain react-dom tests that never open a Canvas, and `useThree` throws there.
  Mounting it only when a video asks for spatial sound keeps those tests honest.
- `LABEL_FONTS.default` is dev's vendored troika face, not "no font prop" — the
  latter sends troika to a CDN at render time and paints nothing offline.

Verified here: full suite 300 files / 2662 tests green, lint 0 errors, build clean,
`docs:wiki:check`, `check:three-vendor`, `check:fallback-patterns`, `test:schema-sync`
all pass. Looked at, at DPR 2: `/algovrithm` front door and the piece running through
its sequences (no console errors), and `/wcc/scene` side by side against dev — same
picture. `check:input` fails identically on plain dev in this environment, so it is
not this branch.

Not done: nothing on this branch is verified in an actual headset, which is where
every audio fix in it was aimed.

## 2026-08-22 — and then brought up to date instead of merged as found

A second pass, on the owner's word: her fixes are right, but several were
written against a codebase that has since answered part of the same question.
Merging them as found would have shipped stale assumptions with a green suite.

- **The headset ceiling stopped being a number.** `HEADSET_MAX_PLAYERS = 9` is
  gone. In its place: `HEADSET_PIXEL_BUDGET` (nine 1080x1920 frames — the load
  the pool was known to run at) divided by what one frame actually costs, probed
  from a single reel's metadata by `probeReelPixels()` before the pool is built.
  At the folder's current 360x640 that clears all 31 clips, so a headset gets the
  whole folder — the thing her own comment said the compression was supposed to
  buy, which dev had already done on 2026-08-08 and nobody had gone back for.
  Re-encode the reels heavier and it tightens again on its own. A probe that
  cannot answer falls back to nine.
- **And the ceiling stopped being load-bearing.** A budget is still a prediction
  about hardware this repo cannot test every variant of, so the failure it
  predicts is now caught rather than assumed away: `hasPicture`/`displayTextures`
  hand the globe its textures with any player that never produced a frame
  replaced by a live one, dealt round-robin so substitutes spread across the
  folder. Guessing too high now costs a repeat — which is what a feed looks like
  — instead of a hole in the shell.
- **That repair was wrong on its first draft, and the browser said so.** Polling
  `readyState` reported three of thirty-one dead mid-beat on a desktop where
  every clip was decoding: each player seeks to a random point in its own
  timeline, and readyState drops for the length of a seek while the texture keeps
  showing its last frame. It latches on the first frame ever decoded instead —
  the one thing a refused decoder never does. Pinned as a test.
- **audioWake moved to `src/utils/`.** It answers "is this context still
  running", which is not algovrithm's question: any surface that puts a sound in
  a room meets the same headset audio-device switch. `positionalVideoSound` now
  registers through it instead of its own one-shot gesture listener — that
  listener was the exact bug audioWake exists to kill, two files apart in the
  same commit.
- **A spatial video takes its own element.** dev's video cache shares one
  element per (source, muted, volume, loop), and a media element can be routed
  into Web Audio only once — so two spatial videos on one clip would have left
  the second with flat sound in the wrong place. `exclusive` opts a caller out of
  sharing; muted videos and every existing space are untouched.

Seen, in a real browser at DPR 2: the globe beat with all 31 players decoding
and `window.__diiReelPool` / `__diiReelHealth` reporting 0 dead; then eleven of
them marked frameless by hand and the same shell coming back full of repeated
clips with no black cells in it.

Still not seen in a headset — which is where the ceiling this pass raised is
actually decided. `__diiReelHealth` is there to be read on the device.
