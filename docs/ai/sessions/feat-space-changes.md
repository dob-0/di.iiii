## 2026-09-28 — History says who changed what

`GET /api/spaces/:spaceId/changes` (owner-or-admin) grouped a space's op log by person and burst and nothing in
the app called it. History (Spaces → a space → Manage → History) now opens with "What changed · last 7 days",
newest first, then "Restore points" as before; both load together and a failing changes call leaves the points
usable. The walk on a test stack (ann edits, bob removes) showed "+2 boxs" — the server's plural; fixed with
-es for s/x/z/ch/sh. Tests red on the old code: 1 SpaceHub, 1 spaceHistory. Wiki "space-history" updated.
