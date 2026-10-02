## 2026-10-02 — unsaved edits survive a dead server and say so (hosting decision H5)

Step H5 of di-atlas `decisions/2026-10-02-local-hosting.md` (finding F8). Edits made while a project's server was
gone lived only in tab memory (`pendingQueueRef`) and vanished on reload, tab close or project switch.

- `useProjectDocumentSync` now writes waiting ops (in flight + queued) per (project, tab) to IndexedDB
  (`src/project/services/pendingOpsStore.js`) before sending, removes them on acknowledgement, and replays what a
  gone tab left when the project opens or the stream reconnects, skipping op ids the server already has
  (`GET /ops?since=`; the server's opId guard in `POST /ops` is the second line). No server change.
- A server whose history is shorter than the record's (another database at a reused address) gets nothing; the
  record is kept and the activity log says so.
- Studio and Raw show `Not saved — server unreachable · N changes waiting` through the existing sync alerts;
  leaving the page while edits wait asks first; a failed first load is reloaded when the stream reconnects.
- Guard: `useProjectDocumentSync.persist.test.jsx` (9 cases, 8 fail on the old hook).
- Seen headless on a scratch serverXR (:4391, mktemp data) + vite (:5391): the banner with the count while the
  server was down, the browser's leave-page dialog on reload, the IndexedDB record holding both ops.
- Still undone: the app-level "We can't reach the server right now… Retry" page (shown when the page opens with
  the server gone) shows no count and does not retry by itself; replay after pressing Retry was not yet seen in a
  browser. Per origin only — another address is another browser store. Space chat clears a draft sent while
  disconnected; V1 space scene prefers the server copy over unsent local edits on reload.
