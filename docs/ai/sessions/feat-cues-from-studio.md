## 2026-09-21 — one key, the whole stage: cues fire from Studio, not only from the mapper

Step 6 of `2026-09-20-one-project-one-stage.md`. `mappingState.cues` belonged to the project all
along; only the projection tool could press one, so taking a cue meant changing tools mid-show.

- Firing moved out of the map hook into `src/map/cueFiring.js` — `CUE_KEYS`, `isCueKey`,
  `cueForKey`, `cueOps(cue)` and `fireCue(cue, applyOps)`. `useMapDocument.fireCue` is now one
  line that calls it; the mapper's keyboard handler and the cue editor's key picker read the same
  binding rather than each restating `1`–`9`.
- The BroadcastChannel courier moved to `src/map/mapCourier.js` (`useMapOpCourier`), because the
  3D scene writes to a mapping now and a cue taken there has to reach the wall as fast as one
  taken at the mapper's own desk. `mapChannelName` is still exported from `useMapDocument.js`.
- `src/studio/hooks/useStudioCues.js` listens for `1`–`9` in Studio and fires through that one
  function. No new binding: Studio claims no digits of its own. The only thing that takes them is
  a modal transform typing a number into a locked axis, and that listens in the CAPTURE phase and
  calls `stopImmediatePropagation`, so it keeps winning; this is an ordinary bubble-phase listener
  and never sees those keystrokes. It also stands down entirely for a project with no cues, so a
  digit is not quietly swallowed on the way to something else.
- `StudioCueStrip.jsx` lists the cues by name and fires one on tap. It wears its host's chrome
  rather than a third look: the control cluster's `.scc-btn` in a new `Cues` section under
  Display, and the phone shell's pill above the bottom bar. It draws nothing when the project has
  no cues.

Proven by running it: a project with one surface and two cues, Studio and the map output page open
side by side in one browser. Tapping `2 Blackout` in Studio took the wall from the surface to
black (`out · … · ok` → `all-off`); pressing `1` in the 3D scene brought it back. Zero console
errors on either page. On a 390×844 phone at DPR 3 both cue buttons are 44px tall and tappable.

NOT proven: nothing was fired at a real lighting desk (`/light` is absent on this checkout, so
`recallCueLighting` is exercised by tests only), and the wall was a second window on this machine
rather than a second machine on the rig.

Found and fixed on the way: the phone strip was covered by the first-run coach pill — see the new
row in `docs/ai/known-fixes.md`.
