## 2026-09-14 — HTTP Range support for asset streaming

- `serveFile`/`serveAsset` in `serverXR/src/spaceStore.js` served every asset (and
  thumbnail) with a plain `fs.createReadStream().pipe(res)` and no
  `Accept-Ranges`/`Content-Range` — a `<video>` could load an asset but never seek,
  loop cleanly, or scrub, which the VJ tool being built on top of this needs.
- `serveFile` now stats the file, always sends `Accept-Ranges: bytes`, and answers a
  single `Range` request (`bytes=start-end`, `bytes=start-`, `bytes=-N`) with a 206 +
  `Content-Range` + `Content-Length`, an out-of-bounds range with 416 +
  `Content-Range: bytes */size`, and a `HEAD` request with headers only (no body).
  `Content-Length` is now also sent on a plain 200. Stream error handling and the
  existing thumbnail/safety-header/immutable-cache behavior are unchanged.
- Multi-range requests (`bytes=0-10,20-30`) are deliberately answered with the full
  200 body rather than a `multipart/byteranges` reply — documented in a comment next
  to `parseByteRange`. A `<video>` element never sends more than one range at a time,
  so the extra response format wasn't worth building.
- `serveAsset`/`serveFile` needed the real `req` object to read the `Range` header and
  method, so it's threaded through from both GET routes in
  `serverXR/src/routes/spaceRoutes.js` (`/api/spaces/:spaceId/assets/:assetId` and
  `/api/commons/assets/:assetId`) via the existing options object
  (`{ width, req }`). `express.static` (client bundle, `/vendor`, `/fonts`, etc.) and
  `res.sendFile`/`res.download` elsewhere in the server already support Range natively
  via the `send` library underneath them — nothing else needed a change.
- New tests: `serverXR/src/spaceStore.range.test.js` (200 full, 206 for all three
  range forms, 416, HEAD, HEAD+Range, and the exported `parseByteRange` helper
  directly) and `serverXR/src/routes/spaceRoutes.assetRange.test.js` (regression
  guard that both GET routes actually forward `req` to `serveAsset`, since the Range
  logic is silently inert without it). Existing `spaceStore.thumbnail.test.js` passes
  unchanged — thumbnails still work.
- `npm run lint`, `npm run test:server-contracts`, and the full `npm run test` all
  pass (4411 passed / 1 skipped; 2 unrelated full-suite-only timeouts —
  `socketHandlers.test.js` disk-guard test and `PublicProjectViewer.test.jsx` walk-mode
  label test — both pass cleanly in isolation, confirmed not touched by this change).
