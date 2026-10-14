# The node's own console, against di's desk — inventory

Written 2026-10-15. **Inventory only: nothing here is built.** It is step D0 of the plan in the
vizzz.di repo (`docs/DI_DESK_UI_PLAN.md`, branch `plan/di-desk-ui`): the node will serve di's own
desk UI (`serverXR/src/lighting/ui`) as its console, so every function the node's old console has
is either already in di's desk, partly there, or missing — and each gets a recommendation: carry
it into di's desk, or drop it. The owner's words: *"look to what we don't have in the other one,
but look to not mess."* So the rule used below is: **carry only what a phone on the node's own
network cannot do any other way; drop presets, raw dumps and anything di already says better.**

Source read: vizzz.di `src/main.cpp` on `int/2026-10-15` — the embedded `APP_HTML` (five routes:
Control, Patch, WiFi, System, VJ) and the firmware routes behind it. Two functions have a route in
firmware and **no button** in that console today (burn-safe, factory reset); they are listed because
the owner named burn-safe and a console that replaces this one has to decide about both.

## Headline

**46 functions: 13 exist in di's desk, 13 partly, 20 missing.**
Of the 20 missing, **16 are carried** (almost all into one new section, *This node*, shown only when the
desk's `caps.node` is on, so the desk on a machine never sees it) and **4 are dropped**.
Of the 13 partial, 4 carry their gap and 9 are dropped as already covered.

Words follow `docs/ai/vocabulary.md`; a product name never goes into a default (the Thunder preset
is the example below).

## The list

Status: **exists** · **partial** · **missing**. Where = where in di's desk the carried function goes.

### Control page

| # | Node console function | In di's desk | Recommendation | Why |
|---|---|---|---|---|
| 1 | Output source: web only / Art-Net only / merge (HTP) | exists — Setup › Input | none | Same three sources. |
| 2 | Art-Net falls back to web when the wire goes quiet | exists — Setup › Input | none | The desk has the fallback; the node maps onto it. |
| 3 | Wi-Fi mode: AP + STA / STA only / AP only | missing | **carry** — This node › Network | A phone cannot change how it reaches the node without it. |
| 4 | Master dimmer | exists — header master | none | |
| 5 | Blackout | exists — header Blackout | none | |
| 6 | Full (every channel to 255) | partial — master to 100 % and select all | **drop** | One press that lights everything is the wrong default on a rig; master plus selection says it. |
| 7 | Panic (one atomic blackout + reset) | exists — header panic | none | The node's panic is atomic on purpose (race between master and blackout); the bridge must map the desk's panic onto it, not onto two calls. |
| 8 | Art-Net OUT on / off | exists — Setup › Output wire switch | none | |
| 9 | Web layer on / off (reboots the node) | missing | **carry** — This node › Advanced, behind a confirm that says it reboots and this page goes away | Without it a node cannot be made Art-Net-only from a phone. Never on the first screen. |
| 10 | Live snapshot (raw JSON of /status) | partial — status strip and pills | **drop** | A debug dump; the pills and the strip are the readable version. |

### Patch page

| # | Node console function | In di's desk | Recommendation | Why |
|---|---|---|---|---|
| 11 | Stage with fixture positions (x, y) | exists — Setup stage view | none | |
| 12 | Fixture editor: name, count, start / end channel, enabled | partial — di patches by profile + address + count | **carry the gap** — profile per node fixture (plan V3) | Node fixtures are bare channel ranges; di's patch needs a profile. Not a new panel. |
| 13 | Prev / next / selected fixture | exists — selection | none | |
| 14 | Channel patch, 16 pages × 32, web value against output value | exists — Fader page and the dmx view | none | |
| 15 | Radar preset (radar FX + merge mode) | partial — radar is an FX pad | **drop** | A two-click combination; the pad and the source select are already there. |
| 16 | THUNDER 6 preset (re-patches six fixtures, sets 124 bpm, radar, dim colour) | missing | **drop** | A product-named one-off that rewrites the patch. If it is wanted, it is a stored show on the node, not a button. |

### WiFi page

| # | Node console function | In di's desk | Recommendation | Why |
|---|---|---|---|---|
| 17 | Join a network (SSID, password) | missing | **carry** — This node › Network | |
| 18 | Scan for networks | missing | **carry** — This node › Network | |
| 19 | Forget the saved network | missing | **carry** — This node › Network | |
| 20 | Wi-Fi status (AP address, STA state, auth failure) | missing | **carry** — This node › Network, read-only | Says why a join failed, which the phone otherwise cannot know. |
| 21 | Art-Net net / subnet / universe (15-bit address) | missing — di fixtures carry a universe, the node has a port-address | **carry** — This node › Network | It is node configuration, not a desk universe (plan risk 4). |
| 22 | Node identity: name, AP SSID, AP password | missing | **carry** — This node › Identity | |
| 23 | Peers: list, announce | partial — Setup › nodes scans Art-Net nodes, not these peers | **carry the gap** — This node › Peers | Different protocol; di's scan cannot find them. |
| 24 | Route Art-Net OUT to one peer (unicast) | partial — Output has a target | **carry the gap** — This node › Peers, with the confirm the console has today | Overrides broadcast; say so before the press. |

### System page

| # | Node console function | In di's desk | Recommendation | Why |
|---|---|---|---|---|
| 25 | Output monitor, first 64 channels | exists — dmx view | none | |
| 26 | Diagnostics text and Refresh status | partial — pills | **drop** | Raw dump again. |
| 27 | Node manifest viewer (load, open JSON) | missing | **drop** the buttons | The manifest is a machine-readable route (the caps come from it); a person has no use for it on a phone. |
| 28 | Reboot | missing | **carry** — This node › Advanced, behind a confirm | |
| 29 | Factory reset (route only, no button today) | missing | **carry** — This node › Advanced, behind a typed confirm | A console that replaces this one must own it; it can never sit next to a blackout button. |
| 30 | Burn-safe (reduced ceiling and slower slew; route only, no button today) | missing | **carry** — This node › Output | The owner named it. A switch with its two numbers shown (ceiling 96, slew 8), not hidden behind a word. |

### VJ page

| # | Node console function | In di's desk | Recommendation | Why |
|---|---|---|---|---|
| 31 | Readouts: master, output mode, current FX | partial — header and FX pads show each | **drop** | Duplicates. |
| 32 | Easy scenes: eight big slots, save and play | exists — scene pads (Control, Touch) | none | |
| 33 | Next scene, Save + Next, the three-step coach text | partial | **drop** | di's scene list does this with more room; the coach is a first-run crutch. |
| 34 | Scene change speed: Instant / Soft / Slow | partial — per-scene fade | **drop** | The per-scene fade says the same with a number. |
| 35 | FX pads: ten modes | exists — FX pads | none | The node lists its own modes in state (plan §3). |
| 36 | BPM ½ and ×2 | missing | **carry** — beside Tap in the FX rail | Two small buttons; the BPM field and Tap already exist. |
| 37 | BPM, depth, Apply, Tap, Kill FX | exists — FX rail | none | |
| 38 | Underground colours (a dimmed palette variant; a toggle) | missing | **drop** | A look, not a function: di's colour picker and looks already hold it. |
| 39 | Colour engine: eight swatches, RGB sliders, one global colour on / off | partial — colour picker acts on the selection | **drop** | A global colour override that outranks scenes is how a rig gets stuck in cyan; selection plus the picker is the honest version. |
| 40 | Cue runner: up to 16 steps of scene + dwell + fade; run, stop, next, build | partial — di's chase | **carry the gap** — map onto Control › chase (plan V4) | Same idea; the bridge maps it, no new panel. |
| 41 | Group mixer: eight groups, fader each, all off | partial — groups select fixtures, no group fader | **drop** | Select the group, use the master or the faders; a group fader would be a second master. |
| 42 | Fleet: ALL blackout | missing | **carry** — This node › Fleet | Hardware nodes in one room blackout together; it is the point of the fleet. |
| 43 | Fleet: ALL full | missing | **drop** | Same reasoning as #6. |
| 44 | Fleet: ALL master | missing | **carry** — This node › Fleet | |
| 45 | Fleet: scenes 1–8 on every peer, with a fade | missing | **carry** — This node › Fleet | |
| 46 | Send one command to one peer | missing | **carry** — This node › Peers | |

## Tally

| | exists | partial | missing | total |
|---|---|---|---|---|
| count | 13 | 13 | 20 | 46 |
| carry | – | 4 (#12, #23, #24, #40) | 16 (#3, 9, 17–22, 28–30, 36, 42, 44–46) | 20 |
| drop | – | 9 (#6, 10, 15, 26, 31, 33, 34, 39, 41) | 4 (#16, 27, 38, 43) | 13 |

## What this changes in di, and what it does not

- **Nothing changes for the desk on a machine.** Everything carried sits in one section, *This node*
  (plan D5), shown only when `caps.node` is on. The one exception is #36: two buttons beside Tap.
- Of the 20 carried, 2 are not a panel at all (#12 and #40 are bridge mapping, work in vizzz.di).
- **Lock-out comes first.** The old console is the only way to set up Wi-Fi today; D5 (#3, 17–22) has to
  ship before the old console is removed (plan risk 7).
- Dangerous ones (#9, 28, 29) are behind a confirm and never on the first screen; #29 asks for a typed word.
- Not built here. D5 is the plan's own step, with its own design review.
