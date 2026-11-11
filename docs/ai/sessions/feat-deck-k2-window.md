## 2026-11-11 — K2 controller window (Device button)

Branch `feat/deck-k2-window`. The K2 panel has a Device button that opens one named pop-out window
(`di-k2-controller-window`, 440 x 1000) showing the controller as a drawing, read only.
- Route `/{space}/perform/{projectId}/k2` (`k2WindowRouting.js`, dispatched in `RootApp.jsx` before the Perform line); no gate, no project load.
- Face as data: `xone-k2-face.json` (kind, x, y, size, printed text, job-text place for each of the 58 controls; body 135 wide ASSUMED). A console whose controller has no face gets no Device button (`k2Face.js`).
- Words: `k2Jobs.js` is the one source of "what a control does now" for the panel cells and the window.
- Courier: `k2Channel.js`, BroadcastChannel `di-k2-controller-window-v1` (messages in the file header). Only the deck page talks to MIDI; the window never asks for MIDI access. `useDeckMidi` owns the publisher (`k2Publisher`): free while no window asked, one events batch per animation frame, no deck render per MIDI event.
- Not seen in a browser when it was built; tests are vitest only (`k2Face`, `k2Channel`, `K2Window`, `k2Publish.hook`, `k2WindowRouting`).

- Not done: not yet seen in a real browser (desktop and phone) and not installed on a show tree.
- Two review notes are open: the face text is small at the default size, and the timing of the window's asks against the silent limit while the window is hidden.
- This branch sits on top of the panel-resize work (feat/deck-comfort) and lands after it.
