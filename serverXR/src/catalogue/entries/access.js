// Catalogue entries: access. Shape and rules: ../index.js.

module.exports = [
  { route: "GET /api/spaces/:spaceId/invites", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/spaces/:spaceId/invites", summary: null, reach: "private", role: null, agent: false },
  { route: "DELETE /api/spaces/:spaceId/invites/:id", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/spaces/:spaceId/sync-keys", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/spaces/:spaceId/sync-keys", summary: null, reach: "private", role: null, agent: false },
  { route: "DELETE /api/spaces/:spaceId/sync-keys/:id", summary: null, reach: "private", role: null, agent: false },
]
