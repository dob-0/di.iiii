// Catalogue entries: accounts. Shape and rules: ../index.js.

module.exports = [
  { route: "POST /api/auth/password/forgot", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/auth/password/login", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/auth/password/magic", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/auth/password/magic", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/auth/password/register", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/auth/password/reset", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/auth/password/reset", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/auth/password/verify", summary: null, reach: "read", role: null, agent: false },
  { route: "GET /api/auth/providers", summary: null, reach: "read", role: null, agent: false },
  { route: "DELETE /api/auth/session", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/auth/session", summary: null, reach: "read", role: null, agent: false },
  { route: "POST /api/auth/session", summary: null, reach: "private", role: null, agent: false },
  { route: "POST /api/invites/redeem", summary: null, reach: "private", role: null, agent: false },
  { route: "GET /api/users", summary: null, reach: "read", role: null, agent: false },
  { route: "PATCH /api/users/:userId", summary: null, reach: "private", role: null, agent: false },
]
