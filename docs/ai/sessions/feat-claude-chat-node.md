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
- No dead ends (owner's call): with no key the panel IS the connect flow — paste
  the key inline (guests get sign-in buttons via the existing OAuth URLs); a
  mid-chat key loss flips back to connect mode. Seen rendering; component-tested.
- Dev-mode trap, learned the hard way: with REQUIRE_AUTH=false every browser and
  every curl is the same `auth-disabled` subject, so an agent testing the key
  flow can silently overwrite/delete the operator's real pasted key (this
  happened). Known-fixes entry owed when this lands on dev.
- **The owner has no API key — only a Claude Max login.** So the local backend
  exists: with no key stored, a loopback operator's send runs through the
  machine's own logged-in `claude` CLI (`localClaudeRunner.js` — `-p` +
  `stream-json`, no tools allowlisted, continuity via Claude Code's own
  `--resume` with the session id stored on the chat row). Same trust boundary
  as the agent board: loopback + non-production, never hosted. `GET
  /api/ai/providers` tells the panel which backend exists; a logged-in local
  CLI counts as connected, so Max/Pro users on their own machine paste nothing.
- **THE human test passed 2026-08-08, seen on screen**: "Hi — Claude here, live
  inside di.iiii and ready when you are." — a real reply through the owner's Max
  subscription, persisted with claude_session_id + model + tokens in ai_chats/
  ai_messages. Every path of the feature is now verified live end to end.
- Phase 2 contract on record: `trigger` (signal) in, `result` (string) out, so an
  agent's reply can drive other nodes; reuse approvalGate for anything an agent
  writes to a space.

## 2026-08-08 — deep audit round: 4-agent sweep, ~40 findings, 25 fixed

- Trigger: the owner hit a live "Maximum update depth exceeded" loop (webcam
  node) and asked for a full Raw audit. Four parallel read-only auditors ran:
  effects/state loops, graph runtime + memory, adversarial review of the new
  chat code, touch/UX paths.
- Fixed this round (each with mechanism recorded in known-fixes): the webcam/
  mic inline-callback loop; undo coalescing destroying same-node edits; the
  off-screen-window trap (clamp floor + resize re-clamp + reopen-via-card);
  palette placing nodes on scroll-touch; chromeless-scope dead end on phones
  (browser BACK pops scope); VR misdetection on every WebXR browser; graph
  re-fit yank on create/delete; zIndex inflation + undo pollution from focus;
  frozen 200-message context window; composer lock on dropped streams; missing
  abort wiring (tokens burned after close); 5-family max_tokens truncation
  (thinking shares the cap — 16k/64k now, stopReason surfaced); prompt-as-argv
  flag injection in the local runner (stdin now); /tmp cwd hazard (dataDir);
  event-loop-blocking availability probe (async); orphaned user turns on
  failure (deleted); double-send race; chatId 404 recovery for shared
  projects; scroll pinning yanking readers mid-stream; iOS input zoom; resize
  handle over Send; localStorage-per-render in presence; per-drag-frame
  document stringify (debounced + unload flush); same-value liveOutputs churn.
- **Deferred, by size or product judgment** (next session's backlog): the
  60fps document-global graph clock (needs a subscription model — biggest
  perf item); capture lifetime coupled to panel mount (fullscreen kills the
  webcam feeding it — needs design); selection sheet covering the chat input
  on phones (product call on focus-opens-inspector); panel `title` port dead
  vs authored frame.title; cycle cache order-dependence; inspector whole-blob
  patches; per-viewport unsynchronised clocks.
