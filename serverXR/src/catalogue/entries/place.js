// Catalogue entries: place. Shape and rules: ../index.js.

module.exports = [
  {
    route: "GET /api/spaces/:spaceId/machines",
    summary: "which machines/tabs are currently present in a space's realtime hub",
    reach: "read",
    role: "editor",
    agent: true,
    note: "editor-only, GET included: a mailbox is not the space, and a visitor able to read a public space must not read or drain the handshakes of the people editing it."
  },
  {
    route: "POST /api/spaces/:spaceId/machines/hello",
    summary: "announce this browser tab's presence to a space's machine hub",
    reach: "private",
    role: "editor",
    agent: false,
    note: "registers a live presence entry meant to be followed by ongoing signal traffic from the same tab — an agent calling this once would leave a phantom peer other tabs see as present."
  },
  {
    route: "POST /api/spaces/:spaceId/machines/sync",
    summary: "a following server reports its tabs/peers to the server it follows",
    reach: "private",
    role: "editor",
    agent: false,
    note: "server-to-server replication plumbing between two di.iiii installs, not an action a person takes in the app."
  },
  {
    route: "GET /api/spaces/:spaceId/place/build",
    summary: "status of a space's walk-to-room reconstruction build",
    reach: "read",
    role: "viewer",
    agent: true,
    note: "local runtime only — 404 on a hosted tier. Status is derived from disk (pid, log, whether the hall project arrived), so it survives a server restart mid-build."
  },
  {
    route: "POST /api/spaces/:spaceId/place/build",
    summary: "start turning a space's collected footage into a 3D room",
    reach: "private",
    role: "editor",
    agent: true,
    input: {
      body: {
        type: "object",
        properties: {
          scaleEdge: { type: "number", description: "measured real-world size (metres) of a known edge, to scale the reconstruction; falls back to a wall measurement already in the room, or an unscaled guess" },
          gpu: { type: "string", description: "'local' to use this machine's Meshroom if unpacked, otherwise a rented GPU (defaults automatically)" },
          dryRun: { type: "boolean", description: "validate and log without actually running the pipeline" }
        }
      }
    },
    note: "local runtime only — 404 on a hosted tier. 202 means the build was started as a detached background process (can take the better part of an hour); poll GET .../place/build for progress. 409 if nothing has been collected yet or the footage room has no usable photos/clips."
  },
]
