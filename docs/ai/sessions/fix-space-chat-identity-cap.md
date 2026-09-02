## Cap space/project chat identity fields and check the disk floor on space chat writes

- `userName`/`userId` on both `project-chat-message` and `space-chat-message` were
  unbounded — only `text` was capped (`CHAT_MESSAGE_MAX_LENGTH`, 500). socket.io's
  1MB default frame size meant a guest could ride ~1MB of identity into a persisted
  chat line, and `space-chat-message` writes 500 kept lines per space to SQLite. Added
  a shared `normalizeChatIdentity` (64-char cap) used at both socket handlers, and a
  matching cap inside `spaceChatStore.appendMessage` itself so the store is safe
  regardless of caller.
- The disk-full guard on HTTP writes (`diskGuard.js` → `createDiskWriteGuard`, wired
  in `index.js`) never saw socket traffic — a chat line skips multer and the JSON
  body parser entirely. Extracted the guard's cached statfs check into a new
  `createFreeSpaceChecker` export (same caching/warn-once behaviour, no duplicated
  numbers) and reused it from `space-chat-message`: below `config.minFreeDiskBytes`
  free, the message is dropped before it reaches `spaceChatStore.appendMessage` —
  no new client-facing event, matching how a flood-limited message is already
  silently dropped.
- `project-chat-message` isn't persisted (ephemeral, room-scoped like
  `project-cursor`), so it isn't part of the disk-fill vector — only got the
  identity cap, for the same reason its `text` is already capped: a large frame is
  still a large frame in memory/on the wire even if nothing hits SQLite.
- `normalizeChatMessageId` already capped and charset-validated the client-supplied
  `id` (64 chars, `[A-Za-z0-9_-]+`) before this change — no gap there.
- Left as-is: a `sandbox-*` space accepted by `canAccessSpace` before the space
  exists on disk. No existing socket-side "space must exist" check to reuse in one
  line; a real fix would need its own review of sandbox provisioning, out of scope
  for this pass.
- Tests: `serverXR/src/spaceChatStore.test.js` gained a truncation test (100KB
  userName/userId → stored at 64 chars). `serverXR/src/socketHandlers.test.js`
  gained a real socket.io integration test (in-process server + `socket.io-client`,
  same pattern as `meshHub.test.js`) proving a message is dropped without
  broadcasting below the configured free-disk floor, and still broadcasts/persists
  above it. `npx vitest run serverXR/src` — 455/455 passing. `npx eslint` clean on
  all touched files.
