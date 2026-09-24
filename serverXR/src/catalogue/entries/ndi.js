// Catalogue entries: ndi. Shape and rules: ../index.js.

module.exports = [
  {
    route: "GET /ndi/api/outputs",
    summary: "the NDI outputs this server is currently sending, with viewer/frame counts",
    reach: "read",
    role: "guest",
    agent: true,
    note: "no auth check at all beyond requireLocalRuntime (loopback, or LAN with DI_ALLOW_LAN_DEVICES=1) — role is 'guest' because nothing else gates it."
  },
  {
    route: "GET /ndi/api/scan",
    summary: "the current snapshot of NDI sources found on the network",
    reach: "read",
    role: "guest",
    agent: true,
    input: {
      query: {
        type: "object",
        properties: {
          wait: { type: "integer", description: "milliseconds (max 5000) to hold the request open for a fresher scan before answering" }
        }
      }
    },
    note: "no auth check at all beyond requireLocalRuntime."
  },
  {
    route: "GET /ndi/api/scan/events",
    summary: "live NDI source appear/change/gone events",
    reach: "read",
    role: "guest",
    agent: false,
    note: "text/event-stream — a long-lived stream, not a single request/response. No auth check at all beyond requireLocalRuntime."
  },
  {
    route: "GET /ndi/api/sources",
    summary: "NDI sources visible to this server right now",
    reach: "read",
    role: "guest",
    agent: true,
    note: "no auth check at all beyond requireLocalRuntime."
  },
  {
    route: "GET /ndi/api/stats",
    summary: "receiver/subscriber counts and timings for the NDI in/out lanes",
    reach: "read",
    role: "guest",
    agent: true,
    note: "no auth check at all beyond requireLocalRuntime."
  },
  {
    route: "GET /ndi/api/still",
    summary: "one JPEG still frame from a named NDI source",
    reach: "read",
    role: "guest",
    agent: false,
    note: "returns raw JPEG bytes, not JSON. No auth check at all beyond requireLocalRuntime."
  },
  {
    route: "GET /ndi/api/summary",
    summary: "whether the NDI runtime is available on this machine, and why not if it isn't",
    reach: "read",
    role: "guest",
    agent: true,
    note: "no auth check at all beyond requireLocalRuntime."
  },
  {
    route: "GET /ndi/in.mjpg",
    summary: "a named NDI source as a live MJPEG stream, for an <img> tag",
    reach: "read",
    role: "guest",
    agent: false,
    note: "multipart/x-mixed-replace binary stream, not a single JSON response. No auth check at all beyond requireLocalRuntime."
  },
  {
    route: "DELETE /ndi/out.jpg",
    summary: "stop sending frames under a given NDI output name",
    reach: "private",
    role: "guest",
    agent: true,
    input: {
      query: {
        type: "object",
        properties: {
          name: { type: "string", description: "the output name to stop; case as originally posted" }
        },
        required: ["name"]
      }
    },
    note: "no auth check at all beyond requireLocalRuntime — anything that can reach this port (loopback, or the LAN with DI_ALLOW_LAN_DEVICES=1) can stop any named output."
  },
  {
    route: "POST /ndi/out.jpg",
    summary: "push one JPEG frame to be broadcast as a named NDI output",
    reach: "private",
    role: "guest",
    agent: false,
    note: "the body is a raw JPEG (image/jpeg or application/octet-stream), not JSON, so it is not callable through the agent door as an ordinary op. No auth check at all beyond requireLocalRuntime — anything that can reach this port can create or overwrite any named NDI output."
  },
]
