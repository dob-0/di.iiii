## 2026-11-10 — the deck says why a camera is black, and never plays the wrong camera

- Owner's hands-on test on aylmo found two camera bugs in the VJ deck. A busy "Phone" camera (`NotReadableError`) left its playing tile and PREVIEW black with no words. On a first page open the clip named "Phone" played the laptop webcam, because `resolveCamera` fell to the default camera when the label was not yet visible.
- New `src/project/tops/cameraResolve.js`: a named camera (label or id) is never the default one; hidden labels trigger one permission probe, then the list is read again; a really absent camera throws `CameraNotFound`. Only a source with no label and no id uses the default.
- `useTopNetwork.js` camera effect: opens through that rule, reports `camera.errorName` next to `camera.error` (topReports stays the single source), retries 2 s, 4 s, 8 s then every 8 s and on `devicechange`, no retry after a refusal by the person.
- `VjDeckView.jsx`: the playing camera tile and PREVIEW show the plain reason via `cameraFailureText` (new `CameraNotFound` sentence naming the camera). CSS in `vjDeck.css` (`.vj-deck-tile-fail`, `.vj-deck-monitor-fail`).
- `MapSourceView.jsx` was read: it never falls to the default for a named input; unchanged.
- Tests: `useTopNetwork.camera.test.jsx` (5), `VjDeckView.camera.test.jsx` (+2). Not verified on real cameras or the owner's browser.
