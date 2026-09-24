## 2026-09-24 — a di.iiii the others cannot see now says so, and the others say it is there

- Real case: aylmo (`di up --lan`) and win (`--lan`) paired on 192.168.88.x; `ponyo` at .125:4000
  did not. Probed read-only: ponyo is not a `di up` start (`/api/config` `local: false`,
  `listen.lan: true`, health `mode` from an unset NODE_ENV) — bound to every interface with
  `DI_ALLOW_LAN_DEVICES` unset, so no discovery and a 403 on every `/api/rig/*`, silently.
- `serverXR/src/rig/visibility.js` works out visible/private once; `GET /api/rig/visibility`;
  `di status` prints a `rig:` line with the command; one boot warning; the Desk shows a hint row.
- Private discovery mode for a network-bound copy with device routes closed: listens, and sends
  a `t:"private"` beacon with no top-level `id` (0.4.x readers drop it — verified live against
  aylmo and win on 0.4.16-connect.4: no phantom member). Open copies list it as "a di.iiii at
  <addr> is on this network but private". A loopback `di up` still puts nothing on the network.
  PROTOCOL-1.md amendment 2026-09-24.
- Discovery now reads `t`: unknown kinds are counted and ignored instead of treated as `here`.
- Seen: two dev copies on :4391 (private) and :4395 (open, room `agent-test` so it could not pair
  with the live rig), the Desk at 1440×900 DPR 2 and 390×844 DPR 3, all three row states.
- Owed, owner's call: should a loopback copy LISTEN (never send)? ponyo's box needs
  `di up --lan` (or `DI_ALLOW_LAN_DEVICES=1`) by hand — nothing here changes it remotely.
- Two identity files per machine, documented not merged: `DATA_ROOT/machine.json`
  (machines hub, follow, `output.show`) and `DATA_ROOT/rig/machine.json` (PROTOCOL-1 §1).
