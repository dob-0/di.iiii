## 2026-09-24 — a copy behind a front door on its own machine reads as visible, not private

- Real case: aylmo's gateway (di-atlas `machines/aylmo-gateway`) put Caddy on :443 of the wifi,
  mesh and tailnet addresses and di on 127.0.0.1:443, with `DI_ALLOW_LAN_DEVICES=1` in di.env so
  discovery keeps running. win paired with it through the door (signed hellos, 200 in the door's
  log), yet `di status` and `/api/rig/visibility` said "private — loopback": visibility.js judged
  by the bind alone.
- `describeVisibility` takes `behindProxy`: a loopback bind is reachable only when the front door
  DECLARES itself with `DI_BEHIND_PROXY=1` (never guessed — a loopback bind with nothing in front
  of it would announce a copy nobody can reach, which the existing test still pins). New reason
  `proxied`, "through the front door on this machine". The desk and the CLI key off `visible`
  and the server's summary, so they follow with no change.
- Tests: two new cases in visibility.test.js (proxied is visible; a door with the device routes
  closed stays private). rig + rigStatus + src/rig: 275 passed; eslint clean on the changed files.
- Owed: the gateway's `switch` writes `DI_BEHIND_PROXY=1` beside `DI_ALLOW_LAN_DEVICES=1` (and
  `switch --back` removes it) — told to the gateway session. Still open, separate: the hello's
  `self.http.scheme` reads "http" on a TLS install (win takes the scheme from the discovery
  packet, so nothing breaks today).
