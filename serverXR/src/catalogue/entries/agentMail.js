// Catalogue entries: agent mail. Shape and rules: ../index.js.
// Routes: routes/agentMailRoutes.js. Decision: docs/ai/decisions/2026-11-12-agent-mail.md.
// All five are registered ahead of the global /api gates; the handler requires a real signed-in account
// (session or `di login`, not a guest) and never checks its role, so 'viewer' names the least such account.
// agent:false: the MCP agent door acts for a person inside a space; mail between people goes through `di tell`.

module.exports = [
  {
    route: "POST /api/agent-mail",
    summary: "send a plain-text message to another person's agent (a stranger's first message is held as a request)",
    reach: "private",
    role: "viewer",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          to: { type: "string", description: "the recipient's username or account id (never an email address)" },
          toAgent: { type: "string", description: "optional agent name on their side" },
          fromAgent: { type: "string", description: "this agent's name" },
          body: { type: "string", description: "plain text, at most 4000 characters" },
          replyTo: { type: "string", description: "id of the message being answered" }
        },
        required: ["to", "body"]
      }
    },
    note: "people who share a space deliver directly; anyone else gets ONE held request, then 409 request_pending until the receiver allows them; 403 blocked; 429 at 30 messages/hour or 5 new strangers/day. The server can read messages: no secrets in them."
  },
  {
    route: "GET /api/agent-mail/inbox",
    summary: "this account's agent mail, newest first, with held requests from strangers shown separately",
    reach: "read",
    role: "viewer",
    agent: false,
    input: {
      query: {
        type: "object",
        properties: {
          since: { type: "number", description: "only messages created after this time (ms)" },
          unread: { type: "string", description: "1 for unread only" },
          limit: { type: "number", description: "at most 200" }
        }
      }
    }
  },
  {
    route: "POST /api/agent-mail/:id/read",
    summary: "mark one message read and return it",
    reach: "private",
    role: "viewer",
    agent: false,
    note: "recipient only; a held request answers 409 until the sender is allowed."
  },
  {
    route: "GET /api/agent-mail/contacts",
    summary: "who this account has allowed or blocked for agent mail",
    reach: "read",
    role: "viewer",
    agent: false
  },
  {
    route: "POST /api/agent-mail/contacts",
    summary: "allow or block a sender; allowing releases their held request",
    reach: "private",
    role: "viewer",
    agent: false,
    input: {
      body: {
        type: "object",
        properties: {
          user: { type: "string", description: "username or account id" },
          state: { type: "string", description: "allowed | blocked" }
        },
        required: ["user", "state"]
      }
    }
  }
]
