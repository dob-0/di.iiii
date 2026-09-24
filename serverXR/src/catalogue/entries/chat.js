// Catalogue entries: chat. Shape and rules: ../index.js.

module.exports = [
  { route: "GET /api/chat/rooms", summary: null, reach: "read", role: null, agent: false },
  { route: "DELETE /api/dm/devices", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/dm/devices", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/dm/devices", summary: null, reach: "private", role: null, agent: false },
  { route: "DELETE /api/dm/devices/:deviceId", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/dm/devices/:userId", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /api/dm/people", summary: null, reach: "read", role: null, agent: false },
]
