// Catalogue entries: osc (serverXR/src/osc — the OSC In and OSC Out nodes' UDP). Shape and rules: ../index.js.
//
// None of these is open to the agent door: opening a port and sending UDP to another machine of
// a show are what a person's graph does, from the editor.

const LOCAL = "behind requireLocalRuntime (loopback, or LAN when DI_ALLOW_LAN_DEVICES=1); 404 on a hosted tier, which is how a node learns there is no local bridge. The bridge is built on the first request."
const OWN_PAGE = "Every OSC POST first passes requireOwnPage: Host is one of this machine's own names and Origin, or Referer, is that same origin. Named 403 otherwise."

module.exports = [
  {
    route: "GET /osc/api/state",
    summary: "the OSC bridge: which UDP ports are listening and on which address, messages received and refused, messages sent",
    reach: "read",
    role: "guest",
    agent: false,
    note: LOCAL
  },
  {
    route: "POST /osc/api/in",
    summary: "listen for OSC 1.0 on a UDP port (opened on the first ask, closed after 60 s unasked) and read every message after a number, filtered by an OSC address pattern",
    reach: "private",
    role: "guest",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          port: { type: "integer", description: "UDP port, 1024–65535" },
          pattern: { type: "string", description: "OSC address pattern (? * [a-z] [!a] {a,b}); empty = every address" },
          since: { type: "integer", description: "answer only messages numbered after this" }
        },
        required: ["port"]
      }
    },
    note: `${LOCAL} ${OWN_PAGE} Binds 127.0.0.1, or every interface when DI_ALLOW_LAN_DEVICES=1.`
  },
  {
    route: "POST /osc/api/out",
    summary: "send one OSC 1.0 message (int, float, string, blob, true/false/nil) to a host and UDP port",
    reach: "private",
    role: "guest",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          host: { type: "string", description: "IPv4 address on this machine or a private network (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16)" },
          port: { type: "integer", description: "UDP port, 1–65535" },
          address: { type: "string", description: "OSC address, starting with /" },
          args: { type: "array", description: "plain values or { type, value } pairs" },
          numbers: { type: "string", enum: ["float", "int"], description: "how plain numbers go: float32 (default) or int32" }
        },
        required: ["host", "port", "address"]
      }
    },
    note: `${LOCAL} ${OWN_PAGE}`
  }
]
