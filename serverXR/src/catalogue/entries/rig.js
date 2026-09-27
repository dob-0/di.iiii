// Catalogue entries: rig. Shape and rules: ../index.js.

module.exports = [
  {
    route: "POST /api/rig/blackout",
    summary: "turn this member's outputs on or off immediately",
    reach: "private",
    role: "guest",
    agent: false,
    note: "rig protocol 1: mounted on `app`, not the session-authed router. Behind requireLocalRuntime (loopback, or LAN when DI_ALLOW_LAN_DEVICES=1) and, when a room key is configured, an X-DI-RIG-SIG signature over the exact body — never a user session. Never re-broadcast, so a blackout can't loop."
  },
  {
    route: "GET /api/rig/card",
    summary: "this member's current card: part, ports, health, active shows, blackout state",
    reach: "read",
    role: "guest",
    agent: false,
    note: "behind requireLocalRuntime (loopback, or LAN when DI_ALLOW_LAN_DEVICES=1) — not session-role gated."
  },
  {
    route: "POST /api/rig/cue",
    summary: "run a named cue on this member",
    reach: "private",
    role: "guest",
    agent: false,
    note: "accepted from anyone in jam mode (step 1); duplicate cue ids within the window are no-ops, not errors. Room-key signed when a key is configured."
  },
  {
    route: "GET /api/rig/events",
    summary: "this member's blackout/cue state over Server-Sent Events",
    reach: "read",
    role: "guest",
    agent: false,
    note: "text/event-stream, long-lived. Behind requireLocalRuntime."
  },
  {
    route: "POST /api/rig/hello",
    summary: "the rig protocol handshake: exchange identity/release/features/room with a peer and register it as a member",
    reach: "private",
    role: "guest",
    agent: false,
    note: "room-key signed when a key is configured; refuses (409) a peer that names a different room."
  },
  {
    route: "GET /api/rig/members",
    summary: "the members this rig has discovered on the network",
    reach: "read",
    role: "guest",
    agent: false,
    note: "behind requireLocalRuntime — not session-role gated."
  },
  {
    route: "POST /api/rig/picture",
    summary: "picture-sync stub — always answers not accepted, not yet implemented",
    reach: "private",
    role: "guest",
    agent: false
  },
  {
    route: "GET /api/rig/visibility",
    summary: "whether another di.iiii on this network can see this one",
    reach: "read",
    role: "guest",
    agent: false,
    note: "behind requireLocalRuntime — a 403 from this same guard, seen from another machine, IS the answer 'not visible'."
  },
]
