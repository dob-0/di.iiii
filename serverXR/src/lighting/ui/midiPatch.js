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
  // The raw 0-127 value a relative knob sends -> a signed click count. 0 and 64 are "no move".
  function relDelta(raw) {
    const v = Math.round(Number(raw));
    if (!Number.isFinite(v) || v <= 0 || v > 127 || v === 64) return 0;
    return v < 64 ? v : v - 128;
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
  const MAX_HOLD_MS = 15000;   // a flash the page forgot to release lets go by itself

  // ---- zoom ----
  const zoomRoles = (profile) => ((profile && profile.channels) || []).filter((r) => r === 'zoom' || r === 'zoom2');

  const api = { relDelta, BPM_MIN, BPM_MAX, clampBpm, bpmStep, createTapper, TAP_RESET_MS, TAP_KEEP, NUDGE_MS, nudgeEpoch,
    rateFromUnit, unitFromRate, CFX_MODES, CFX_BEATS, cfxModeStep, cfxBeatsFromUnit, unitFromCfxBeats, cfxToggle,
    GROUPS, rigGroups, groupDimRead, groupIsOn, HOLD_OWNER, flashChannels, releaseOf, MAX_HOLD_MS, zoomRoles };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskMidiPatch = api;
})(typeof window !== 'undefined' ? window : this);
