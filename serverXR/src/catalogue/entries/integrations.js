// Catalogue entries: integrations. Shape and rules: ../index.js.

module.exports = [
  { route: "GET /api/github/app", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /api/github/repos", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/github/webhook", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/integrations/ai/connect", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/integrations/ai/disconnect", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/integrations/ai/status", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /api/integrations/google-drive/callback", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /api/integrations/google-drive/connect", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/integrations/google-drive/disconnect", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/integrations/google-drive/files", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /api/integrations/google-drive/picker-token", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /api/integrations/google-drive/status", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/sync/spaces/:spaceId/pull", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/sync/spaces/:spaceId/push", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/sync/spaces/:spaceId/status", summary: null, reach: "read", role: null, agent: false },
]
