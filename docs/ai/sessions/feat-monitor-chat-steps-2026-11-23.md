## 2026-11-20 — Monitor: each chat's steps, and work left behind (ledger N5906, N5909)
- Owner: "full monitoring of the tasks … and in chat mini monitoring for each personal one"; yes to flagging chats left behind in red.
- Chat list tool (`di-chats-now`, di-atlas-live) now adds `steps {done,total,open[≤5]}` from each chat's tasks folder; the status line (`~/.claude/statusline.sh`) shows the same as a bar + percent + time in every chat (DI_PROGRESS=off hides it).
- Server: `monitorChats.js` keeps only the counts and five open titles (shape-checked), and sets `leftBehind` = open steps, not working, quiet for 24 h; `counts.left`.
- Page: MonitorChats shows the bar, done/total, percent and open titles; left behind is red with its own filter chip.
- Tests: monitorChats.test.js (rule + malformed lists), MonitorChats.test.jsx (card, filter).
- Not done: other machines' chats show steps only after their tool is updated; no per-step drawer.

## 2026-11-23 — rebased on dev (replaces #1332)

- One wiki conflict: kept dev's updated date and added the missing comma after the ADMIN paragraph.
- Tests: monitorChats 11 passed, MonitorChats.jsx 9 passed. The owner asked for real-time tracking of the current task (N6277/N6278).
