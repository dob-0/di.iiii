# feat/claude-chat-node — session notes

## 2026-08-08 — Claude chat as a Raw node: the key store gets its consumer

- The vision this serves, in the owner's words: "syuzi or emili … run the one line
  install and connect their claude to work." One-liner install (di CLI) → connect key
  (account menu, PR #105) → place an `agent` node in Raw → chat with Claude in the
  workspace. This branch builds the last two links.
- Backend: `ai_chats`/`ai_messages` tables + `aiChatStore` (user-scoped, rowid-ordered,
  usage recorded per assistant turn — `usageSince()` is the metering ground truth);
  `anthropicClient` streams the Messages API over `node:https` (no SDK, no global
  fetch — httpClient.js's documented constraint); `aiChatRoutes` serves
  `/api/ai/chats*` with SSE replies (`accepted`/`delta`/`done`/`error`), guest
  rejection, model allowlist + 4096 max_tokens ceiling, per-subject rate limit
  (20/5min), 2 concurrent streams per user. 401 from Anthropic surfaces as
  "reconnect your key", not a bare 500. The browser never talks to Anthropic.
- Frontend: `agent` node type (panel-2d, category view, `defaultValues.chatId`);
  `AgentChatPanelWindow` rides the raw-chat-* classes verbatim (zero new CSS,
  scroll pinned during streaming); transcript stays server-side — only `chatId`
  is persisted on the node (the op-log is not a chat log). `aiChatApi.js` parses
  the SSE-over-POST stream.
- Verified by looking (desktop, real browser, live stack): palette placement,
  window chrome, empty state, the no-key path, AND the live network path — an
  invalid key connected through the real integrations API, a message sent from
  the real browser, the request reaching **real api.anthropic.com**, its 401
  coming back through the SSE error event as "Your Claude API key was rejected —
  reconnect it from your account menu." The node + its chat also survived a full
  page reload (chatId persistence works). The 200-stream wire shape is pinned by
  `anthropicClient.test.js` (local https fixture replaying a real-format event
  stream, split mid-event). **The only untested inch: a valid key's 200** — no
  sk-ant key exists on this machine (owner runs Claude Code on OAuth); one human
  message with a real key remains before promote.
- Phase 2 contract on record: `trigger` (signal) in, `result` (string) out, so an
  agent's reply can drive other nodes; reuse approvalGate for anything an agent
  writes to a space.
