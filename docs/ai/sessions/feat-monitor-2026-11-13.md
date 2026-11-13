## 2026-11-13 — Monitor: one live admin page for machines, network, agents, services, PRs and the operator's feeds

- New admin section Monitor (Preferences, group "Spaces and people"): metric strip, machines (tailnet), network probes, agents grouped by Claude login, operator feeds (tasks, shows), services (failed first), open PRs, and an inspector; filter box, Pause, 5 s refresh, changed rows flash 2 s.
- Server: `GET /api/monitor` (`monitorStore.js`, `routes/monitorRoutes.js`), same guard as the agent board (loopback + non-production or DI_LOCAL=1, then admin; 404/403 otherwise). Each panel is collected on its own with a timeout, so one missing tool greys one block.
- Agents come from every `~/.claude*` directory that has `projects/`, deduped by session id — a second Claude account shows up by itself once it is signed in on that machine.
- Tasks and shows are operator feeds read only from `~/.di/monitor.json` (`feeds`: panel, kind command | file | url); `probes` sets the network list. Nothing in a request chooses what runs.
- Two more panels from the server's own state: People now (the realtime hub's space/project connection maps: who is in which space, by the name each browser gives) and Connected things (laser, laser desk, show machine `/show-status`, NDI, OSC, visiting apps — read over loopback; a thing that is absent shows "off", not an error).
- /admin#monitor opens straight on the page.
- Tests: 10 store, 4 gate, 8 page, 1 deep-link. Owed: machines other than the one the server runs on (their agent sessions and show machines are not read yet — needs a per-machine collector over the tailnet), and a live look on the owner's screen.
