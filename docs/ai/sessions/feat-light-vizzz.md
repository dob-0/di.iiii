# Session notes — feat/light-vizzz

## 2026-08-31 — DMX Out: the graph reaches a real lighting rig over HTTP

- New node `device.dmx.out` ("DMX Out", send-out family): drives a vizzz node —
  the studio's ESP32 Art-Net/DMX box (repo `vizzz.di`) — over its HTTP routes.
  Master, Channel+Value and Blackout in; Status out via the liveOutputs side
  channel (the MIDI Out shape). Host is config, not a port (the keeper's
  endpoint rationale), settable in the panel itself.
- Why HTTP and not Art-Net: Art-Net is UDP and a browser tab cannot send it —
  the same wall that gates NDI/OSC (docs/architecture/RAW_WORKSPACE.md). The
  vizzz firmware's HTTP API is the honest bridge that needs no local daemon.
- The firmware is honest about only half of CORS: JSON routes answer with
  Access-Control-Allow-Origin, command routes return bare 204s. So `/status`
  is a readable poll (the truth about reachability) and commands go out as
  no-cors fire-and-forget GETs (`src/raw/utils/dmxRigClient.js`).
- The mixed-content wall is named, not suffered: a https page cannot fetch a
  http rig, so on the hosted editor the panel and Status SAY that and send
  nothing. The local editor is the surface that reaches a rig.
- Change discipline: send only when a number CHANGES (the CC idiom); per-lane
  100ms throttle that coalesces to the LATEST value so an oscillator cannot
  hammer an ESP32 at frame rate; Blackout is a rising edge, unthrottled, and
  cancels queued levels so a stale brightness cannot land after it.
- No fest data baked in: the node knows no fixtures, no patch chart, no
  scenes — it is a clean hand on whatever rig it is pointed at (owner's call,
  2026-08-31: "fest is over, keep the light controller clean").
- NOT verified against hardware: no vizzz node was powered during the session
  (no UDP beacons on the LAN). Verified at the faked fetch boundary + the
  panel's honest status text; the cable test with a real rig is still owed.
- Wiki: new `dmx-out-node` entry.
