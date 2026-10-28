## 2026-10-21 — OSC In, OSC Out and DMX In: a Nodes graph talks to the other show machines

- **OSC 1.0, written from the spec** (`serverXR/src/osc/oscProtocol.js`, zero dependencies, like
  `lasercubeProtocol.js`): OSC-string/blob padding, i f s b plus the nonstandard h d T F N I a
  sender may use, bundles (nested, depth-capped), address patterns `? * [a-z] [!a] {a,b}` (a
  pattern over 256 characters or with more than 4 `{}` groups matches nothing). An unknown type
  tag or a short packet throws; nothing is guessed. 31 tests, two of them the spec's own byte
  examples (`/oscillator/4/frequency 440.0`, `/foo 1000 -1 "hello" 1.234 5.678`).
- **The bridge** (`serverXR/src/osc/oscBridge.js`, `routes/oscRoutes.js`, mounted at `/osc` beside
  `/laser`, built on first use, 404 hosted): `POST /osc/api/in {port, pattern, since}` opens a UDP
  listener (127.0.0.1, every interface only with `DI_ALLOW_LAN_DEVICES=1`), keeps the last 64
  messages numbered, closes after 60 s unasked; `POST /osc/api/out` sends one message to an IPv4
  address on this machine or a private network (public and x.x.x.255 refused, with the reason).
  Every POST passes `requireOwnPage`. Listener receive buffer asked at 4 MB. Catalogue entries in
  `catalogue/entries/osc.js` (agent: false); the dev proxy has `^/osc(/|$)`.
- **DMX In reads the desk's input**: `inputLevels()` in `lighting/dmxin.js` and
  `GET /light/api/input/levels?universe=N` on the desk (read-only, never switches input on):
  off / not-listened / waiting / live / held / lost, and the 512 levels when there are any. Not in
  `api-contract.json` because the desk's own UI does not call it (the lint checks UI calls).
- **Nodes**: `device.osc.in` and `device.osc.out` lose `authoringOnly` and leave
  `UNIMPLEMENTED_NODE_TYPES` (`device.ptz.osc` stays, no video path); `device.dmx.in` is new, next
  to DMX Out (family bring-in). All three are panel-2d windows (`OscInPanelWindow`,
  `OscOutPanelWindow`, `DmxInPanelWindow`, styled with DMX Out's existing classes — no CSS change)
  with colocated runtimes reading `liveOutputs`. OSC In: Address, Value (first argument), Signal
  (rising count; what was waiting at open is shown, not counted), Status. OSC Out: sends on a
  Value change (20 ms throttle, latest wins), Trigger re-sends, a bare Trigger sends the bare
  address; numbers float32 or int32. DMX In: Universe 1 = desk U1, Value 0..1, holds the last value
  on loss. Polls are 50 ms.
- **Measured** (`node scripts/osc/osc-loopback-rehearsal.mjs`, the fake-cube pattern, this
  container): 3 runs × 1000 messages each way, 1 ms apart — 1000/1000 heard in order, 1000/1000
  sent arrived byte-identical; send→readable p50 1.2–1.3 ms, p99 ≤ 1.85 ms. A 5000-message burst
  with no gap: 2976–5000 of 5000 heard over 5 runs (the OS receive buffer); 250 back-to-back: 0 lost.
  Real Chromium against a booted serverXR: the page opened a listener, heard `/fader/1 0.42`, sent
  `/go "cue 3"` that a plain UDP receiver decoded, and read the desk's levels (`off`).
- **Not tested**: no real TouchDesigner, Resolume, QLab, VCV Cardinal or lighting console; no
  second machine (`--lan`); the three windows were not looked at in a browser on desktop or phone
  (only rendered in jsdom tests). A space whose slug is `osc` is shadowed on a local install, the
  same as `laser` and `light`.
