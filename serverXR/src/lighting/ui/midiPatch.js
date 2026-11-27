'use strict';
// The pure parts of the APC40 "full patch" (owner N7277, 2026-11-27): everything a new MIDI target
// decides that does not need the page. Plain script, no DOM: app.js builds the targets from these,
// midiPatch.test.js holds them. Design: agent-reports-2026-11-27/apc40-full-patch-design.md.
//
// Sources: Akai "APC40 Mk2 Communication Protocol" v1.2 (2015-01-19): the TEMPO and CUE LEVEL
// knobs send RELATIVE values (1-63 = turned up by that many clicks, 64-127 = turned down by 128-v);
// ACTIVATOR is note 0x32, channel 0-7 = track, LED velocity 0 off / 1-127 on; SESSION RECORD 0x66
// and BANK LOCK 0x67 are momentary; TAP TEMPO 0x63, NUDGE - / + 0x64 / 0x65. The show rule "no
// green" lives in colorfx.js (the colour effect skips the green band); nothing here picks a colour.

(function (root) {
  // ---- relative encoders ----
  // The raw 0-127 value a relative knob sends -> a signed click count (Akai CC2 table: 0x40 = -64, 0x7F = -1, 0 = none).
  function relDelta(raw) {
    const v = Math.round(Number(raw));
    if (!Number.isFinite(v) || v <= 0 || v > 127) return 0;
    return v < 64 ? v : v - 128;   // 64 -> -64 as the document says
  }

  // ---- tempo ----
  const BPM_MIN = 20, BPM_MAX = 300;
  const clampBpm = (b) => Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(b)));
  // The tempo knob: one click = one BPM, from where the desk is now.
  function bpmStep(bpm, delta) { return clampBpm((Number.isFinite(+bpm) ? +bpm : 120) + delta); }

  // Tap tempo. Every tap says "this instant is a beat" (epoch); two or more taps in a row also
  // give the speed: the mean gap of the last four taps. A gap over TAP_RESET_MS starts again.
  // Gaps outside the 20-300 BPM range are not a tempo, so the speed is left alone and only the
  // beat moves. Returns {epoch, bpm|undefined}, ready for api/fx.
  const TAP_RESET_MS = 2500, TAP_KEEP = 4;
  function createTapper() {
    let taps = [];
    return {
      tap(now) {
        if (taps.length && now - taps[taps.length - 1] > TAP_RESET_MS) taps = [];
        taps.push(now);
        if (taps.length > TAP_KEEP) taps.shift();
        const out = { epoch: now };
        if (taps.length >= 2) {
          const mean = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
          const bpm = 60000 / mean;
          if (bpm >= BPM_MIN && bpm <= BPM_MAX) out.bpm = clampBpm(bpm);
        }
        return out;
      },
      reset() { taps = []; },
      count() { return taps.length; },
    };
  }

  // Beat nudge: the beat grid moves by NUDGE_MS (25 ms: below what the ear hears as a new beat,
  // and a few presses fix a drifting chase). "+" brings the beat LATER (epoch grows).
  const NUDGE_MS = 25;
  function nudgeEpoch(epoch, dir, now) {
    const e = Number.isFinite(+epoch) && +epoch > 0 ? +epoch : now;
    return Math.max(0, e + (dir > 0 ? NUDGE_MS : -NUDGE_MS));
  }

  // ---- layer rate: a log taper (the desk takes 0.01-64; a knob covers 1/8x-8x, centre = 1x) ----
  const RATE_LO = 0.125, RATE_OCT = 6;   // 0.125 * 2^6 = 8
  const rateFromUnit = (u) => Math.round(RATE_LO * Math.pow(2, RATE_OCT * Math.max(0, Math.min(1, u))) * 1000) / 1000;
  function unitFromRate(r) {
    const x = Number.isFinite(+r) && +r > 0 ? +r : 1;
    return Math.max(0, Math.min(1, Math.log2(x / RATE_LO) / RATE_OCT));
  }

  // ---- colour effect (colorfx.js: mode none/hue/chase/swap, beats 1-64, spread 0-1, amount 0-255) ----
  const CFX_MODES = ['none', 'hue', 'chase', 'swap'];
  const CFX_BEATS = [1, 2, 4, 8, 16, 32];
  function cfxModeStep(cur, delta) {
    const i = Math.max(0, CFX_MODES.indexOf(cur));
    return CFX_MODES[Math.max(0, Math.min(CFX_MODES.length - 1, i + (delta > 0 ? 1 : delta < 0 ? -1 : 0)))];
  }
  const cfxBeatsFromUnit = (u) => CFX_BEATS[Math.min(CFX_BEATS.length - 1, Math.floor(Math.max(0, Math.min(1, u)) * CFX_BEATS.length))];
  function unitFromCfxBeats(b) {
    const i = CFX_BEATS.indexOf(+b);
    return ((i < 0 ? 2 : i) + 0.5) / CFX_BEATS.length;
  }
  // The metronome button: off -> the last mode that was on (hue the first time), on -> off.
  function cfxToggle(cur, last) { return cur && cur !== 'none' ? 'none' : (last && last !== 'none' ? last : 'hue'); }

  // ---- rig groups ----
  // Left truss = universe 5, Right truss = universe 4 (the Reika rig, owner N7277), Back bars =
  // everything else. A desk group of that name wins over the rule, so a rig patched differently
  // only has to name its groups.
  const GROUPS = [
    { key: 'left', label: 'Left truss', name: /left\s*truss/i, universe: 5 },
    { key: 'right', label: 'Right truss', name: /right\s*truss/i, universe: 4 },
    { key: 'back', label: 'Back bars', name: /back\s*bars?/i, universe: null },
  ];
  function rigGroups(fixtures, deskGroups) {
    const fx = Array.isArray(fixtures) ? fixtures : [];
    const named = (g) => (Array.isArray(deskGroups) ? deskGroups : []).find((d) => d && g.name.test(String(d.name || '')));
    const out = [];
    const taken = new Set();
    for (const g of GROUPS.slice(0, 2)) {
      const d = named(g);
      const ids = d ? fx.filter((f) => (d.ids || []).includes(f.id)).map((f) => f.id)
        : fx.filter((f) => f.universe === g.universe).map((f) => f.id);
      ids.forEach((id) => taken.add(id));
      out.push({ key: g.key, label: g.label, ids });
    }
    const back = GROUPS[2], d = named(back);
    out.push({ key: back.key, label: back.label,
      ids: d ? fx.filter((f) => (d.ids || []).includes(f.id)).map((f) => f.id) : fx.filter((f) => !taken.has(f.id)).map((f) => f.id) });
    return out;
  }
  const members = (fixtures, g) => (fixtures || []).filter((f) => g.ids.includes(f.id));
  // The group dimmer as a fader reads it: the mean of its members' dimmers, 0..1.
  function groupDimRead(fixtures, g) {
    const m = members(fixtures, g).filter((f) => f.values && Number.isFinite(+f.values.dimmer));
    return m.length ? m.reduce((s, f) => s + (+f.values.dimmer), 0) / m.length / 255 : 1;
  }
  // On = every member on (a group with one lamp switched off is not "on").
  const groupIsOn = (fixtures, g) => { const m = members(fixtures, g); return m.length > 0 && m.every((f) => f.on !== false); };

  // ---- hold-to-flash (api/raw holds, owner 'apc40') ----
  // A raw hold sits on the DMX channel above every look, LFO and effect and still rides the master
  // and the blackout (engine.js), and a release hands the channel back, so a flash shows over any
  // look and leaves the look exactly where it was. Channels of a white flash: dimmer, an open
  // shutter, every red/green/blue/white emitter (r, g1, w12 ...). Strobe is never touched.
  const HOLD_OWNER = 'apc40';
  const EMITTER = /^[rgbw]\d*$/;
  function flashChannels(fixture, profile) {
    const chans = (profile && profile.channels) || [];
    const out = [];
    chans.forEach((role, i) => {
      if (role === 'dimmer' || role === 'shutter' || EMITTER.test(role)) {
        out.push({ universe: fixture.universe, channel: (fixture.address | 0) + i, value: 255 });
      }
    });
    return out.filter((c) => c.channel >= 1 && c.channel <= 512);
  }
  const releaseOf = (channels) => channels.map((c) => ({ universe: c.universe, channel: c.channel, value: -1 }));
  // ACTIVATOR is a toggle in Generic Mode (Akai protocol p.11): the unit may send note-on, then note-off on the NEXT
  // press. A note-off close behind its note-on is a momentary release (ignore); a late one is a second press (flip).
  const TOGGLE_OFF_MIN_MS = 600;
  const activatorOffFlips = (lastOnAt, now) => Number.isFinite(lastOnAt) && now - lastOnAt >= TOGGLE_OFF_MIN_MS;
  const MAX_HOLD_MS = 15000;   // a flash the page forgot to release lets go by itself

  // ---- zoom ----
  const zoomRoles = (profile) => ((profile && profile.channels) || []).filter((r) => r === 'zoom' || r === 'zoom2');


  // ---- strobe (owner N7314: "use the full potential of the lights") ----
  // BAR1240PIX57 `strobe` channel: DMX 0-3 = open, 4-103 = 1-20 Hz (the coordinator's manual reading), above 103 = other
  // programs this desk never writes. WCAG 2.3.1 / fx.js MAX_STROBE_HZ: no more than 3 flashes a second. A raw hold of the
  // channel does NOT pass fx.js, so the page caps it here: on the 1-20 Hz band at most DMX 14 (= 2.92 Hz).
  const STROBE_MAX_HZ = 3, STROBE_BAND_LO = 4, STROBE_BAND_HI = 103, STROBE_BAND_MAX_HZ = 20;
  const strobeDmxFromHz = (hz) => STROBE_BAND_LO + Math.floor((Math.max(1, hz) - 1) * (STROBE_BAND_HI - STROBE_BAND_LO) / (STROBE_BAND_MAX_HZ - 1));
  const strobeHzFromDmx = (v) => (v >= STROBE_BAND_LO && v <= STROBE_BAND_HI ? 1 + (v - STROBE_BAND_LO) * (STROBE_BAND_MAX_HZ - 1) / (STROBE_BAND_HI - STROBE_BAND_LO) : 0);
  const STROBE_DMX_CAP = (() => { let v = STROBE_BAND_LO; while (strobeHzFromDmx(v + 1) > 0 && strobeHzFromDmx(v + 1) <= STROBE_MAX_HZ) v++; return v; })();   // 14
  // The last gate before DMX: nothing above the cap on the band, nothing past the band at all, never a non-number.
  function capStrobeDmx(v) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < STROBE_BAND_LO || n > STROBE_BAND_HI) return 0;
    return Math.min(n, STROBE_DMX_CAP);
  }
  // The rate knob, 0..1 -> 1..3 Hz -> the capped DMX value.
  const strobeHzFromUnit = (u) => 1 + (STROBE_MAX_HZ - 1) * Math.max(0, Math.min(1, Number.isFinite(+u) ? +u : 0));
  const strobeDmxFromUnit = (u) => capStrobeDmx(strobeDmxFromHz(strobeHzFromUnit(u)));
  const strobeRoleChannels = (fixture, profile) => {
    const out = [];
    ((profile && profile.channels) || []).forEach((role, i) => {
      if (role === 'strobe') out.push({ universe: fixture.universe, channel: (fixture.address | 0) + i });
    });
    return out.filter((c) => c.channel >= 1 && c.channel <= 512);
  };
  // What a strobe hit does. kind 'all': a fixture with a `strobe` channel gets the flash channels + that channel held at the
  // capped rate; any other fixture gets the software strobe (api/fx per-fixture, fx.js slice >= 350 ms). kind 'movers': only
  // fixtures with a shutter and no strobe channel, software strobe only. A `shutter` channel is never written here.
  function strobeHit(fixtures, profileOf, kind, u) {
    const holds = [], fxIds = [];
    const dmx = strobeDmxFromUnit(u);
    for (const f of (fixtures || [])) {
      const p = profileOf(f), chans = (p && p.channels) || [];
      const sc = strobeRoleChannels(f, p);
      if (sc.length) {
        if (kind !== 'all') continue;
        flashChannels(f, p).filter((c) => chans[c.channel - (f.address | 0)] !== 'shutter').forEach((c) => holds.push(c));
        sc.forEach((c) => holds.push({ ...c, value: dmx }));
      } else if (kind === 'all' || chans.includes('shutter')) fxIds.push(f.id);
    }
    return { holds, fxIds, dmx };
  }

  // ---- the 8 device knobs, banked by TRACK SELECT (page = MIDI channel) ----
  // Akai protocol v1.2, Generic mode 0: DEVICE KNOB 1-8 = CC 0x10-0x17 on the channel of the selected track bank (ch 1-8,
  // MASTER 9); LED ring value = the same CC written back, ring type = CC 0x18-0x1F (1 = single). One table: what a knob sets
  // (route + body from the desk state S) and how its ring reads the state back.
  const WORLD = 1000;
  const FX_MODE_LIST = ['none', 'strobe', 'chase', 'pulse', 'sine', 'sparkle', 'comet', 'bars', 'glitch', 'radar', 'pump', 'breathe', 'pingpong', 'blocks', 'fade'];
  const FX_SPATIAL_LIST = ['patch', 'x', 'x-', 'y', 'y-', 'radial', 'radial-'];
  const LFO_WAVE_LIST = ['sine', 'tri', 'saw', 'square', 'random'];
  const DIR_LIST = ['forward', 'reverse', 'pingpong'], EASE_LIST = ['linear', 'smooth', 'bounce'];
  const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
  const lin = (lo, hi, dec) => ({ lo, hi, dec: dec || 0 });
  const enm = (values) => ({ values });
  const video = (path, spec, label, unitLabel) => ({ ...spec, label, unitLabel, route: 'api/video',
    read: (S) => { const v = (S && S.video) || {}; return path.length === 2 ? (v[path[0]] || {})[path[1]] : v[path[0]]; },
    body: (val) => (path.length === 2 ? { [path[0]]: { [path[1]]: val } } : { [path[0]]: val }) });
  const fxk = (field, spec, label, unitLabel) => ({ ...spec, label, unitLabel, route: 'api/fx',
    read: (S) => (S && S.fx ? S.fx[field] : undefined), body: (val) => (field === 'mode' ? { mode: val, all: true } : { [field]: val }) });
  const lfok = (field, spec, label, unitLabel) => ({ ...spec, label, unitLabel, route: 'api/lfos',
    read: (S) => { const l = S && Array.isArray(S.lfos) ? S.lfos[0] : null; return l ? l[field] : undefined; },
    body: (val, S) => (S && Array.isArray(S.lfos) && S.lfos[0] ? { lfos: S.lfos.map((l, i) => (i === 0 ? { ...l, [field]: val } : l)) } : null) });
  const KNOB_PAGES = [
    { ch: 1, id: 'fx', name: 'FX engine', knobs: [
      fxk('mode', enm(FX_MODE_LIST), 'FX mode', '15 modes'), fxk('spatial', enm(FX_SPATIAL_LIST), 'FX spread', 'patch x y radial'),
      fxk('depth', lin(0, 255), 'FX depth', '0-255'), fxk('bpm', lin(20, 300), 'FX tempo', '20-300 BPM')] },
    { ch: 2, id: 'pixelmap', name: 'Pixel map', knobs: [
      video(['sample'], lin(1, 30), 'Pixel size', '1-30 % of picture'), video(['mix'], lin(0, 255), 'Video mix', '0-255'),
      video(['speed'], lin(0.1, 4, 2), 'Video speed', '0.1-4 x'), video(['bright'], lin(-100, 100), 'Brightness', '-100..100'),
      video(['contrast'], lin(0, 300), 'Contrast', '0-300 %'), video(['x'], lin(-WORLD, WORLD), 'Map left-right', '+-1000'),
      video(['y'], lin(-WORLD, WORLD), 'Map up-down', '+-1000')] },
    { ch: 3, id: 'pixelanim', name: 'Pixel animation', knobs: [
      video(['anim', 'bscale'], lin(0.1, 5, 2), 'Animation size', '0.1-5 x'), video(['anim', 'beats'], lin(0, 64), 'Animation beats', '0-64'),
      video(['anim', 'phase'], lin(0, 1, 2), 'Animation phase', '0-1'), video(['anim', 'dir'], enm(DIR_LIST), 'Direction', 'fwd rev pingpong'),
      video(['anim', 'ease'], enm(EASE_LIST), 'Easing', 'linear smooth bounce'), video(['anim', 'bx'], lin(-WORLD, WORLD), 'Travel to x', '+-1000'),
      video(['anim', 'by'], lin(-WORLD, WORLD), 'Travel to y', '+-1000'), video(['lfo', 'depth'], lin(0, 1, 2), 'Mix breathing', '0-1')] },
    { ch: 4, id: 'lfo1', name: 'LFO 1', knobs: [
      lfok('wave', enm(LFO_WAVE_LIST), 'LFO 1 wave', '5 waves'), lfok('beats', lin(0.25, 64, 2), 'LFO 1 beats', '0.25-64'),
      lfok('depth', lin(0, 255), 'LFO 1 depth', '0-255'), lfok('spread', lin(0, 1, 2), 'LFO 1 spread', '0-1')] },
  ];
  const KNOBS = [];
  KNOB_PAGES.forEach((page) => page.knobs.forEach((spec, k) => KNOBS.push({ ...spec, key: 'kn:' + page.id + ':' + k, ch: page.ch, num: 0x10 + k, page: page.id, pageName: page.name })));
  const knobByKey = (key) => KNOBS.find((s) => s.key === key) || null;
  const round = (v, dec) => { const m = Math.pow(10, dec || 0); return Math.round(v * m) / m; };
  // knob 0..1 -> the value it sets
  function knobValue(spec, u) {
    const x = Math.max(0, Math.min(1, Number.isFinite(+u) ? +u : 0));
    if (spec.values) return spec.values[Math.min(spec.values.length - 1, Math.floor(x * spec.values.length))];
    return round(spec.lo + x * (spec.hi - spec.lo), spec.dec);
  }
  // a desk value -> where the ring sits, 0..1 (undefined when the desk has none: the ring stays dark)
  function knobUnit(spec, raw) {
    if (spec.values) { const i = spec.values.indexOf(raw); return i < 0 ? undefined : (i + 0.5) / spec.values.length; }
    const n = num(raw, NaN);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, (n - spec.lo) / (spec.hi - spec.lo))) : undefined;
  }
  // the call a knob turn makes: {route, body} or null (no LFO to edit)
  function knobSend(spec, u, S) { const body = spec.body(knobValue(spec, u), S); return body ? { route: spec.route, body } : null; }
  // every ring: { key: 0..1 } for the keys the desk state can read
  function knobRings(S) {
    const out = {};
    for (const spec of KNOBS) { const u = knobUnit(spec, spec.read(S)); if (u !== undefined) out[spec.key] = u; }
    return out;
  }

  // ---- movement size (engine: layer.headScale 0..1, 1 = as the look was written) ----
  const headScaleFromUnit = (u) => Math.max(0, Math.min(1, Number.isFinite(+u) ? +u : 1));

  const api = { relDelta, BPM_MIN, BPM_MAX, clampBpm, bpmStep, createTapper, TAP_RESET_MS, TAP_KEEP, NUDGE_MS, nudgeEpoch,
    rateFromUnit, unitFromRate, CFX_MODES, CFX_BEATS, cfxModeStep, cfxBeatsFromUnit, unitFromCfxBeats, cfxToggle,
    GROUPS, rigGroups, groupDimRead, groupIsOn, HOLD_OWNER, flashChannels, releaseOf, MAX_HOLD_MS, TOGGLE_OFF_MIN_MS, activatorOffFlips, zoomRoles,
    STROBE_MAX_HZ, STROBE_DMX_CAP, capStrobeDmx, strobeDmxFromHz, strobeHzFromDmx, strobeHzFromUnit, strobeDmxFromUnit, strobeHit,
    KNOB_PAGES, KNOBS, knobByKey, knobValue, knobUnit, knobSend, knobRings, headScaleFromUnit };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskMidiPatch = api;
})(typeof window !== 'undefined' ? window : this);
