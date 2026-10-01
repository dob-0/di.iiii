## 2026-10-01 — scene deck scrolls on phones; Studio view bar and split buttons are reachable

Found by a human test of the MOXIR show. Two bugs, both "the control exists and nobody can touch it".

**Scene deck** (`src/rigbuild/scenes.css`): the page was `min-height: 100vh` under a fixed body, so it never
scrolled. Now it is its own scroller; the sticky foot rests after the last tile. 14 of 14 tiles reachable at
1440x900, iPad Pro 11 and iPhone 13; last tile tapped and selected at each.

**Studio views** (`SmartViewBar.jsx`, `StudioViewportLayout.jsx`, `studio.css`): the bar sat under the nav; the
split buttons were hover-only. The bar now offsets by `--svl-top-clear`; on phone/tablet a small hook measures the
fixed `.smb-topbar` and stacks split row then view bar beneath it. Clicking Rig changes the camera at all three sizes.

Guards: `scenesPageScroll.test.js`, new cases in `SmartViewBar.test.jsx` and `StudioViewportLayout.test.jsx`
(7 failed on the old code). Windows baseline failures in `src/rigbuild` (hash/CRLF, bash scripts) are unchanged.
Owed: on a very narrow phone the seven-button bar scrolls sideways (X-ray touches the edge).
