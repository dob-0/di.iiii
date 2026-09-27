## 2026-09-28 — the lighting desk takes a console's Art-Net and sACN

- The desk at `/light` could only send. It now RECEIVES: Art-Net 4 (ArtDmx on UDP 6454, ArtPoll
  answered with a spec ArtPollReply as a Style StVisual node) and sACN / ANSI E1.31-2018 (multicast
  239.255.hi.lo joined per universe, and unicast, on UDP 5568). Specs by version are named in
  `serverXR/src/lighting/dmxin.js` and in `docs/architecture/LIGHTING_DESK.md` → "Input".
- `dmxin.js` is pure (parsers/builders, §6.7.2 sequence rule, merge); `dmxin-net.js` binds only the
  ticked interfaces and drops sources outside their subnets. Config lives at `output.input` in the
  machine's show (never a space's), OFF by default. Setup → Input panel + `in:` pill on every page.
- Merge: priority first (Art-Net = 100), then HTP or LTP per universe; Art-Net max 2 sources, sACN 8;
  loss 2.5 s sACN / 10 s Art-Net, then release (desk takes back) or hold. Per universe "follow the
  console" (replaces desk) or "HTP with the desk". Blackout beats input. An input universe is never
  re-sent on the protocol it arrived on (no loops); own CID / own Art-Net bytes are dropped.
- Tests: `tests/test-dmxin.js` (39 checks incl. real loopback UDP), wired into `lighting.test.js`;
  `test-http.js` got the `/api/input` route check. All four desk suites green.
- Measured on aylmo with `tests/bench-input.js` (sender `tests/dmx-send.js`): in-process packet→state
  p50 0.04 ms; through HTTP it equals one GET (~1.5 ms); 44 Hz × 3 universes × 60 s: sACN multicast
  7923/7923, Art-Net 7920/7920, 0 lost, 0 late, 1–2 % of one core. Lamp colour proven through
  `mirrorFixtures` + `liveLightEntity` against the running desk; desk UI seen in Chrome at 1707 and
  in a 390 px frame. No 3D screenshot (no GPU render was run).
- Owed: a real console (grandMA3 onPC is the free test), sACN OUTPUT sends Universe 1 as sACN 0
  (reserved by E1.31 §6.2.7 — one-line fix in sacn.js, not made), input waits for the desk's first
  request after a restart.
- My dev server on :4371 was killed from outside once mid-session with nothing in its log (the known
  pattern-kill footgun, feedback_agent_dev_stacks_ports); restarted, nothing lost.
