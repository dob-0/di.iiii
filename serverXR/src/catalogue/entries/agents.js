// Catalogue entries: agents. Shape and rules: ../index.js.

module.exports = [
  {
    route: "GET /api/agent-board",
    summary: "the operator's board of local Claude Code sessions (Ops Graph → Agents)",
    reach: "read",
    role: "guest",
    agent: false,
    note: "reads ~/.claude, whose transcripts can contain secrets — loopback + non-production (or DI_LOCAL=1) only, 404 otherwise. Not session-role gated."
  },
  {
    route: "GET /api/agent-board/session/:sessionId",
    summary: "one local Claude Code session's detail from the agent board",
    reach: "read",
    role: "guest",
    agent: false,
    note: "same loopback/local-operator-only guard and secret-exposure risk as GET /api/agent-board."
  },
  {
    route: "GET /api/agent-runs",
    summary: "local `claude -p` runs launched from this machine and their status",
    reach: "read",
    role: "guest",
    agent: false,
    note: "loopback + non-production (or DI_LOCAL=1) only. Not session-role gated."
  },
  {
    route: "POST /api/agent-runs",
    summary: "spawn a local `claude -p` process with a prompt and working directory, and start capturing its output",
    reach: "private",
    role: "guest",
    agent: false,
    note: "spawns a real child process, confined to the di.iiii checkout/worktrees; loopback + non-production (or DI_LOCAL=1) only."
  },
  {
    route: "GET /api/agent-runs/:id",
    summary: "one local agent run's status and output tail",
    reach: "read",
    role: "guest",
    agent: false,
    note: "loopback + non-production (or DI_LOCAL=1) only."
  },
  {
    route: "POST /api/agent-runs/:id/stop",
    summary: "stop a running local agent process",
    reach: "private",
    role: "guest",
    agent: false,
    note: "loopback + non-production (or DI_LOCAL=1) only."
  },
  {
    route: "GET /api/ai/chats",
    summary: "list the caller's own saved AI chat threads",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "requires a real signed-in account (not a guest session)."
  },
  {
    route: "POST /api/ai/chats",
    summary: "start a new AI chat thread",
    reach: "private",
    role: "editor",
    agent: false,
    note: "requires a real signed-in account (not a guest session)."
  },
  {
    route: "DELETE /api/ai/chats/:chatId",
    summary: "delete one of the caller's chat threads",
    reach: "private",
    role: "editor",
    agent: false,
    note: "requires a real signed-in account (not a guest session)."
  },
  {
    route: "GET /api/ai/chats/:chatId",
    summary: "a chat thread and its messages",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "requires a real signed-in account (not a guest session)."
  },
  {
    route: "PATCH /api/ai/chats/:chatId",
    summary: "rename a chat thread",
    reach: "private",
    role: "editor",
    agent: false,
    note: "requires a real signed-in account (not a guest session)."
  },
  {
    route: "POST /api/ai/chats/:chatId/messages",
    summary: "send a message in a chat thread and stream the reply back over SSE (Claude, or a local model as fallback)",
    reach: "private",
    role: "editor",
    agent: false,
    note: "text/event-stream response, and requires a real signed-in account with an AI connection (or a local machine that can answer instead)."
  },
  {
    route: "GET /api/ai/providers",
    summary: "whether the caller has a Claude API key connected, and whether a local Claude/local model is available on this machine",
    reach: "read",
    role: "viewer",
    agent: false,
    note: "requires a real signed-in account (not a guest session)."
  },
]
