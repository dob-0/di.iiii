## 2026-10-09 — the open-a-file route is matched on the router's parsed path

- `POST /api/spaces/bundle` (open a file) skips the space check. It was recognised by testing `req.originalUrl`,
  which also carries the query string; it is now recognised from the router's own parsed path (`:spaceId` is
  `bundle` and nothing follows it). `/api/spaces/bundle/...` (a space called "bundle") never matches.
- Contract test added in `serverXR/src/httpContracts.test.js` ("limits editor credentials to allowed spaces…").
- Measured: `test:server-contracts` all pass on this branch; the new case fails on the old code.
