## 2026-10-14 — Laser ops: Arm / Disarm, Find cubes, same-machine rule (ledger N644)

Goal: Emilya's Windows laptop drives two LaserCube Ultra Mk2 from its own installed di at the 20:00 jam, with no terminal
and no hand-edited JSON.

- **Laser Out** (`src/raw/components/LaserOutPanelWindow.jsx`): a red Disarm button always at the top, one click, no
  confirm; an Arm form whose field starts empty (autocomplete off, no placeholder) and says that typing the phrase means
  you are the laser safety officer for this run. "Find cubes" → the list (model, address, serial, firmware, °C) →
  tick, name → "Use these".
- **Find** (`serverXR/src/laser/laserFind.js`, `POST /laser/api/find`): only 0x77 (read-only info), unicast to .1–.254 of
  each local IPv4 /24 (no broadcast: the Ultra Mk2s did not answer it), pure Node dgram, one search at a time and 5 s
  apart (429). EACCES/EPERM are reported as a firewall refusal with the Windows steps; a machine with only 169.254 says
  nothing hands out addresses.
- **Use these** (`serverXR/src/laser/laserConfig.js`, `POST /laser/api/config`): writes laser.json atomically, keeps
  laser.json.prev, keeps ids by serial (a cube without a serial is matched once by address), keeps zone, dacRate and
  stillBeams; then the engine is disarmed and closed and rebuilt from the file on the next request (no restart).
- **Who may** (`serverXR/src/localRuntimeGuard.js` `requireSameMachine`): arm, frame, alive, find, config need a loopback
  peer with no X-Forwarded-For / Forwarded / X-Real-IP and no TRUST_PROXY env, unless DI_ALLOW_LAN_DEVICES=1. GET
  state/frames and blackout keep the old gate. `armPhrase` removed from GET state; the arm error no longer echoes it.
- Engine change kept to two lines (PR #931 is rewriting laserEngine.js).
- Wiki: "Drive LaserCubes from your di" (`drive-lasercubes`). Catalogue: find, config, and the new gate on the others.
- Tests: `serverXR/src/laser/laserOps.test.js` (route auth, config write + reload disarms, sweep against fake cubes on
  127.0.0.2/3, firewall refusal, rate limit), `LaserOutPanelWindow.test.jsx` (arm/disarm/find).

Limits, owed:
- Not run against a real cube or on Windows. Windows firewall behaviour (stateful UDP replies) is from the platform's
  documented behaviour, not measured on PONYO.
- A cube on a different /24 than the laptop is not found.
- Through a dev proxy with xfwd (Vite, `di-dev up`) arming is refused by design; use the installed di's own address.

### Round 2 — security fixes from the review (2026-10-14, ~15:00–16:00)

- **Own page only** (`localRuntimeGuard.js` `requireOwnPage`, on every laser POST: arm, disarm, frame, alive, find,
  config, blackout): Host must be this machine's own name (localhost, 127.0.0.1, [::1], diiii.localhost,
  *.diiii.localhost, DI_LOCAL_NAME, a named HOST; the interface addresses only with DI_ALLOW_LAN_DEVICES=1) and Origin,
  or Referer, same-origin with it (scheme included); no Origin and no Referer only from a loopback peer. Named 403s:
  `foreign host`, `cross-site request`, `no origin`. Method: OWASP CSRF Prevention Cheat Sheet, "verifying origin with
  standard headers". Closes the review's CSRF (dev cors() answers any Origin) and DNS-rebinding (foreign Host) repros.
- **Proxied** = Forwarded, any X-Forwarded-*, X-Real-IP, X-Client-IP, Via, CF-Connecting-IP, True-Client-IP,
  Tailscale-User-Login.
- **Stops**: Disarm and Blackout follow ONE rule, `STOPS_FROM_REMOTE = false` in `laserRoutes.js` (local-only, as strict
  as Arm) until the owner decides (ledger N644.2); one-line change.
- **Serial**: Use these carries stillBeams only on a serial match; an address-only match keeps id and name, drops the
  still beams and names them (`droppedStillBeams`, shown in the panel). The engine also drops a cube's still beams
  while the box at its address reports another serial (`serialMismatch` in state). The panel proposes names by serial
  only.
- **Addresses**: Find cubes sweeps RFC 1918 only (10/8, 172.16/12, 192.168/16) and lists what it skipped (Tailscale/CGNAT
  100.64/10, link-local, public). laser.json and Use these refuse broadcast, network, multicast/reserved and loopback
  (127.0.0.x only with the test flag `DI_LASER_TEST_LOOPBACK=1`); a refused laser.json address is not used and
  `addressRefused` says why. Public unicast addresses are still accepted in laser.json (not in the brief).
- Not done (not in the round-2 brief): the sweep's socket error after answers is still dropped, not a warning
  (review #6); a Windows sweep test; fsync on the laser.json write.
