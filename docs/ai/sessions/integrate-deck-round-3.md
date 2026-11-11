## 2026-11-11 — Deck round 3: one install branch for the show tree

- In the branch: the K2 controller window with the K2 (1.9) button rows top-down and the hidden-deck fix; draggable borders between the deck panels with the unmount, window-resize and touch fixes; an on/off switch per source with the video-stream release fix; ways back to the VJ deck from Studio and the node view; the wiki help line about a camera with no picture.
- Merge order: K2 window, borders, source switch, ways. The help-line commit was already inside the ways branch, so cherry-picking it gave an empty change and it was skipped.
- Conflicts: src/wiki/wikiContent.js (twice) and docs/ai/known-fixes.md (twice). Both sides kept: the K2 window line, the newer TWO K2 CONSOLES line, the newer RESIZE THE DECK line, and the SOURCE SWITCH line; all known-fixes entries kept. The session notes of the pieces did not conflict. VjDeckView.jsx merged without a conflict.
- Tested: the whole unit suite and one build on this branch (results in the job report).
- Not tested: nothing seen in a browser, on a touch screen, or on the real K2.
