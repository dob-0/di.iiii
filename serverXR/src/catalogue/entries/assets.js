// Catalogue entries: assets. Shape and rules: ../index.js.

module.exports = [
  { route: "GET /api/spaces/:spaceId/assets", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/spaces/:spaceId/assets", summary: null, reach: "private", role: null, agent: false },
  { route: "DELETE /api/spaces/:spaceId/assets/:assetId", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/spaces/:spaceId/assets/:assetId", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/spaces/:spaceId/assets/:assetId/share", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/spaces/:spaceId/assets/import-commons", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/spaces/:spaceId/assets/import-drive", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/spaces/:spaceId/assets/import-drive-account", summary: null, reach: "private", role: null, agent: false },
]
