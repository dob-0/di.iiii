## 2026-10-01 — desk UI audit, part 1: Go, tap tempo, loop toggle, empty Scenes/Chase, one NOW

- From the MOXIR UI audit. Branch fix/desk-ui-audit-p1-2026-10-01, on fix/desk-ui-audit-2026-10-01. Every guard was seen failing on the old code first.
- Top-bar Go: labelled "Next scene" (title "Step to the next desk scene") and hidden when the show has no scenes (renderAll). Guard: test-wiring.js.
- Tap tempo: `tapTempo(timesMs)` in app.js. Needs 3 taps; an interval under 250 ms restarts the run; a pause over 3 s restarts it; 20 or 300 BPM is not saved, `say(..., true)` tells the person. Guard: tests/test-tap.js (6 cases: [0,200] reject, [0,500,1000] 120, [0,100,600,1100] 120, [0,190,380] reject, a pause, the floor). Not yet in `npm test`'s file list (package.json was out of scope).
- Touch loop: `.sq.toggle` with aria-pressed and `.toggle.on` (accent outline, accent text, no fill); label "Loop", the on/off word lives in the title. The Control page's own `#cueLoop` still uses the old fill (not in the brief).
- Control page with looks or cues but no scenes: Scenes and Chase panes hide, one muted line says where things are. A desk with nothing at all keeps them, since that is where the first scene is saved.
- One NOW: `GET /api/state` has `now`. `fireLook` records who fired (`by: 'cue'` from the cue runner, otherwise manual) in memory on the layer; `nowOnDesk()` reads it, falling back to the cue list's own place after a restart. `cue` is filled whenever a list is loaded (also for a hand-fired look, so the bar can say where GO resumes). Touch headline: "Red room · cue 3 of 8 · running" / "Green core · fired by hand · GO resumes at cue 4" / "Nothing on · N cues".
- Tests: test-wiring.js +4, test-tap.js (new), test-http.js +1 (hand fire -> manual and name; cues load + go -> cue with index; taking the layer back by hand -> manual). test-wiring, test-http, test-cues, test.js all pass; `node --check ui/app.js` clean. Not looked at in a browser.

## 2026-10-01 (later, emily-9f review) — the Control page reads the same NOW

- Seen in Chrome at 1440×900 on PONYO: the Touch page was right, but the Control page's cue strip still said "nothing fired · 8 cues" beside White cathedral fired by hand, and its "loop on" still had GO's fill.
- Fixed: `paintCues` writes `touchHeadline()` (the desk's `state.now`), plus the clock only while the list runs. `#cueLoop` is the same `.toggle` as the Touch Loop.
- Tried and reverted: hiding the empty scene-detail pane. The Control top row is a fixed grid with its splitters as items, so hiding one pane moved Layers and Master into the wrong columns and they drew blank. The guard now fails if that pane is ever hidden.
- test-wiring +1 (red on the old code). All five desk suites pass: test-wiring, test-http, test-cues, test, test-tap.
