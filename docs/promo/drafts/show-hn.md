# Show HN draft

**Title:** Show HN: di.iiii – collaborative WebXR authoring in the browser (AGPL)

**URL:** https://di-studio.xyz

**First comment (post immediately after submitting):**

Hi HN — I've been building di.iiii, a browser-native studio for making and publishing
3D/AR/VR spaces. Open a URL, compose a scene (primitives, glTF/FBX/OBJ models, HDR
environments, keyframe animation), invite people to edit with you live, publish to a
public URL anyone can walk through — including in AR/VR via WebXR. No install anywhere
in the loop.

Things that might interest this crowd:

- Fully open source (AGPL-3.0) and self-hostable — Node 22 + Express + Socket.IO,
  SQLite via node:sqlite (zero native deps), React Three Fiber + @react-three/xr front.
- Real-time collaboration with granular, collaborator-safe undo.
- GitHub sync: push a repo → live space (a GitHub App builds the bridge).
- A REST + WebSocket API — a few people are using it as a 3D output surface for AI
  agents.
- An experimental node-first lane: the document is a recursive node graph
  (rootNode/nodes/edges), heading toward content-addressed assets and CRDT op-logs.

It's not a demo — real exhibitions run on it: br_id_ge
(https://di-studio.xyz/br_id_ge, a communal Armenian XR rite), WCC
(https://di-studio.xyz/wcc), Beyond Form (https://di-studio.xyz/beyond-form).

Fastest way to feel it: the communal Open Space on the landing page — every visitor
builds in the same live scene. Happy to answer anything about the stack or the model.

<!-- user: verify Open Space link/CTA wording matches current landing before posting.
     HN norms: plain text, no marketing tone, author must engage in comments for hours. -->
