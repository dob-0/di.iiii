# The festival machine — what we have (2026-09-06)

The situation the owner named: a festival, power only, no internet, one laptop, and
everything we built on hand — with the AI parts talking to the model on the box.

This is the inventory. Eleven testers each took one surface of the `di` install on aylmo
(0.4.2-offline.6, built from `feat/offline-local-model`, data = the shared local tier of
17 spaces) with **every request that would leave the machine refused** (headless
Chromium, `page.route` abort). Every claim below was seen in a screenshot that was read,
and every blocker was reproduced by two further agents working independently. A critic
then tested what the eleven had missed.

## The one-line answer

**The tools are there and they work offline. The room is not.** Studio, the node editor,
the lighting desk, the projection-mapping desk, video, camera and microphone input, the
3D rooms, the published pages, spaces as files, and the model on the box all work with
the internet cut. What does not work is anything that reaches out of the laptop: a phone
in the same room cannot open it, a headset cannot enter it, and a handful of published
pages carry their own CDN links and go dark.

## What works, surface by surface

| surface | offline | notes |
|---|---|---|
| Front door `/` and `/spaces` | yes | grid and map, cards paint, Save to file / Open a file round-trip, private spaces open (auth is off) |
| 3D rooms `/open` `/main` `/dilijan` `/cascade` | yes | walk, fly, doors, Armenian labels from the vendored font, zero outbound |
| Studio (the editor) | yes | primitives, text (Armenian), move, colour, save, reload persists; image and **PDF import** (pdfjs vendored); phone layout |
| Node editor `/open/raw` | yes | palette, wiring with type checks, MIDI Out, DMX Out finds the desk |
| Agent node | yes | answers from the model on the box, labelled by its name, no key |
| Keeper node | yes | bare host `http://127.0.0.1:8090` → tries Ollama's path, then OpenAI's |
| Lighting desk `/light` | yes | patch, arrange, looks, scenes, chase, clock, layers, fader page, MIDI page, Art-Net / ENTTEC settings; show persists to disk; zero outbound |
| Projection mapping `/<space>/map/<project>` and `/out` | yes | surfaces, corner-pin, test pattern, project source, output window |
| Video on planes | yes | import through Studio, plays in the room and on the published page |
| Camera and microphone nodes | yes | live frame, live level (fake devices in headless) |
| Published pages | mostly | network + 52 person rooms, funding board, library (51 PDFs local), decisions, RecordAR exhibition all render; see the dead list |
| Spaces as files | yes | Save to file → `.diiii` (manifest, scene, projects, 500-op window, assets, blobs; secrets stripped); Open a file round-trips; `di save`, `di backup` (712 MB) |
| Two people on one machine | yes | a change in one browser appears in the other on `/open/raw/projects/open-jam`; project chat works |
| `di` CLI | yes | version, status, spaces, where, doctor, save, logs; `di mcp` speaks MCP with 17 tools |
| Decoders and fonts | yes | Draco, Basis, Meshopt, RGBE/EXR, Inter, Armenian fallback all served from the install |
| Wiki | yes | opens and searches offline |

## What does not work tonight

**Blocker**
- **A phone in the room cannot open the show.** The install listens on `127.0.0.1:4000`
  only, by design ("a personal one-machine install"); the CLI has no `--lan` flag and the
  wifi and Tailscale addresses refuse. Consequences: no phone on the Touch page of the
  lighting desk (the desk still prints a LAN URL and a QR code that will not work), no
  standalone headset (WebXR needs a secure context: localhost or https, never a LAN IP over
  plain http), and the Open Space's QR code points at di-studio.xyz, not the laptop.
  *Owner's decision:* add `di up --lan` (auth stays off, so this means "the room can edit").

**Bad, platform** (all reproduced twice, none offline-specific)
- The light show does not travel: `~/.di/data/lighting/show.json` is in neither `di backup`
  nor `di save` nor the space. `di backup` says "your whole di.iiii"; it also leaves out
  users, AI chats, uploads and the database.
- `di open FILE` stops and restarts the server for everyone; the browser's Open a file does
  not. Two doors, two behaviours.
- A newly placed panel node's window opens partly outside the viewport (prod too).
- `/main`'s WCC and algovrithm doors land on the "left out of this copy" stub with no way
  back; the two cards say LIVE. Their spaces are on the machine; only the site-specific
  pieces were cut by the local profile.
- The local model was told "You are Claude" and said so when asked. Fixed in this PR.

**Bad, data** (the page's own HTML, would work with internet)
- `the-light-put-back`, `azd`, the five Dilijan camp works and `br_id_ge`'s field load
  three.js, Leaflet, cannon-es or mediapipe from cdnjs / unpkg / jsdelivr → black offline.
- The Dilijan camp works also reference assets that are not on this tier at all (404
  online too): every door in `/dilijan` leads to a blank or crippled page.
- `br_id_ge`'s landing links, and the Open Space QR, name staging / prod hosts.
- 26 published pages pull Google Fonts; they fall back to system faces (cosmetic).

**Minor, worth a line**
- With auth off, `/<space>/admin` shows account e-mails and this machine's Claude Code
  session transcripts to whoever is at the keyboard.
- `GET /api/spaces/<unknown>/scene` creates a directory for the unknown id in the real
  tier (seven stubs appeared during the test; moved to `~/di-backups/`).
- `di mcp --help` starts the server; `di mcp` reports version 0.0.0.
- `/make` on a local install is a silent empty room (the toybox lives at
  `/<space>/make/<project>`, which works).
- A `.diiii` carries the last 500 ops per project, not "every edit"; space chat lines are in
  no file at all.
- 3D extruded text renders Armenian as question marks (flat text is fine).
- Map view labels pile up around a busy star.

## Not built, by design (the critic's list)
- OSC in/out, PTZ, stream compositor/switcher/recorder, AR/Insta360/RealSense sources —
  withheld from the palette (`UNIMPLEMENTED_NODE_TYPES`). No link to TouchDesigner or
  Resolume tonight.
- GLB export of a scene does not exist; the only way out is the `.diiii` bundle.
- No exhibition mode that pins a room fullscreen and hides the exit; the map `/out` window
  is the only chromeless signal.
- Visitor inscriptions are API-only (built for the rite page, which is dead offline).
- MIDI In/Out and real DMX output need a device plugged in; not judged headless.

## The model on the box
- llama.cpp at `127.0.0.1:8090`, CORS open to the install, `di.iiii` names it in
  `/api/ai/providers`, chat streams accepted/delta/done, the stored turn says `qwen3-4b`.
- **The GPU driver crashed at boot on 2026-09-05**; the model runs on CPU at about 3
  tokens/s alone and collapses under load. A reboot is the first thing to try. Bench of
  small models the same day: LFM2-1.2B answered correctly at 50 tokens/s on this CPU.

## How this was tested
`scratchpad/offline.mjs` pattern: Playwright, `deviceScaleFactor 2`, `waitUntil: 'load'`,
`ctx.route('**/*', r => isLocal(r.request().url()) ? r.continue() : r.abort('internetdisconnected'))`,
record blocked URLs, console errors, page errors, responses ≥ 400, read every screenshot.
Published pages live in srcdoc iframes: walk `page.frames()`. Total: 245 client routes and
22 API endpoints swept; the platform itself made zero outbound requests.
