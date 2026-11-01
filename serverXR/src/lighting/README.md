# Lighting desk — consuming the bundle (for a node build)

`npm run desk:bundle [-- --out <dir>] [--gz node|python]` writes, to `build/desk-bundle/` by default (gitignored):

- `ui/*` — every file of `serverXR/src/lighting/ui/`, byte for byte (today 9: `index.html app.js style.css qr.js from.js show.js caps.js dmxfeed.js ask.js`; a new UI file is picked up and listed in the manifest).
- `manifest.json` — `{ di_commit, contract_version, gz_producer, files: [{ path, bytes, sha256, gz_bytes, gz_sha256 }] }`. No build time: the same commit gives the same bytes. `di_commit` gets `-dirty` when the UI, `engine.js` or the contract differ from `HEAD`.
- `profiles-node.json` — `{ source: { file, di_commit }, profiles: [{ name, cat, label, channels }] }`: the 13 built-ins a node carries (`dimmer ds drgb drgbs drgbw drgbwa rgb rgba rgbw rgbaw dwwcw ptdrgb ppttdrgbw`), read from `PROFILES` in `engine.js`, never copied.

**What a node checks.** `sha256` of the raw files is the pin: it is identical on every machine. The gzip fields depend on the zlib that made them. Node's bundled zlib deflates differently from Python's (measured: `qr.js` 3106 vs 3101 bytes), and vizzz.di's `tools/fetch_desk_ui.py` gzips with Python (`gzip -9`, mtime 0, no name). `--gz python` makes the gz fields with that same code path, so they match `fetch_desk_ui.py`; `gz_producer` in the manifest names whichever zlib was used. Compare gz hashes only between equal producers.

**Planned, not built here:** `fetch_desk_ui.py --manifest <dir>` in vizzz.di, reading this directory in place of its GitHub fetch. Until then the node keeps pinning with `desk_ui.lock`.

Test: `node serverXR/src/lighting/tests/test-bundle.js` (part of `lighting.test.js`).

## Output bus (Light v3, step 1.2)

`outputStatus.js` gives every route (the main output and each extra device) one word — `ok`, `unreachable` or `off` — with the reason
in plain words. It is on `GET /api/state` (`status.bus`) and `GET /api/summary` (`output.bus`), and the wire pill on the page turns
to "<name> unreachable" with the reasons in its tooltip. An Art-Net node that never answered ArtPoll is not called unreachable (most
ignore it); one that answered and went quiet for 20 s is. `showBackup.js` copies the show into `backups/` (newest 20) before the desk
leaves it for another show; before a manual reset run `node tools/backup-show.js <data dir>`.

The output form follows the live output: on every poll it shows the desk's driver, serial port, mode, targets and refresh rate, except the one control being edited. A change posts only the changed key (`ui/outputPatch.js`), never the whole form, and the desk keeps every key a POST leaves out — so a page loaded earlier cannot post a stale driver over the live one (the USB output died that way on the show Mac, 2026-10-30). A POST whose values equal the current ones saves nothing and restarts nothing; a real driver change logs `output driver old -> new`.

### Broadcast networks and the Fader

In broadcast mode the desk sends Art-Net frames and ArtPolls to the broadcast address of every network it is on, except a network that
carries a LaserCube: the cubes' addresses are read from `<data dir>/laser/laser.json` and an interface whose subnet holds one is left out
(`broadcastPlan`, `artnet.js`). The limited broadcast `255.255.255.255` is dropped while another network is left, because the OS would
send it out of the laser link too. `status.broadcast` lists the networks in use, `status.broadcastExcluded` the others with the reason
"laser network", and `output.bus` routes carry the same; one log line names the skipped networks. The way back is `broadcastAll: true`
(`POST /api/output`): every network, as before. The Fader sends raw channels, which ride the master on purpose (the panic path reaches
them); a held 255 stores 255 and leaves at 255 x master, and the small number under each fader is what leaves.

**Title and Identify.** The desk's title is "Light" with the show name, and a line beside it names the wire in use from the live output: "Art-Net", "ENTTEC on /dev/ttyUSB0" or "sACN" (the page title follows). Identify decides by the protocol: it asks the port for the widget's parameters and accepts a well-formed reply, so our vizzz node (1a86:7523) reads "ENTTEC protocol · vizzz node", an FTDI original "ENTTEC DMX USB Pro", and a silent port "no answer on <port>"; a port the live output holds is never opened for the probe.

The B key and the MIDI blackout pad are one-way: they switch blackout on, never off, and B ignores key auto-repeat; releasing blackout is the button click. The "Press again to go live" arm survives the 1.5 s poll, ignores a second press within 400 ms and names the driver and port. The driver radios only choose; a "Switch to <driver>" button applies it, after a confirmation while output is on (`ui/panicKeys.js`).
