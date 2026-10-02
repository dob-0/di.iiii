## 2026-10-02 — Pure ports: Text and List get an OUT; a Scene takes Objects in and gives its Picture out

- The owner, after the Nodes audit (`docs/raw/2026-10-02-nodes-audit.md`): "keep things pure, a Text has an OUT;
  a Scene is a scene". Then "yes, we need to fix those things" to both proposals: a Scene you can enter AND wire into,
  and a Scene that gives a picture.
- **Text** has an OUT: `text` (string), read through its input, so a wired Text passes on what it shows.
  **List** has two: `text` (its rows, one per line, group by group as the window draws them, empty rows left out) and
  `count`. Both are colocated runtimes (`src/project/nodes/view.text`, `view.list`).
- **Scene (`universe.world`)** gets an `objects` input (geometry). What is wired there stands on the stage of the
  scope's live Scene (`readSceneObjects` in `viewportWorldState.js`). Every surface that draws the scope draws it, because
  they all resolve the same live Scene. One wire per input in this graph: many objects come through Merge (`shape.merge`,
  chained). Info arrives through Title, which a Text or List OUT now feeds.
- **Scene Picture** (`picture`, texture). The live Scene's own window captures its canvas with the W3C
  `canvas.captureStream` and wraps it in a `<video>` VideoTexture (`canvasPicture.js`, `ScenePictureFeed.jsx`). That is the
  same object a webcam's Frame carries, so Image, Monitor, the picture operators and the network stream take it unchanged.
  It reads null where no window draws the Scene (the media.video honesty rule).
- Limits, plainly: the Picture exists only while the live Scene's window is open in the editor. `/out` and Studio don't
  publish it yet. One Objects wire (fan-in is a graph-model change, not done here). The window's size sets the picture's
  size.
