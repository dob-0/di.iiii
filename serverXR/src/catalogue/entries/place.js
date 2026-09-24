// Catalogue entries: place. Shape and rules: ../index.js.

module.exports = [
  { route: "GET /api/spaces/:spaceId/machines", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/spaces/:spaceId/machines/hello", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/spaces/:spaceId/machines/sync", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/spaces/:spaceId/place/build", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/spaces/:spaceId/place/build", summary: null, reach: "private", role: null, agent: false },
]
