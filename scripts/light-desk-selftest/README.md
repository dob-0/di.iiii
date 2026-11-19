# light-desk-selftest

Tests a light desk's scenes on the machine that drives the lights, then puts the desk back **exactly** as it found it and
proves it. Stdlib Python, no install. First used 2026-10-31 on the stage Mac (10 scenes, exit 0); written in session dob-19.

What it checks, per scene with the given id prefix:
- recall at fade 0 (under its own hold owner): every patched channel equals the scene's value;
- the look of the same id on the cue layer: only dimmers move (channels a scene LFO drives are reported apart),
  within the look's step range;
- flashes: the most in any 1 s at the show BPM, read from a run sheet's `### NAME NN … — 120 BPM` headings.
  This is a WCAG 2.2 SC 2.3.1 proxy: opposing dimmer changes of 26/255 or more; pass is 3 or fewer.
  It is unvalidated for LED dimmer curves, and 20 Hz sampling aliases flicker above 10 Hz.

Restore and proof:
- holds come back with their owners;
- fixture values, the cue layer, LFOs, fx, master, blackout, chase, audio, cues and DMX 1-32 all compare equal;
- the laser desk is only read, before and after.

Each flag is set before its POST, every restore step retries for about 60 s, and the found state is fsynced before the first POST.

```bash
python3 scene_selftest.py --dry --prefix muth --runsheet run-sheet.md   # GETs only: prechecks and the plan
python3 scene_selftest.py --run --prefix muth --runsheet run-sheet.md   # live test + restore + proof
python3 scene_selftest.py --restore /tmp/scene-selftest.found.json      # put back a run that died
python3 test_scene_selftest.py                                          # 7 fault cases on a fake desk
```

Exit codes:
- 0: tested, and the desk is proven as found;
- 1: aborted, but restored;
- 2: RESTORE INCOMPLETE. Run `--restore` and read the JSON.

Run it detached (`setsid nohup … &`) when it is started over ssh. Defaults speak to `http://127.0.0.1:4000/serverXR/light/api`.
