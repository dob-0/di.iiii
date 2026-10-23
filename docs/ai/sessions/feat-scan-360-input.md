# Session note — 360 footage as scan input (2026-10-23, ledger N1250.1)

Owner: "i want to full also i have 360 insta, so start with the android ..." — he owns an Insta360; its footage should feed the scan of a place (Hayfilm next).

What changed: `scripts/place/frames.mjs` now recognises 360 pictures and clips by content (XMP GPano, ffprobe spherical data, 2:1 shape), cuts each sphere into 9 pinhole views (8 round the horizon at 90 degrees + 1 up, photographer masked), and mixes them with phone frames. `place.mjs --from` and `--from-space` pass the 360 flags through. New: `pano-lib.mjs` (pure), `split360.py`, `pano_synth.py` (synthetic test room), tests `pano-lib.test.js`, `pano.test.js`. README section "360 footage".

Measured (synthetic room): views differ from a ground-truth pinhole render by 1.7-2.9 / 255 and from ffmpeg v360 by 2.2-2.5; a 5 degree error fails (> 8).

Owed: a real Insta360 file (model, export settings) to validate detection and the sampling defaults; a rig-aware Meshroom build (rig.json is kept, the batch ignores it); the Insta360 SDK redistribution terms (not needed while we read the Studio export); raw .insv/.insp stay unsupported by design.
