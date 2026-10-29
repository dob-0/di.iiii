## Play / Stop in Studio and Make (ledger N1462 / N1469, slice B)
- Play ▸ on the Studio's top bar and on Make walks the project as a visitor would, over the editor, on a COPY of the document (project/play/playCopy.js).
- The walk is the view page's own (PublicProjectSceneSurface, navMode walk): LiveProjectScene plus slice G's graph layer. No second runtime.
- The PLAYING bar (red, the one alarm colour) says "Nothing you do while playing is saved"; Stop ■ unmounts the layer. The editor is never unmounted: same camera.
- Start point = `worldState.spawn` (LiveProjectScene "Data-driven arrival"); none = the walker's default. A way to SET it in the editor is owed.
- Tests: PlayLayer.journey.test.jsx (edit → Play → walk → Stop: camera equal, document fingerprint equal).
- Not tested: a phone (owed); Make's Stop in Armenian (words unchecked by a speaker).
