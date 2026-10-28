## 2026-10-28 — feat/di-share-2026-10-28: di wifi and the Wifi button (PR 3 of the network-name plan)

- The wifi door: `POST/GET/DELETE /api/wifi-door` (owner only) opens a runtime https listener on the default-route address with `~/.di/name` cert, 421 for foreign Hosts, every request marked `diWifiDoor` (no owner grant) and auth forced on while open.
- It moves the broker record by a signed PUT (`scripts/di/brokerClient.mjs`), announces through the one beacon module (`serverXR/src/follow/beacon.js`, UDP 41767, `{ v: 1, kind: 'di-name', label, port }`, shared with #1166), and re-binds when the wifi address changes (10 s watch).
- `di wifi [--stop|--status]` and the Wifi panel on the local home (replaces the Phones & headsets door); `di up` now always writes the guest secrets so the door can force guests with no restart.
- Tests: wifiDoor, wifiDoorRoutes, brokerClient, wifiCmd, WifiPanel. Not done: a real phone, a real certificate, the router limit (§11); installs started before this need di down, di up once.
