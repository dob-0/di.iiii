## 2026-09-02 — a null frame no longer takes the server down

A whole-platform audit found the one thing that was dangerous: `JSON.parse('null')`
succeeds, and both the unauthenticated mesh relay (`meshHub.js handleMessage`) and
seven Socket.IO space handlers (`join-space`, `scene-update`, `object-changed`,
`object-added`, `object-deleted`, `user-cursor`, `selection-changed`) then read a
field off the result. `ws` surfaces the throw as an uncaught exception; socket.io
dispatches listeners inside `nextTick`, so it is uncaught there too. serverXR has no
`uncaughtException` handler, so one WebSocket frame from any visitor, or one emit
from any guest session, exited the process on both tiers. Docker restarted it; a
two-line loop would have been a standing outage.

- The relay now drops any frame that is not a plain object; the seven handlers
  default `data` to `{}`, which is what the other five already did.
- Two regression tests, one per file, send the bad payloads and assert the server
  still answers. Both fail against the pre-fix code with the exact
  `Cannot destructure property 'spaceId' of 'data' as it is null` crash.
- Not done, on purpose: a process-level `uncaughtException` logger. Node's default
  already exits with a stack; adding a handler that swallows would hide the next
  one of these.
