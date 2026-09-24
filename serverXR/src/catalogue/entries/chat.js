// Catalogue entries: chat. Shape and rules: ../index.js.

module.exports = [
  {
    route: "GET /api/chat/rooms",
    summary: "the chat rooms this identity can open, each with its last message",
    reach: "read",
    role: "guest",
    agent: true,
    note: "registered ahead of the global /api gates — the handler only requires SOME authenticated identity (401 otherwise), not a specific role, so 'guest' names the floor. An admin also sees a second staff-room row per space."
  },
  {
    route: "DELETE /api/dm/devices",
    summary: "forget every private-messaging device key this account has published",
    reach: "private",
    role: "viewer",
    agent: false,
    note: "not behind the global gates; the handler requires a real signed-in account (session, non-guest) and never checks its role — 'viewer' names the least such account. Removes this account's E2E device identities, which is key-material management, not an ordinary content op."
  },
  {
    route: "GET /api/dm/devices",
    summary: "this account's own published private-messaging device keys",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "not behind the global gates; requires a real signed-in account (session, non-guest)."
  },
  {
    route: "POST /api/dm/devices",
    summary: "publish this browser's public key so others can start a private conversation with it",
    reach: "private",
    role: "viewer",
    agent: false,
    note: "not behind the global gates; requires a real signed-in account. Mints an E2E messaging device identity — an agent has no private key of its own to back this, so calling it on the person's behalf would register a phantom device."
  },
  {
    route: "DELETE /api/dm/devices/:deviceId",
    summary: "revoke one of this account's private-messaging device keys",
    reach: "private",
    role: "viewer",
    agent: false,
    note: "not behind the global gates; requires a real signed-in account. Key-material management, not an ordinary content op."
  },
  {
    route: "GET /api/dm/devices/:userId",
    summary: "someone else's private-messaging device keys, if you already share a space with them",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "not behind the global gates; requires a real signed-in account. Answers identically (404) for 'no such person' and 'exists but you share no space' — existence is not revealed either way."
  },
  {
    route: "GET /api/dm/people",
    summary: "accounts you share a space with, and so could start a private conversation with",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "not behind the global gates; requires a real signed-in account. Not an address book — only people who already share a room with you appear."
  },
]
