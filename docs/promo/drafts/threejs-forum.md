# Three.js forum draft (discourse.threejs.org — Showcase category)

**Title:** di.iiii — open-source collaborative WebXR studio (R3F + @react-three/xr), real exhibitions running on it

**Body:**

Hi all — sharing di.iiii (https://di-studio.xyz), a browser-native platform for
authoring and publishing collaborative WebXR spaces, built on three.js r166 via React
Three Fiber + drei, with @react-three/xr for the headset/AR path.

What it does: spaces hold projects; a project is a scene you edit live with others
(Socket.IO sync, per-collaborator undo), then publish to a public URL —
`/<space>/p/<id>` — viewable flat, in VR, or passthrough AR, no install.

Bits this forum might find interesting:

- **Asset pipeline**: .glb/.gltf with Draco/Meshopt/KTX2, .obj/.stl/.fbx incl. skinned
  animation, HDR/EXR environments, content-addressed shared asset commons.
- **Editor details**: gizmo snapping, keyframe timeline, material presets, 2D/3D text,
  mobile touch layout, WebGL context-loss recovery.
- **Node-first experimental lane**: the document is a recursive node graph — scenes as
  data, heading toward CRDT op-logs and content-addressed scenes.
- **Open**: AGPL-3.0, self-hostable (SQLite via node:sqlite, zero native deps), REST +
  WS API, GitHub-repo→live-space sync.

It's in real use for exhibitions: br_id_ge (https://di-studio.xyz/br_id_ge), WCC
(https://di-studio.xyz/wcc), Beyond Form (https://di-studio.xyz/beyond-form).

Try the communal Open Space on the landing page — everyone builds in the same live
scene. Feedback on the XR interaction model very welcome.

<!-- norms: Showcase posts should include media — attach the demo video/GIF + 2-3 screenshots -->
