## 2026-08-18 — Raw could not open a file. Model / Video / Sound, and a door to put them through

- Owner: "if want to add models there it still not working full — analyze TouchDesigner and
  other similars and rebuild all." The first half is a fact, checked before touching
  anything: Raw's registry had **no model node, no video node, no audio node**. A live guest
  test on staging searched the palette for *model, glb, gltf, mesh, import, file, video,
  asset, audio* and every single term returned "no match"; a real `.glb` dropped on the
  canvas did nothing at all — no node, no error, no request. Meanwhile Studio, one URL over,
  uploaded and rendered a 7.7MB photogrammetry scan for the same guest with no login.
- **The capability was already finished and simply not wired to Raw.** `ModelObject.jsx` is a
  serious loader (GLB + Draco/Meshopt/KTX2, OBJ+MTL, STL, FBX, skeletal animation, explicit
  GPU disposal); `EntityContent.jsx` renders fifteen object kinds including model/video/audio.
  Raw's node lane had its own hardcoded four-shape switch in `renderNodeBody` and never met
  any of it. `document.assets` and `buildAssetMap` were already in Raw's viewport.
- **What shipped**
  1. `geom.model`, `media.video`, `media.audio` in `nodeRegistry.js`, family `bring-in` — a
     file from your disk is a door into the graph, like the webcam, not something Raw makes.
     Each carries `keywords` so the nine words that returned "no match" now land; there is a
     test asserting exactly those words.
  2. `renderNodeBody(node, values, assetMap)` — it previously had **no access to the asset
     map at all**, so a node could not resolve a file even in principle. Threaded from
     `SceneContent` through `NodeVisual`. Node visuals are now wrapped in
     `SceneEntityErrorBoundary` like entities: a node can now load an arbitrary file, and a
     corrupt mesh must cost that node, not the scene.
  3. Drag-and-drop on the workspace (`dropAsset.js` + handlers in `RawEditor`). Server-backed
     projects upload through `uploadProjectAsset`; local workspaces store the bytes in
     IndexedDB, which is where `useAssetUrl`/`ModelObject` already look first — so both
     render identically. Unsupported files are NAMED back to the person; a silent drop is the
     failure this whole change exists to remove.
  4. Dropping **onto a room** puts the node in that room (`data-world-scope-id` +
     `resolveDropScopeId`). Without it a drop at root makes a node the World window will
     never show, because the World renders its own scope — verified: a Cube placed from the
     root World surface is invisible there too, which is existing behaviour, not a regression.
  5. A ＋ beside the inspector's asset picker, because drag-and-drop does not exist on a
     phone and the picker alone only offers files that are already here.
- **Seen, not assumed.** Headless Chromium at DPR 2 against a local dev server: dropped the
  real 7.7MB `scan.glb` and **watched it render textured in the room**; dropped a 673KB mp4
  and a 265KB wav and watched the video plane play and the sound's marker appear. Zero
  console errors throughout. On an iPhone 13 viewport the ＋ measured 46×46 and — first
  attempt — `reachable: false`: the floating scope button sits exactly on top of it at 390px.
  Moved the button to the left of the picker and re-measured to `reachable: true`, then drove
  the real file chooser and confirmed `scan.glb` stored (7,726,720 B) and the port filled.
- **What was researched and NOT built.** TouchDesigner, Houdini, Blender, Cables.gl, vvvv and
  Max all type wires by the *shape of the data*, not the artist's intent, and refuse an
  incompatible connection outright; Notch's "anything to anything" is the cautionary tale —
  its failures show as grey nodes after render. Raw's seven verb families are a good menu and
  a poor type system. `PORT_TYPES` even declares a `geometry` type that **zero ports use** —
  designed, never built. The recommended second axis (geometry / texture / material /
  transform / audio / trigger, colour-coded, refusing bad drops) is deliberately left for its
  own change: it touches every node's ports, and this one had to make files work first.
- Verified: lint 0 errors · 2234 tests · build clean.
