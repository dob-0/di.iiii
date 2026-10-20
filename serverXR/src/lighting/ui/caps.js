'use strict';
// What this page may offer, and what it says when it cannot draw what the desk sent.
//
// A desk is not always the whole desk: the state it sends may carry `caps`, an object that
// names what this one cannot do ({ midi: false, audio: false, ... }). No `caps` at all is the
// full desk, so nothing changes for the desk on a machine. Mic and MIDI also need a secure
// page (localhost or https); on a plain http address the browser refuses both outright.
//
// Plain script, no DOM here: app.js paints what these return, and
// serverXR/src/lighting/tests/test.js holds the rules to account.

(function (root) {
  // The state keys renderAll reads without a guard. When one is missing the page cannot draw,
  // and the name of the key is the useful thing to say.
  const DRAWN = ['status', 'output', 'fx', 'chase', 'fixtures', 'scenes', 'groups', 'lfos', 'layers'];

  // The controls that need the browser's own mic or MIDI, by the cap that gates them.
  const NEEDS_SECURE = { midi: true, audio: true };

  // Caps that are off unless the desk says true. `node` is the one: a machine is not a
  // hardware node, so the "This node" fold shows only when the state says caps.node: true.
  const OPT_IN = { node: true };

  // Is `name` on? A missing caps object is the full desk; only an explicit false turns one off
  // (an OPT_IN cap is the other way round: only an explicit true turns it on).
  function cap(caps, name, secure) {
    if (OPT_IN[name]) return !!(caps && typeof caps === 'object' && caps[name] === true);
    if (caps && typeof caps === 'object' && caps[name] === false) return false;
    if (NEEDS_SECURE[name] && secure === false) return false;
    return true;
  }

  // The poll's failure counter. Only a reply that never arrived counts against the desk;
  // a reply that arrived and could not be drawn is the page's trouble, not the network's,
  // and must neither raise the counter nor reset it.
  //   outcome  'network' (no usable reply) | 'drawn' (replied and drew) | 'render' (replied, draw threw)
  function nextFails(fails, outcome) {
    if (outcome === 'network') return fails + 1;
    if (outcome === 'drawn') return 0;
    return fails;
  }

  // Which key the page could not draw: a missing key it reads without a guard, else the
  // property the engine named, else the message itself.
  function culprit(err, state) {
    if (state && typeof state === 'object') {
      for (const k of DRAWN) if (state[k] === undefined || state[k] === null) return k;
    }
    const m = /reading '([^']+)'/.exec(String(err && err.message ? err.message : err));
    if (m) return m[1];
    return String(err && err.message ? err.message : err).slice(0, 80) || 'unknown';
  }

  const unreadable = (err, state) => 'the desk sent a state this page cannot draw: ' + culprit(err, state);

  // ---- This node (caps.node): the hardware node's own /status, read the same either way ----
  // The firmware writes ip / sta_connected / fw; the simulator ap_ip / sta and no fw. A fact
  // neither sends is null, and the page says "not reported" rather than drawing a number.
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const bool = (v) => (typeof v === 'boolean' ? v : null);
  const str = (v) => (typeof v === 'string' && v !== '' ? v : null);
  const first = (...vs) => { for (const v of vs) if (v !== null && v !== undefined) return v; return null; };

  // Arduino's wl_status_t, in words a person can act on.
  const WL = { 0: 'idle', 1: 'network not found', 2: 'scan done', 3: 'joined', 4: 'join failed: check the password', 5: 'connection lost', 6: 'not joined', 255: 'no Wi-Fi hardware' };
  const wlWords = (code) => (num(code) === null ? 'not reported' : WL[code] || 'state ' + code);
  const NET_MODES = ['access point + Wi-Fi', 'Wi-Fi only', 'access point only'];
  const SOURCE_MODES = ['web only', 'network only', 'merge (HTP)'];

  function nodeFacts(st, manifest) {
    const s = st && typeof st === 'object' ? st : {};
    const m = manifest && typeof manifest === 'object' ? manifest : {};
    const fwTag = m.firmware && typeof m.firmware === 'object' ? str(m.firmware.tag) : null;
    return {
      name: str(s.name),
      apIp: first(str(s.ap_ip), str(s.ip)),
      apName: str(s.ssid),
      staIp: str(s.sta_ip) === '0.0.0.0' ? null : str(s.sta_ip),
      staOn: first(bool(s.sta_connected), bool(s.sta)),
      staSsid: str(s.sta_ssid),
      staRssi: num(s.sta_rssi),
      wl: wlWords(s.wl_status),
      apClients: num(s.ap_clients),
      netMode: num(s.net_mode),
      sourceMode: num(s.mode),
      fallback: bool(s.artnet_fallback_to_web),
      live: { artnet: bool(s.artnet_active), sacn: bool(s.sacn_active), usb: bool(s.usb_active) },
      art: { net: num(s.net), subnet: num(s.subnet), uni: num(s.uni), uni15: num(s.uni15) },
      artOut: bool(s.ao),
      artOutTarget: str(s.ao_target),
      burnSafe: bool(s.burn_safe),
      ceiling: num(s.safe_ceiling),
      slew: num(s.safe_slew_step),
      peerCount: num(s.peer_count),
      fw: first(str(s.fw), fwTag),
      heapFree: num(s.heap_free),
      heapMaxBlock: num(s.heap_max_block),
      uptimeS: num(s.uptime_s),   // no node sends it yet (2026-10-15): painted "not reported"
    };
  }

  // One line for the fold's summary, painted even while the fold is closed.
  function nodeSummary(f) {
    if (!f) return 'not reached yet';
    const addr = f.staOn && f.staIp ? f.staIp : f.apIp;
    const src = f.sourceMode === null ? null : SOURCE_MODES[f.sourceMode] || 'source ' + f.sourceMode;
    return [f.name || 'unnamed', addr, src, f.burnSafe ? 'burn-safe' : null].filter(Boolean).join(' · ');
  }

  // A two-press confirm. The first press arms `key`; a second press of the same key within
  // `ms` fires it; any other key re-arms that one instead, and time disarms. Pure: the
  // caller keeps the returned `armed` and passes it back with the next press.
  function confirmStep(armed, key, now, ms) {
    const win = ms || 4000;
    if (armed && armed.key === key && now - armed.at <= win) return { fire: true, armed: null };
    return { fire: false, armed: { key, at: now } };
  }
  const stillArmed = (armed, now, ms) => !!(armed && now - armed.at <= (ms || 4000));

  const api = { DRAWN, OPT_IN, cap, nextFails, culprit, unreadable, wlWords, NET_MODES, SOURCE_MODES, nodeFacts, nodeSummary, confirmStep, stillArmed };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskCaps = api;
})(typeof window !== 'undefined' ? window : this);
