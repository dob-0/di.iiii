## 2026-10-28 — feat/di-share-2026-10-28: di share and the Share button (PR 3 of the network-name plan)

- The share door: `POST/GET/DELETE /api/share` (owner only) opens a runtime https listener on the default-route address with `~/.di/name` cert, 421 for foreign Hosts, every request marked `diShareDoor` (no owner grant) and auth forced on while open.
- It moves the broker record by a signed PUT (`scripts/di/brokerClient.mjs`), announces a UDP beacon `{ di, label, port }` on 47474, and re-binds when the wifi address changes (10 s watch).
- `di share [--stop|--status]` and the Share panel on the local home (replaces the Phones & headsets door); `di up` now always writes the guest secrets so the door can force guests with no restart.
- Tests: shareDoor, shareRoutes, brokerClient, shareCmd, SharePanel. Not done: a real phone, a real certificate, the router limit (§11); installs started before this need di down, di up once.
