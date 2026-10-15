## 2026-10-15 — "This node": the Setup section a hardware node adds (plan step D5)

Plan step D5 of "the node serves di.iiii's own light desk UI" (vizzz.di `docs/DI_DESK_UI_PLAN.md` §4).
Built on D1 (#939, `ui/caps.js`, `data-cap`), D2 (#941, `api-contract.json`) and D3 (#976, `ui/dmxfeed.js`).
Inventory it carries from: `docs/ai/vizzz-node-console-inventory.md` (D0).

### Design (written before the code)

**The rule.** When `api/state` carries `caps.node === true`, the Setup page gains one more fold under
*Input*: **This node**. On a machine (`caps` absent, or `caps.node` anything but `true`) the fold is
hidden by the existing `data-cap` + `.capoff` rule and nothing it owns is fetched.

`node` is the one cap that is **opt-in**: every other cap is on when absent (the full desk), but a
machine is not a node, so `cap(caps, 'node')` is true only on an explicit `true`. That rule lives in
`ui/caps.js` (`OPT_IN`), next to the others, and is held by `tests/test.js`.

**Where the code lives.** No new UI file: the node serves a fixed list of the desk's files (vizzz.di
`desk_ui.lock`), and a new file would need a firmware change to be served at all. The pure parts
(cap rule, reading `/status`, the two-press confirm, Wi-Fi status words) go into `ui/caps.js`; the
paint and the buttons into `ui/app.js`; the markup into `ui/index.html`; rectangles-only styles into
`ui/style.css` (0 px corners, the existing `.sq`, `.indetails`, `.inlamp`, `.muted`, `.mono`).

**Rhythm.** No second timer. The page already asks `api/input` once a second, only on Setup with the
tab visible; that same tick now also asks `GET /status` when `caps.node` is on. The fold's summary line
(name · address · source) is painted from it even when the fold is closed. `GET /peers` rides the same
tick every 5th second while the fold is open; `GET /node/manifest` is read once, when the fold first opens.
A Wi-Fi scan that answers `scanning:true` is asked again on the next tick (still no timer of its own).

**Transport.** Two helpers, `nodeGet(path)` and `nodePost(path, args, form)`, each with a literal path so
the lint can see it. `nodePost` sends `POST` with `X-Vizzz-Console: 1` (the node's console-route gate,
vizzz.di README "HTTP API"); numbers go in the query string as the README's `curl` lines do, and
`/wifi/set` and `/node/set` send a form body (`application/x-www-form-urlencoded`), as the README
documents for them. Paths are relative (`status`, not `/status`) like `api/…`, so they resolve against
wherever the page is served; on a node that is `/`.

**Two shapes of `/status`.** The firmware writes `ip`, `sta_connected`, `fw`; the simulator writes
`ap_ip`, `sta` and no `fw`. `nodeFacts()` reads either; a fact neither sends is painted
*not reported*, never a made-up number. **Uptime:** neither the firmware's `/status` nor the simulator's
sends one today, so the line reads *uptime: not reported by this node* until a key exists. The firmware
string comes from `/status.fw`, else `/node/manifest` `firmware.tag`.

**Two-press confirm.** Restart (`/reboot`), factory reset, changing the Wi-Fi mode (it reboots), forgetting the
saved network and sending Art-Net OUT to one peer only are armed by the first press (the button says what
the second press will do, in the danger colour) and fired by a second press of the *same* button within
4 s. Any other press, or 4 s, disarms. Factory reset and reboot sit last, in Maintenance, never next to
Panic. (D0 asked for a typed word on factory reset; the D5 brief says two presses; this follows the brief.)

### What the fold holds, and the route each control calls

All routes as vizzz.di `README.md` documents them. "console" = `POST` + `X-Vizzz-Console: 1`.

| Group | Control | Route | D0 # |
|---|---|---|---|
| Network | addresses shown: access point, Wi-Fi address, network name, signal, why a join failed | `GET /status` | 20 |
| Network | Wi-Fi mode: access point + Wi-Fi / Wi-Fi only / access point only (this is "AP on/off") — reboots | console `/netmode/set?m=0\|1\|2` | 3 |
| Network | Scan, then pick a network | `GET /wifi/scan` (same origin) | 18 |
| Network | Join (name + password) | console `/wifi/set`, form body `ssid`, `pass` | 17 |
| Network | Forget the saved network | console `/wifi/forget` | 19 |
| Source | web only / network only / merge (HTP) | console `/mode/set?m=0\|1\|2` | 1 |
| Source | fall back to web when the network goes quiet | console `/mode/fallback?en=0\|1` | 2 |
| Source | which sources are live: Art-Net, sACN, USB (lamps) | `GET /status` | — |
| Art-Net | port-address: net 0–127, subnet 0–15, universe 0–15 (sACN = +1 shown) | console `/artnet/set?net&subnet&uni` | 21 |
| Art-Net | Art-Net OUT to every node (broadcast) or one peer | console `/artout/peer?ip=` (empty = broadcast) | 24 |
| Safety | burn-safe on/off, ceiling and slew shown as numbers | console `/safety/set?burn=0\|1`; numbers from `GET /status` | 30 |
| Safety | Panic (one atomic call: master 0, blackout, FX and cues off, web only) | console `/panic` | 7 |
| Fleet | peers: name, address, universe, last heard | `GET /peers` | 23 |
| Fleet | Discover (send a beacon now, then read the table again) | console `/announce`, then `GET /peers` | 23 |
| Maintenance | name, access-point name, access-point password | console `/node/set`, form body `name`, `ap_ssid`, `ap_pass` | 22 |
| Maintenance | firmware, free memory, largest block, uptime | `GET /status`, `GET /node/manifest` | — |
| Maintenance | Restart (two presses) | console `/reboot` | 28 |
| Maintenance | Factory reset (two presses) | console `/factory-reset` | 29 |

Access-point name and password (#22) are beyond the brief's "node name", taken in because they are the
same route and plan risk 7 says the Wi-Fi functions (#3, 17–22) must exist before the old console goes.

**Dropped (D0's four "missing → drop"):** #16 the product-named six-fixture preset (rewrites the patch;
a stored show if ever wanted), #27 the manifest viewer buttons (the manifest is for machines; only its
firmware string is shown), #38 the dimmed colour palette toggle (a look, not a function), #43 fleet
"all full" (one press that lights every rig is the wrong default).

**Carried by D0 but not in this step** (owed, each one route away): #9 web layer on/off (reboots into a
node with no page; needs its own confirm design), #36 BPM ½ and ×2 (beside Tap, not this fold),
#42/#44/#45 fleet blackout, master and scene recall on every peer, #46 one command to one peer.
The brief's Fleet group is "peers list, discover"; these stay rows in the plan.

**Overlap, said out loud.** Source mode and fallback also exist in Setup › Input, in di's words, through
`api/input`, which the node's bridge maps onto the same setting. The fold shows the node's own words
and the live lamps of all three sources (USB has no place in Input). Both write one setting; whichever
was pressed last is what the node does, and both repaint from the node within a second.

**Words.** "This node", "Wi-Fi", "access point", "source", "peer". No product or venue name in any
string or default (the simulator's sample network names are the simulator's, not ours). Vocabulary
note: `node` in `docs/ai/vocabulary.md` means a card on the canvas. The owner and the plan named this
section "This node", and it appears only on the hardware, never next to the canvas, so the collision
cannot happen on one screen; it is still a second meaning, flagged here for the owner. `desk` (banned)
is not used in any new string.

**caps and the contract.** `caps.keys.node` documents the cap. The node's console routes are not
`api/*`: they go in a second list, `node_routes` (method, path, kind `console` | `read`, arguments).
`lint:api-contract` now also checks that every `nodeGet`/`nodePost` literal in `ui/*.js` is in
`node_routes` with its method, that every `node_routes` entry is called, and that no `node_routes`
path is under `api/`. Nothing else in the contract changes; `contract_version` stays 1.

### What was built and measured

- `ui/caps.js`: `OPT_IN` (`node`), `nodeFacts`, `nodeSummary`, `wlWords`, `confirmStep`/`stillArmed`.
  `ui/app.js`: `nodeGet`/`nodePost`/`nodeDo(path, …)`, `pullNode` on the existing 1 s Setup tick
  (`setInterval(() => { pullInput(); pullNode(); }, 1000)` replaces `setInterval(pullInput, 1000)`), the paint and the
  buttons. `ui/index.html`: the `#ndDetails` fold. `ui/style.css`: `.nodegrid`, `.nodegroup`, `.ndrow`, `.armed` (0 px corners).
- `api-contract.json`: `caps.keys.node`, `node_routes` (17: 4 reads, 13 console). `lint:api-contract` checks it both ways
  and refuses an `api/` path in it; `nodeDo` takes the path first so one literal pattern sees every call.
- `tests/test.js` +3 checks: opt-in cap rule and the markup gate (`data-cap="node"` + `.capoff`); `/status` read the same
  from firmware and simulator, absent facts stay null; the two-press rule. The opt-in check was watched failing with
  `OPT_IN = {}` before it was trusted.
- `tests/test-node-section.js` (`npm run test:desk-node`), Playwright, headless Chromium 1194:
  (1) the standalone desk with no caps: fold hidden, zero requests to any node route;
  (2) **against vizzz.di's `tools/simulate_node.py --port 8088`** (`int/2026-10-15`, cache fetched from GitHub with
  `fetch_desk_ui.py --cache`, which worked in this sandbox). The simulator serves the *locked* desk files (sha-checked), so
  the page's own files are served from this checkout at the page and everything else (api/*, status, console routes) goes
  to the simulator. 14 checks: summary from /status; 4–6 status reads per 5 s; peers, firmware, "uptime not reported";
  burn-safe, source mode, Art-Net 0:1:2 → 18 (read back from the simulator's /status); scan, a 5-char password refused
  before sending, join as a form POST; node/set; factory reset sends nothing on one press, is disarmed by another press,
  fires once on two; 4 s disarm; Discover → announce; every POST had `X-Vizzz-Console: 1`; no console errors.
  Without `NODE_URL` it runs the same 14 against an in-page stub (also green; said in its output).
- Screenshots: `docs/ai/handover/desk-this-node-desktop-1280x800.png`, `…-phone-390x844.png` (the screen as seen),
  `…-phone-390x844-fold.png` (the fold, element shot). Opened and looked at. 0 px sideways scroll at both sizes.
  For the committed pictures only, the simulator's two fake peer names (they carry the product name) are rewritten to
  `peer-1`/`peer-2` at the page; the node name was set to `node-1` through the fold itself.
- **Seen, not fixed (not this step):** on a 390×844 phone the Setup page's top bar (logo, tabs, Blackout, BPM, Save scene,
  output) takes about 670 of 844 px, so the phone screenshot shows only the bottom fifth of the fold; the element shot
  also loses the fold's first two lines under it. Pre-existing layout; parked for the UI owner.
- Lighting suites, ok lines before → after: test 133→136, test-wiring 22→22, test-http 123→123, test-rigpatch 14→14,
  test-dmxin 39→39, test-cues 16→16, test-stream 10→10, test-dmxfeed 8→8, test-tap 7→7; test-http `--class a` all passing;
  `lint:api-contract` 60 routes / 58 paths → same + 17 node routes; new test-node-section 16 (14 + 2 overflow checks).
  `npm run lint`: 0 errors (warnings all pre-existing; the touched UI files and new tests lint clean).
- **Not run:** a real ESP32 (nothing flashed; the firmware's `/status` shape was read from `src/main.cpp`, not
  fetched); a real phone; `npm run build`, `npm run test` (vitest) and `verify:surfaces` (the desk is not on the dev tier);
  the fold against the firmware's real `/wifi/scan` asynchronous answer (`scanning:true` path is code-read only).
  No Wiki entry: `src/wiki/` is outside this step's allowed paths, and the fold appears only on a node.
- Not added to `lighting.test.js` (vitest): it needs a browser and, for the real check, the simulator.
