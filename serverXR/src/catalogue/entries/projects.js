// Catalogue entries: projects. Shape and rules: ../index.js.

module.exports = [
  { route: "DELETE /api/projects/:projectId", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/projects/:projectId", summary: null, reach: "read", role: null, agent: false },
  { route: "PATCH /api/projects/:projectId", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/projects/:projectId/assets", summary: null, reach: "private", role: null, agent: false },
  { route: "DELETE /api/projects/:projectId/assets/:assetId", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/projects/:projectId/assets/:assetId", summary: null, reach: "read", role: null, agent: false },
  { route: "PUT /api/projects/:projectId/assets/:assetId", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/projects/:projectId/assets/:assetId/meta", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /api/projects/:projectId/document", summary: null, reach: "read", role: null, agent: false },
  { route: "PUT /api/projects/:projectId/document", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/projects/:projectId/events", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /api/projects/:projectId/ops", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/projects/:projectId/ops", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/projects/:projectId/restore", summary: null, reach: "private", role: null, agent: false },
  { route: "PATCH /api/projects/:projectId/shelf", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/resolve/:spaceSegment/:projectSegment", summary: null, reach: "read", role: null, agent: false },
]
