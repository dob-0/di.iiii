## 2026-11-16 — Monitor: the page showed its data only in a production build

- Seen on studio-mac with `di-dev up monitor --api scratch`: every `GET /api/monitor` answered 200, yet the page sat on "loading…".
- Cause: StrictMode (`src/index.jsx`) mounts, unmounts and mounts again in development; `MonitorSection.jsx` set `alive` to false in the first cleanup and never back. Fix: the effect sets it on every mount.
- Guard: `MonitorSection.test.jsx` "shows its data under StrictMode" — fails without the fix, 9/9 pass with it. Known-fixes entry added.
- Looked at desk 1440 and phone 390: `4/11 MACHINES ONLINE`, `2/2 NETWORK UP`, `30 OPEN PRS · 13 DRAFT`.
- Next (owner's pick A, spec `~/work/agent-reports-2026-11-16/SPEC-di-overview.md`): the page on the dev tier behind the admin login, machines reporting to dev, a live stream, an overview of the tiers, a map and a workspace.
