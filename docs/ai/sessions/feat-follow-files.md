## 2026-09-20 — a follow carries its projects' files, not just their ops

- `di follow` carried op logs only, so an `upsertAsset` reached the other machine as a name with
  no bytes behind it: a video placed on the calling machine was a dead frame on the stage machine.
- New `serverXR/src/follow/assets.js` (the "asset chase"): for every sha256-named file a project
  names, probe `/meta` on both machines and copy the bytes to whichever lacks them — both
  directions, one file at a time, disk-to-disk through `httpClient` (new `httpDownloadToFile` /
  `httpUploadFile`; `httpRequest` untouched), hash checked before it is offered on. Runs beside the
  op loop, never inside it; `/api/follows` and `di follows` report pending / failed / not carried.
- New `PUT /api/projects/:projectId/assets/:sha256` — stores raw bytes WITHOUT the EXIF scrubber,
  only if they hash to the id (422 otherwise), and only for a sync key, the internal token, or an
  auth-off install (an ordinary editor gets 403). Emits no op. Reasoning at the route and in
  `docs/architecture/SPEC_follow_files.md`.
- CURRENT.md's line "Follow carries NO assets yet" becomes: project files are carried (loopback
  proven only); still NOT carried — files in the space SCENE itself (no scene op carries a
  manifest) and legacy uuid-id files (`di follows` counts them).
- NOT verified: a real two-machine transfer (LAN or internet), a genuinely large file, a follow
  between an auth-on host and a `di up --guests` follower. All tests run on loopback with auth off,
  except the route's own auth test.
