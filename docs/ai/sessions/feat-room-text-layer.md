## 2026-09-01 — a room that can be read, not only looked at

- **Every published room now carries a text layer** (`RoomTextLayer`): its name as an
  `h1`, its 3D text lines as paragraphs, and each door as a real anchor. Visually hidden
  with the clip-rect idiom, NOT `display:none` — the point is to stay in the
  accessibility tree and the DOM. A focused door link becomes visible, which is also the
  only way to leave a room without a mouse. It reads the same document the scene draws
  from, so it can never tell a different story than the room.
- **Why now:** `/` became the room itself. Before that, a crawler or screen reader met an
  HTML landing page; after it, an empty `<div id="root">` with only the head's title.
  `src/index.html` also gained a `<noscript>` floor for readers that never run the app.
- **A guard earned its keep.** Importing `portalHref` from `PortalObject.jsx` pulled
  three.js into the published page's static import graph and
  `publicViewerCodeModeGraph.test.js` failed the build. The helper now lives in its own
  leaf module, `src/project/viewport/portalHref.js`, re-exported from PortalObject so no
  caller changed.
- **The nearest door is wayfinding, not a name.** Glued to the title with a bare
  separator it read as one compound title — the home room announced itself as
  "EVERYTHING MADE HERE · WCC EXHIBITION". It has its own dimmed span now.
- Still owed, and data not code: the local tier's home project is titled `di.i:
  open_space`, a retired spelling that is now the `h1` a search engine reads. Staging
  already carries a real title. The owner picks the word.
