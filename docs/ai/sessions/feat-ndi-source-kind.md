## 2026-09-20 — an NDI source is a surface now, and the machines say which ones they see

Steps 2 and 3 of `~/work/di-atlas/decisions/2026-09-20-native-ndi.md`, on top of the
server-side lane that landed as `feat/ndi-receive`. This is the part an artist touches: a
projection surface can name an NDI® source, the desk suggests the ones any machine can
see and warns about a name none can, and every state says why in the server's own words.

- **A source kind `ndi`, picked by NAME.** `'ndi'` in `MAPPING_SOURCE_KINDS` in both
  schema mirrors; the ref is the source's name (`AYLMO (td_out_windows)`, or any fragment
  — `td_out` is enough). No address is ever stored: the SENDER chooses which of its own
  interfaces to advertise, so an address written on the desk means nothing on the machine
  that draws. Same model as `stream`, one chain shorter.
- **One matching rule instead of three.** `src/shared/nameMatch.js` (`pickByName`,
  `pickByLabel`) is now the rule the wall (`matchStreamDevice`, `MapNdiSource`), the desk
  (`inputOnMachine`, `ndiOnMachine`) and serverXR (`ndi/names.js`) all use. It is TWO
  files, not one — `shared/nameMatch.cjs` is the server's twin — because serverXR is CJS
  and Vite's dev server hands a local `.cjs` to the browser untransformed. Checked, not
  assumed: `vite build` bundles one correctly, `vite dev` serves `module.exports` raw and
  the page throws. `src/shared/nameMatch.test.js` runs both copies over one table, plus
  the server's own `matchSourceName`, so they cannot drift.
- **`MapNdiSource`** probes `/ndi/api/summary` with the lighting desk's guard (200 AND
  `content-type: application/json` — a hosted tier answers SPA HTML to anything), then
  draws `/ndi/in.mjpg` in an `<img>` through `useRetryingMedia`. Five states, all in the
  dim placeholder, never white: looking for it · this di.iiii cannot receive NDI (and it
  stops asking) · `NDI is not installed on this machine — <the server's own how>` · no
  NDI source called “…” on this network · **the receiver's own `detail`**, which step 1
  taught to name the address it dialled and say whether the session was ever opened. No
  second vocabulary for any of them; `ndiLink.js` is the only place a refusal becomes a
  sentence.
- **Inspector**: kind `NDI (source by name)`, `MapNdiPicker` (a text field with a
  datalist of every source any machine can see, and a status line), and beside it the
  licence line — a link to ndi.video and "NDI® is a registered trademark of Vizrt NDI AB".
  That is a condition of naming NDI at all, given we never ship its runtime;
  `MapInspector.test.jsx` guards both so a layout pass cannot quietly drop them.
- **The machines know their NDI.** `readMachineDevices` appends one `ndi` device per
  source the machine's own serverXR can see, on a 1.5 s leash, swallowing everything — a
  machine with no runtime reports nothing, and nothing is the ordinary case.
  `ndiSourceOptions` / `ndiSourceStatus` / `unresolvedInputs` (the old `unresolvedStreams`,
  extended to both kinds and renamed) put it on the desk.
- **`MAX_DEVICES` is now per kind** (32 each, 96 in the message). It was one shared
  ceiling of 32 across all kinds, and a festival LAN advertising thirty NDI sources would
  have pushed out whatever came after them — which, since `readMachineDevices` appends
  screens before NDI, is the panel sizes the desk lays a wall out from.

### Two defects found on the way, both fixed

- **A space whose slug starts with `ndi` was unreachable in dev.** Vite's dev proxy
  matches keys by PREFIX, so `'/ndi'` claimed `/ndi2-test/map/wall` and handed it to
  serverXR, which answered `Cannot GET`. Express does not behave that way, so only dev was
  wrong. Now anchored regexes, `'^/ndi(/|$)'` and `'^/light(/|$)'`.
- **Every unfinished surface printed its name on the projector in pure white.**
  `MapSourcePlaceholder` is what "no file yet", "no project chosen", "waiting to start"
  and "camera unavailable" all draw, and its ink was `--ui-text-primary` = `#ffffff`.
  Measured on the real `/out` page: 21,394 near-white pixels. It now uses the
  identification card's palette and measures 0, max luminance 96.4/255 — the same number
  the card fix reported. Found only by measuring the screenshot, not by looking at it.
  Both rows are in `docs/ai/known-fixes.md`.

### Seen, and not seen

Seen on aylmo at 1440x900 (screenshots in `~/Downloads/ndi-step2/`): the inspector with
the NDI kind chosen, the picker holding `td_out`, the status line and the licence line;
the Machines section with this machine's screen and camera and the red warning for a
surface with no name given; and `/out` showing the true state of this laptop — "NDI is not
installed on this machine — install libndi, then restart di" — in warm amber on black,
measured at zero near-white pixels. That "install libndi" sentence is the server's own
`how` from step 1, shown verbatim on purpose.

**A live NDI picture is still not verified anywhere in a browser.** aylmo has no NDI
runtime and TouchDesigner was deliberately not started. So the `<img>` path, the frame
rate it can hold, and whether `load` fires per part on a multipart stream are all
unproven — every state EXCEPT a frame arriving is what was looked at. The cross-machine
case from step 1 is still unreproduced too.
