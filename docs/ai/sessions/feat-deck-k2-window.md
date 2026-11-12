## 2026-11-11 — K2 controller window (Device button)

Branch `feat/deck-k2-window`. The K2 panel has a Device button that opens one named pop-out window
(`di-k2-controller-window`, 440 x 1000) showing the controller as a drawing, read only.
- Route `/{space}/perform/{projectId}/k2` (`k2WindowRouting.js`, dispatched in `RootApp.jsx` before the Perform line); no gate, no project load.
- Face as data: `xone-k2-face.json` (kind, x, y, size, printed text, job-text place for each of the 58 controls; body 135 wide ASSUMED). A console whose controller has no face gets no Device button (`k2Face.js`).
- Words: `k2Jobs.js` is the one source of "what a control does now" for the panel cells and the window.
- Courier: `k2Channel.js`, BroadcastChannel `di-k2-controller-window-v1` (messages in the file header). Only the deck page talks to MIDI; the window never asks for MIDI access. `useDeckMidi` owns the publisher (`k2Publisher`): free while no window asked, one events batch per animation frame, no deck render per MIDI event.
- Not seen in a browser when it was built; tests are vitest only (`k2Face`, `k2Channel`, `K2Window`, `k2Publish.hook`, `k2WindowRouting`).

- K2 (1.9) button rows now run top-down like the deck screen: A-D layer 4, E-H layer 3, I-L layer 2, M-P layer 1 (`xoneK2.js`); lights, panel, window job texts and the wiki follow; console K2 keeps top row = layer 1. Pinned by `k2ButtonRows.test.js`.
- Not done: not yet seen in a real browser (desktop and phone) and not installed on a show tree.
- Review notes done: the face job text is 5.6 units (was 5.2, line height 6.0) and the readout has a fixed height (scrolls inside), so a long job text no longer moves the layout.
- Review notes done: the window now judges the deck lost after six asks' time (LOST_MS, was three), a late tick (slowed timer of a hidden page) asks again but does not judge, and a window brought to the front asks at once. Tests in `k2Channel.test.js` ("a hidden but alive deck is not called silent"). Not changed: the deck side stops publishing 8 s after the window's last ask (SILENT_MS); a window hidden for minutes may need its Device press again.
- This branch sits on top of the panel-resize work (feat/deck-comfort) and lands after it.
