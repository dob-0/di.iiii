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
  {
    route: "GET /api/spaces/:spaceId/show/:projectId",
    summary: "the show page: a project's cues (act, line, colours, laser moment), the cue Light is playing, who may choose, and what blocks this caller",
    reach: "read",
    role: "guest",
    agent: true,
    note: "read like the space (public, or viewer scope); a private project is 404. Registered ahead of the /api role gates and decides for itself (routes/showRoutes.js). Polled once a second by every open show page."
  },
  {
    route: "POST /api/spaces/:spaceId/show/:projectId/choose",
    summary: "send one scene of the project's list to Light (the desk's cue runner, in process) - it goes live and HOLDS until another is pressed - the show page's press",
    reach: "private",
    role: "guest",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          index: { type: "integer", description: "the cue's place in the list the GET returned" },
          cueId: { type: "string", description: "the cue's id, so a list that changed meanwhile is refused (409) rather than firing another cue" },
          name: { type: "string", description: "a name the person typed for themselves, shown as who chose (24 characters; an account's own label wins)" }
        },
        required: ["index"]
      }
    },
    note: "who may choose is the operator's setting (team by default; everyone; operator only). A laser moment is refused for everyone (403). One choice per 10 s for everybody (429). Light must be on this machine: 409 on a hosted tier. Not for agents: it changes the lights in a room with people in it."
  },
  {
    route: "POST /api/spaces/:spaceId/show/:projectId/control",
    summary: "the operator sets who may choose on the show page: team, everyone or operator",
    reach: "public",
    role: "editor",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: { choosers: { type: "string", enum: ["team", "everyone", "operator"] } },
        required: ["choosers"]
      }
    },
    note: "operator only (the space's owner, an admin, or the person at the machine). 'everyone' opens choosing to visitors, which is why this is reach public. Stored in <DATA_ROOT>/show/control.json."
  },
  {
    route: "POST /api/spaces/:spaceId/show/:projectId/autoplay",
    summary: "the operator's one switch on the show page: play the scenes in order (each for its hold), or let a pressed scene hold. Off by default; a press of any scene turns it off",
    reach: "public",
    role: "editor",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: { autoplay: { type: "boolean" } },
        required: ["autoplay"]
      }
    },
    note: "operator only; needs Light on this machine playing this project's list (409 otherwise). Lasers are still never fired from here."
  },
  {
    route: "POST /api/spaces/:spaceId/show/:projectId/favourites",
    summary: "the operator's ten favourite scenes: the buttons always on screen in the room. Everyone reads the same list from the show answer (control.favourites)",
    reach: "public",
    role: "editor",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: { favourites: { type: "array", items: { type: "string" }, maxItems: 10 } },
        required: ["favourites"]
      }
    },
    note: "operator only. Look ids (rig-...), at most 10, each once, each in this show, never a laser scene (400 otherwise). Stored with the show's control state in <DATA_ROOT>/show/control.json; before any is set the first ten non-laser looks."
  },
]
