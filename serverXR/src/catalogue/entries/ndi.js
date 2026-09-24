// Catalogue entries: ndi. Shape and rules: ../index.js.

module.exports = [
  { route: "GET /ndi/api/outputs", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /ndi/api/scan", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /ndi/api/scan/events", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /ndi/api/sources", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /ndi/api/stats", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /ndi/api/still", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /ndi/api/summary", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /ndi/in.mjpg", summary: null, reach: "read", role: null, agent: false },
  { route: "DELETE /ndi/out.jpg", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /ndi/out.jpg", summary: null, reach: "private", role: null, agent: false },
]
