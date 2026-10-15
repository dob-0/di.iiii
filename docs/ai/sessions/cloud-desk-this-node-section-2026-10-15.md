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

**Two-press confirm.** Reboot, factory reset, changing the Wi-Fi mode (it reboots), forgetting the
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
| Maintenance | Reboot (two presses) | console `/reboot` | 28 |
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
