// Catalogue entries: agents. Shape and rules: ../index.js.

module.exports = [
  { route: "GET /api/agent-board", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /api/agent-board/session/:sessionId", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /api/agent-runs", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/agent-runs", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/agent-runs/:id", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/agent-runs/:id/stop", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/ai/chats", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/ai/chats", summary: null, reach: "private", role: null, agent: false },
  { route: "DELETE /api/ai/chats/:chatId", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/ai/chats/:chatId", summary: null, reach: "read", role: null, agent: false },
  { route: "PATCH /api/ai/chats/:chatId", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/ai/chats/:chatId/messages", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/ai/providers", summary: null, reach: "read", role: null, agent: false },
]
