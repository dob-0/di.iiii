## 2026-11-10 — Perform: window title bars take one row

- Owner N3511, looking at the VJ preset on a laptop: "look how place used bad". Measured on `/platina/perform/platina-screen`: a title bar was 59px at a 1400px page and 130px in the narrow side windows at 700px (it wrapped to three rows), which left the Clock 10px of body and Master none.
- `src/perform/perform.css` now dresses the bar on Perform only (`.perform-shell`): one row, the family word yields first and the title ends in an ellipsis, the word "pinned" is gone (every window there is screen-pinned), no drop shadow (di-brand SYSTEM.md rule 4), and the three controls are 28px on `pointer: fine`, 44px on touch as before. After: 35px bars at both widths; Clock body 105px, Master 88px at 700px.
- Nodes keeps its own bar; `raw.css` is untouched.
- Still undone: the bottom reserve band and the preset margins leave about 73px empty under the windows; no render test pins the bar height (measured by script); not looked at on a phone. The owner compares the VJ desk with Resolume and TouchDesigner (N3513): a layout spec for the deck is owed.
