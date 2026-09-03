'use strict';
// Fixture library, DMX rendering, fades and chase playback.

const { fxActive, fxOrder, fxLevel } = require('./fx');
const { lfoApply, isGenericChannels } = require('./lfo');
const { layerValues } = require('./looks');

// Generic profile library, named the way desks like Daslight name them:
// the letters are the channel order.
// Every profile here is a channel ORDER, not a particular product: pick the one whose
// order matches your fixture's DMX chart. Colour-engine orderings really are this
// standard across manufacturers, which is what makes generics work. Gobo, prism and
// macro orderings are not — they differ per product — so there are deliberately no
// generic spot/beam profiles to patch by mistake. Add yours from its chart instead.
const PROFILES = {
  dimmer:     { cat: '_GENERIC', channels: ['dimmer'] },
  ds:         { cat: '_GENERIC', channels: ['dimmer', 'strobe'] },
  // Dimmer, strobe, strobe speed, then colour — a very common par layout. The speed
  // channel uses the generic `speed` role, which is what the manuals call it and what
  // the attribute editor already labels correctly next to Strobe.
  dsspdrgb:   { cat: '_GENERIC', channels: ['dimmer', 'strobe', 'speed', 'r', 'g', 'b'] },
  drgb:       { cat: '_GENERIC', channels: ['dimmer', 'r', 'g', 'b'] },
  drgbl:      { cat: '_GENERIC', channels: ['dimmer', 'r', 'g', 'b', 'lime'] },
  drgbs:      { cat: '_GENERIC', channels: ['dimmer', 'r', 'g', 'b', 'strobe'] },
  drgbuv:     { cat: '_GENERIC', channels: ['dimmer', 'r', 'g', 'b', 'uv'] },
  drgbw:      { cat: '_GENERIC', channels: ['dimmer', 'r', 'g', 'b', 'w'] },
  drgbwa:     { cat: '_GENERIC', channels: ['dimmer', 'r', 'g', 'b', 'w', 'a'] },
  drgbws:     { cat: '_GENERIC', channels: ['dimmer', 'r', 'g', 'b', 'w', 'strobe'] },
  drgbwuv:    { cat: '_GENERIC', channels: ['dimmer', 'r', 'g', 'b', 'w', 'uv'] },
  drgbawuv:   { cat: '_GENERIC', channels: ['dimmer', 'r', 'g', 'b', 'a', 'w', 'uv'] },
  rgb:        { cat: '_GENERIC', channels: ['r', 'g', 'b'] },
  rgba:       { cat: '_GENERIC', channels: ['r', 'g', 'b', 'a'] },
  rgbaw:      { cat: '_GENERIC', channels: ['r', 'g', 'b', 'a', 'w'] },
  rgbawuv:    { cat: '_GENERIC', channels: ['r', 'g', 'b', 'a', 'w', 'uv'] },
  rgbd:       { cat: '_GENERIC', channels: ['r', 'g', 'b', 'dimmer'] },
  rgbds:      { cat: '_GENERIC', channels: ['r', 'g', 'b', 'dimmer', 'strobe'] },
  rgbl:       { cat: '_GENERIC', channels: ['r', 'g', 'b', 'lime'] },
  rgbs:       { cat: '_GENERIC', channels: ['r', 'g', 'b', 'strobe'] },
  rgbuv:      { cat: '_GENERIC', channels: ['r', 'g', 'b', 'uv'] },
  rgbw:       { cat: '_GENERIC', channels: ['r', 'g', 'b', 'w'] },
  rgbwa:      { cat: '_GENERIC', channels: ['r', 'g', 'b', 'w', 'a'] },
  rgbwd:      { cat: '_GENERIC', channels: ['r', 'g', 'b', 'w', 'dimmer'] },
  rgbws:      { cat: '_GENERIC', channels: ['r', 'g', 'b', 'w', 'strobe'] },
  rgbwuv:     { cat: '_GENERIC', channels: ['r', 'g', 'b', 'w', 'uv'] },
  rgby:       { cat: '_GENERIC', channels: ['r', 'g', 'b', 'y'] },
  wwcw:       { cat: '_GENERIC', channels: ['warm', 'cool'] },
  dwwcw:      { cat: '_GENERIC', channels: ['dimmer', 'warm', 'cool'] },
  dwwcws:     { cat: '_GENERIC', channels: ['dimmer', 'warm', 'cool', 'strobe'] },
  pt:         { cat: '_MOVING',  channels: ['pan', 'tilt'] },
  ptrgb:      { cat: '_MOVING',  channels: ['pan', 'tilt', 'r', 'g', 'b'] },
  ptdrgb:     { cat: '_MOVING',  channels: ['pan', 'tilt', 'dimmer', 'r', 'g', 'b'] },
  ptdrgbw:    { cat: '_MOVING',  channels: ['pan', 'tilt', 'dimmer', 'r', 'g', 'b', 'w'] },
  ptdrgbws:   { cat: '_MOVING',  channels: ['pan', 'tilt', 'dimmer', 'r', 'g', 'b', 'w', 'strobe'] },
  // 16-bit pan/tilt. Each fine channel follows its coarse one — that ordering is standard.
  pptt:       { cat: '_MOVING',  channels: ['pan', 'panFine', 'tilt', 'tiltFine'] },
  ppttdrgb:   { cat: '_MOVING',  channels: ['pan', 'panFine', 'tilt', 'tiltFine', 'dimmer', 'r', 'g', 'b'] },
  ppttdrgbw:  { cat: '_MOVING',  channels: ['pan', 'panFine', 'tilt', 'tiltFine', 'dimmer', 'r', 'g', 'b', 'w'] },
  ppttdrgbws: { cat: '_MOVING',  channels: ['pan', 'panFine', 'tilt', 'tiltFine', 'dimmer', 'r', 'g', 'b', 'w', 'strobe'] },
};
const labelFor = (name, channels) =>
  `${name} (${channels.length} Channel${channels.length === 1 ? '' : 's'})`;

for (const [name, p] of Object.entries(PROFILES)) {
  p.label = labelFor(name, p.channels);
  p.builtin = true;      // cannot be edited or deleted; custom profiles can
}

// ---- custom profiles --------------------------------------------------------
// Fixtures you build yourself, by choosing channels in order. They live in the same
// registry as the built-ins, so render, patching and the attribute editor treat them
// identically — a custom profile is not a second class of thing.
//
// Names are compared case-insensitively against everything already registered: two
// profiles differing only in case would be indistinguishable in the library and one
// would silently shadow the other in the patch.
const PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,23}$/;

function validateProfile(name, channels) {
  if (typeof name !== 'string' || !PROFILE_NAME_RE.test(name.trim())) {
    return 'a name of 1–24 characters, letters and numbers to start';
  }
  if (!Array.isArray(channels) || channels.length < 1) return 'at least one channel';
  if (channels.length > 512) return 'no more than 512 channels';
  for (const role of channels) {
    // Roles are keys in every fixture's values and are written into the page's markup;
    // the same alphabet as profile names, no spaces, so neither place can be surprised.
    if (typeof role !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/.test(role)) {
      return 'every channel needs a name of 1–24 letters, numbers, _ or -';
    }
  }
  // A fixture's values are keyed by role, so the same role twice is one value driving two
  // channels: move one and the other moves with it, for no reason anybody could see from
  // the patch. Real charts with two of a thing (two prisms, two focus channels) are
  // exactly where this bites, so it has to be refused rather than accepted and rendered
  // wrong. The spare aux roles exist to give those channels separate identities.
  const seen = new Set();
  for (const role of channels) {
    const key = role.trim().toLowerCase();
    if (seen.has(key)) {
      return `each channel to be a different role — "${role.trim()}" is used twice, and both `
        + 'would move together. Use aux1…aux8 for channels that have no specific role';
    }
    seen.add(key);
  }
  return null;
}

function findProfile(name) {
  const want = String(name).trim().toLowerCase();
  return Object.keys(PROFILES).find((k) => k.toLowerCase() === want) || null;
}

// Returns the registered name, or throws with a message meant to be shown to a person.
function addProfile(name, channels, { cat = '_CUSTOM', replace = false, defaults = null } = {}) {
  const problem = validateProfile(name, channels);
  if (problem) throw new Error(`a fixture needs ${problem}`);
  const clean = name.trim();
  const existing = findProfile(clean);
  if (existing && PROFILES[existing].builtin) {
    throw new Error(`"${existing}" is a built-in fixture and cannot be replaced`);
  }
  if (existing && !replace) throw new Error(`"${existing}" already exists`);
  const key = existing || clean;
  // Only defaults for roles the profile actually has, and only real 0-255 values —
  // a default for a channel that is not there would sit in show.json forever doing nothing.
  const defs = {};
  const roles = new Set(channels.map((r) => String(r).trim()));
  for (const [role, v] of Object.entries(defaults || {})) {
    if (roles.has(role) && Number.isFinite(+v)) defs[role] = Math.max(0, Math.min(255, +v | 0));
  }
  PROFILES[key] = {
    cat, channels: channels.map((r) => String(r).trim()),
    label: labelFor(key, channels), custom: true,
    defaults: Object.keys(defs).length ? defs : undefined,
  };
  return key;
}

function removeProfile(name) {
  const key = findProfile(name);
  if (!key) return false;
  if (PROFILES[key].builtin) return false;
  delete PROFILES[key];
  return true;
}

function customProfiles() {
  return Object.entries(PROFILES)
    .filter(([, p]) => p.custom)
    .map(([name, p]) => ({ name, channels: p.channels, cat: p.cat, defaults: p.defaults }));
}

const {
  ROLE_DEFAULTS, LIGHT_ROLES, LEVEL_ROLES, POSITION_ROLES, FINE_ROLES, roleKind, roleKinds,
} = require('./roles');

const DEFAULT_LIMITS = {
  dimMin: 0, dimMax: 255,
  panMin: 0, panMax: 255, tiltMin: 0, tiltMax: 255,
  invertPan: false, invertTilt: false, swapPT: false,
};

let nextId = 1;
let nextSceneId = 1;
function makeFixture(f = {}) {
  const profile = PROFILES[f.profile] ? f.profile : 'rgb';
  const values = {};
  // A profile may override the generic default for a role it uses. This exists for one
  // real reason: on a lot of moving heads the shutter sits on the `strobe` channel and 0
  // means CLOSED, so a head patched with the generic default comes up dark no matter how
  // far its dimmer is pushed — and a dark fixture with a correct patch looks like a dead
  // fixture. The chart says what the safe resting value is; this is where it goes.
  const own = PROFILES[profile].defaults || {};
  for (const role of PROFILES[profile].channels) {
    values[role] = own[role] != null ? own[role] : ROLE_DEFAULTS[role];
  }
  values.dimmer = f.values && f.values.dimmer != null ? f.values.dimmer : 255;
  return {
    id: f.id || `fx${Date.now().toString(36)}${nextId++}`,
    index: f.index || 1,
    name: f.name || profile,
    universe: Number.isInteger(f.universe) ? f.universe : 0,
    address: Math.min(512, Math.max(1, Math.round(+f.address) || 1)),
    profile,
    on: f.on !== false,
    x: f.x != null ? f.x : 0.1,
    y: f.y != null ? f.y : 0.5,
    values: { ...values, ...(f.values || {}) },
    limits: { ...DEFAULT_LIMITS, ...(f.limits || {}) },
  };
}

function clamp8(v) { return Math.max(0, Math.min(255, Math.round(v))); }
function mapRange(v, lo, hi) { return lo + (hi - lo) * (v / 255); }

// ---- audio-reactive config --------------------------------------------------
// The one set of clamps for an audioCfg, shared by POST /api/audiocfg, scene recall and
// editing a saved scene — it lives here (not server.js) because recallScene applies it,
// and there must be exactly one answer to "what is a valid audio setup".
const AUDIO_MODES = ['level', 'bass', 'beat-pump', 'bands'];
function sanitizeAudioCfg(cfg) {
  const c = cfg || {};
  const num = (v, lo, hi, dflt) => {
    const n = +v;
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : dflt;
  };
  return {
    enabled: !!c.enabled,
    mode: AUDIO_MODES.includes(c.mode) ? c.mode : 'level',
    amount: num(c.amount, 0, 255, 255),
    release: num(c.release, 50, 2000, 300),
    // Trust mic-detected beats? Off, 'beat-pump' pumps on a steady metronome from the
    // FX clock instead — for when the desk mic is too far from the PA to hear beats
    // reliably. Defaults ON, so every existing config keeps its behaviour.
    useBeats: c.useBeats == null ? true : !!c.useBeats,
  };
}

class Engine {
  constructor(state) {
    this.state = state;
    this.live = new Map();      // universe -> Float64Array(512), what is on the wire
    this.idle = new Map();      // universe -> ticks spent transmitting zeros with nothing patched
    this.fade = null;
    this.chase = { running: false, index: 0, nextAt: 0 };
    // Audio envelope: attack-instant, release-decay. Lives on the engine, not the state,
    // because it is derived motion — nothing about it belongs in show.json.
    this.audioEnv = { level: 0, low: 0, mid: 0, high: 0, last: 0 };
  }

  universes() {
    const set = new Set();
    for (const f of this.state.fixtures) if (Number.isInteger(f.universe)) set.add(f.universe);
    for (const key of Object.keys(this.state.raw)) {
      const u = Number(key.split(':')[0]);
      if (Number.isInteger(u) && u >= 0) set.add(u);
    }
    if (set.size === 0) set.add(0);
    return [...set].sort((a, b) => a - b);
  }

  buffer(map, universe) {
    if (!map.has(universe)) map.set(universe, new Float64Array(512));
    return map.get(universe);
  }

  // Render the declarative state into DMX values (0..255, pre-fade).
  // `now` is a parameter rather than a call to Date.now() in here so an FX frame can be
  // rendered at an exact millisecond in a test.
  render(state = this.state, now = Date.now()) {
    const out = new Map();
    for (const u of this.universes()) this.buffer(out, u);
    const master = state.blackout ? 0 : (state.master ?? 255) / 255;
    // FX are one more multiplier on the fixture's level, applied at exactly the point the
    // master is applied — so a fixture with a real dimmer channel gets the effect on that
    // channel and nowhere else, instead of being scaled on its colours as well. Blackout
    // needs no special case: it has already made `master` zero, and zero wins.
    const fxOn = fxActive(state.fx);
    const order = fxOn ? fxOrder(state.fixtures) : null;
    // Profiles the effects are told to leave alone: their fixtures render at a flat 255
    // FX/audio multiplier. The master still applies — exclusion is from the EFFECTS, not
    // from the grand fader.
    const excluded = new Set(Array.isArray(state.fx && state.fx.exclude) ? state.fx.exclude : []);
    // LFO modulation is computed against the scene values and read through `val` below —
    // fixture.values itself is never written, so the saved look survives every oscillation.
    const lfoMap = lfoApply(state.lfos, state.fixtures, state.fx && state.fx.bpm, now,
      (f) => (PROFILES[f.profile] || PROFILES.rgb).channels);
    // The layer stack, composited into fixtureId -> { role: value }. Null when no layer
    // is running, and then every line below reads exactly as it did before layers
    // existed: the fixtures' own values are the look. A desk with an empty stack cannot
    // tell this file is here, which is the property that let it land on a live rig.
    // The tempo the operator tapped drives the stack too, not only the FX engine —
    // one clock, so Tap retimes every running look at the same moment.
    const stack = layerValues(state, state.fixtures, now, state.fx && state.fx.bpm);
    const audioOn = this.audioActive(state, now);
    if (audioOn) this.audioTick(state, now);
    // IDENTIFY — "which lamp in this room is fixture 7?". It beats the stack, the LFOs
    // and the FX, because the entire point is that it is unmistakable across a dark
    // room; it still rides the master and blackout, so the panic key still reaches it.
    // Nothing is written to the fixture: the flash is computed here and forgotten, so
    // whatever look was running is exactly where it was when the timer runs out.
    const ident = (fixtureId) => {
      const until = state.identify ? state.identify[fixtureId] : null;
      if (!until || until < now) return null;
      return Math.floor(now / 250) % 2 === 0 ? 1 : 0;   // two flashes a second
    };
    // Channels belonging to all-generic-channel fixtures (lasers): a raw hold on one of
    // these must NOT be master-scaled below — 64 scaled to 32 switches the laser's mode.
    let genericCells = null;

    for (const f of state.fixtures) {
      const profile = PROFILES[f.profile] || PROFILES.rgb;
      const lim = f.limits || DEFAULT_LIMITS;
      const buf = this.buffer(out, f.universe);
      const hasDimmerCh = profile.channels.includes('dimmer');
      const generic = isGenericChannels(profile.channels);
      // No FX and no audio ever scale an excluded profile, and never a generic-only one:
      // a laser's channels are mode switches, and scaling a mode switch changes the mode.
      const noScale = generic || excluded.has(f.profile);
      const lv = lfoMap ? lfoMap.get(f.id) : null;
      const sv = stack ? stack.get(f.id) : null;
      // What this fixture is being told, in order of who has the last word: the layer
      // stack, then an LFO, then the fixture's own stored value. The stack sits on top
      // because a layer IS the thing an operator raised a fader on.
      const val = (role) => {
        if (sv && sv[role] != null) return sv[role];
        if (lv && lv[role] != null) return lv[role];
        return f.values[role];
      };
      const flash = ident(f.id);
      const level = flash != null ? flash * 255 : (f.on === false ? 0 : (val('dimmer') ?? 255));
      const dim = mapRange(level, lim.dimMin, lim.dimMax) / 255;
      let lvl = master;
      if (fxOn && !noScale) {
        lvl *= fxLevel(state.fx, f, order.get(f.id) ?? 0, state.fixtures.length, now) / 255;
      }
      if (audioOn && !noScale) lvl *= this.audioMult(state, f, profile, now) / 255;

      profile.channels.forEach((role, i) => {
        const ch = f.address - 1 + i;
        if (ch < 0 || ch > 511) return;
        if (generic) {
          if (!genericCells) genericCells = new Set();
          genericCells.add(f.universe + ':' + (ch + 1));
        }
        let v;
        const kind = roleKind(role);
        if (kind === 'level') {
          v = dim * 255 * lvl;
        } else if (kind === 'position') {
          const src = lim.swapPT ? (role === 'pan' ? 'tilt' : 'pan') : role;
          let raw = val(src) ?? 128;
          const inv = role === 'pan' ? lim.invertPan : lim.invertTilt;
          if (inv) raw = 255 - raw;
          v = role === 'pan' ? mapRange(raw, lim.panMin, lim.panMax) : mapRange(raw, lim.tiltMin, lim.tiltMax);
        } else if (kind === 'emitter') {
          // Master and FX ride the dimmer channel when the fixture has one, so neither may
          // be applied to the colour channels as well — that would scale the lamp twice.
          // Identify forces white: a par sitting on deep blue at zero would otherwise
          // flash its dimmer against a colour that emits almost nothing, which is not a
          // lamp you can find. UV and lime stay out of it — they are not white light.
          const held = (role === 'uv' || role === 'lime') ? 0 : 255;
          const base = flash != null ? held * flash : (val(role) ?? ROLE_DEFAULTS[role] ?? 0);
          v = base * (hasDimmerCh ? 1 : lvl * dim);
        } else {
          v = val(role) ?? ROLE_DEFAULTS[role] ?? 0;   // control and fine pass through
        }
        buf[ch] = clamp8(v);
      });
    }

    // Raw channel overrides sit on top of the fixtures, and ride the master and blackout
    // like everything else. They used to bypass both, so a shutter could be parked through
    // a blackout — but once manual channels became a control surface of their own (the
    // Fader page), a panic button that could not reach them was the greater danger.
    // Patched moving heads still hold pan/tilt through a blackout: that is the position
    // rule above, on the fixture path, and it is untouched by this.
    for (const [key, value] of Object.entries(state.raw)) {
      const [u, ch] = key.split(':').map(Number);
      if (!Number.isInteger(u) || u < 0 || !(ch >= 1 && ch <= 512) || !Number.isFinite(value)) continue;
      const buf = this.buffer(out, u);
      // A raw hold on a channel belonging to an all-generic-channel fixture (a laser)
      // passes through UNSCALED: those values are mode selectors, and master-scaling one
      // would switch the laser's program instead of dimming anything.
      const scale = genericCells && genericCells.has(key) ? 1 : master;
      buf[ch - 1] = clamp8(value * scale);
    }
    return out;
  }

  // ---- audio-reactive -------------------------------------------------------
  // Live only while the meter keeps feeding: stale input (>1.5s) means the multiplier is
  // 255 exactly and the rig belongs to the scene again.
  audioActive(state, now) {
    const cfg = state.audioCfg;
    const a = state.audio;
    return !!(cfg && cfg.enabled && a && (now - (a.lastAt || 0)) < 1500);
  }

  // Attack-instant / release-decay envelopes over the four inputs, advanced once per
  // rendered frame — following the raw waveform directly would flicker the rig.
  audioTick(state, now) {
    const a = state.audio || {};
    const cfg = state.audioCfg || {};
    const env = this.audioEnv;
    const dt = Math.max(0, Math.min(250, now - (env.last || now)));
    env.last = now;
    const rel = Math.max(50, Math.min(2000, +cfg.release || 300));
    for (const k of ['level', 'low', 'mid', 'high']) {
      const input = Math.max(0, Math.min(1, +a[k] || 0));
      env[k] = Math.max(input, Math.max(0, (env[k] || 0) - dt / rel));
    }
  }

  // 0..255 multiplier for one fixture, same contract as fxLevel: 255 means untouched.
  audioMult(state, f, profile, now) {
    const cfg = state.audioCfg || {};
    let amount = +cfg.amount;
    if (!Number.isFinite(amount)) amount = 255;
    amount = Math.max(0, Math.min(255, amount));
    const mix = (env01) => Math.floor(255 - amount + amount * Math.max(0, Math.min(1, env01)));
    switch (cfg.mode) {
      case 'bass':
        return mix(this.audioEnv.low);
      case 'beat-pump': {
        // The techno pump, audio-triggered: full hit on each reported beat, quadratic
        // decay over one beat of the FX clock — the same curve as the 'pump' FX.
        // With useBeats off the mic's beats are not trusted at all: the pump runs as a
        // steady metronome on the FX clock instead, hitting at every beat boundary.
        // Freshness still gates it either way (audioMult is only reached while the mic
        // streams), so a dead mic never leaves a metronome throbbing on its own.
        const bpm = Math.max(20, Math.min(300, ((state.fx && state.fx.bpm) | 0) || 120));
        const beatMs = 60000 / bpm;
        let p;
        if (cfg.useBeats === false) {
          p = (now % beatMs) / beatMs;
        } else {
          const a = state.audio || {};
          p = a.beatAt ? Math.min(1, Math.max(0, (now - a.beatAt) / beatMs)) : 1;
        }
        return mix((1 - p) * (1 - p));
      }
      case 'bands': {
        // Washes only — a static lamp head-on. A wash here is a fixture with light to
        // scale (a dimmer or emitters) and no pan/tilt; moving heads and generic-channel
        // fixtures sit this one out entirely.
        const ch = profile.channels;
        const wash = !ch.includes('pan') && !ch.includes('tilt')
          && ch.some((r) => r === 'dimmer' || roleKind(r) === 'emitter');
        if (!wash) return 255;
        const x = f.x != null ? +f.x : 0.5;
        const band = x < 0.33 ? 'low' : x < 0.66 ? 'mid' : 'high';
        return mix(this.audioEnv[band]);
      }
      case 'level':
      default:
        return mix(this.audioEnv.level);
    }
  }

  snapshotLive() {
    const copy = new Map();
    for (const [u, buf] of this.live) copy.set(u, Float64Array.from(buf));
    return copy;
  }

  startFade(ms) {
    // A fade time that is not a number was the whole rig going dark: t became NaN, the
    // fade never ended, and every channel was written NaN — clamped to 0 — for ever.
    const n = +ms;
    if (!Number.isFinite(n) || n <= 0) { this.fade = null; return; }
    this.fade = { from: this.snapshotLive(), start: Date.now(), ms: Math.min(60000, n) };
  }

  cancelFade() { this.fade = null; }

  tick() {
    this.tickChase();
    const target = this.render();
    // A universe that has lost its last fixture has to keep transmitting zeros. Dropping it
    // from the output would leave the node holding its last frame — those lamps stay lit and
    // blackout cannot reach them, because nothing renders for that universe any more.
    for (const u of this.live.keys()) {
      if (target.has(u)) { this.idle.delete(u); continue; }
      // …but not for ever. Once a node has seen two seconds of zeros it is dark and will
      // stay dark; a universe that nothing patches or holds any more is then dropped, so
      // a stray universe number typed once does not cost a 512-channel frame a tick for
      // the rest of the show.
      const n = (this.idle.get(u) || 0) + 1;
      if (n > 80) { this.live.delete(u); this.idle.delete(u); continue; }
      this.idle.set(u, n);
      target.set(u, new Float64Array(512));
    }
    if (this.fade) {
      const t = (Date.now() - this.fade.start) / this.fade.ms;
      if (!(t < 1)) this.fade = null;
      else {
        for (const [u, tgt] of target) {
          const from = this.fade.from.get(u) || new Float64Array(512);
          const cur = this.buffer(this.live, u);
          for (let i = 0; i < 512; i++) cur[i] = from[i] + (tgt[i] - from[i]) * t;
        }
        return this.toBuffers();
      }
    }
    for (const [u, tgt] of target) this.buffer(this.live, u).set(tgt);
    return this.toBuffers();
  }

  toBuffers() {
    const out = new Map();
    for (const [u, f] of this.live) {
      const b = Buffer.alloc(512);
      for (let i = 0; i < 512; i++) b[i] = clamp8(f[i]);
      out.set(u, b);
    }
    return out;
  }

  // ---- patching -----------------------------------------------------------
  nextIndex() {
    return this.state.fixtures.reduce((m, f) => Math.max(m, f.index || 0), 0) + 1;
  }

  // Lowest address in the universe with room for `width` free channels.
  nextFreeAddress(universe, width) {
    const used = new Uint8Array(513);
    for (const f of this.state.fixtures) {
      if (f.universe !== universe) continue;
      const w = (PROFILES[f.profile] || PROFILES.rgb).channels.length;
      for (let c = f.address; c < f.address + w && c <= 512; c++) used[c] = 1;
    }
    for (let a = 1; a + width - 1 <= 512; a++) {
      let free = true;
      for (let c = a; c < a + width; c++) if (used[c]) { free = false; break; }
      if (free) return a;
    }
    return null;
  }

  // ---- scenes -------------------------------------------------------------
  captureScene(name) {
    return {
      // Time alone collided: two saves in one millisecond (a double-tap, a test on a fast
      // loopback) got one id, so delete removed both and recall reached only the first.
      id: `sc${Date.now().toString(36)}${(nextSceneId++).toString(36)}`,
      name: name || `Scene ${this.state.scenes.length + 1}`,
      fadeMs: 1000,
      fixtures: this.state.fixtures.map((f) => ({ id: f.id, on: f.on, values: { ...f.values } })),
      raw: { ...this.state.raw },
      // Deep enough copies that editing the live fx/LFOs later can never reach back into
      // a scene that was captured before the edit.
      fx: { ...this.state.fx, exclude: [...((this.state.fx && this.state.fx.exclude) || [])] },
      lfos: JSON.parse(JSON.stringify(this.state.lfos || [])),
      // The audio-reactive setup is part of the look too. Guarded rather than spread
      // unconditionally: a bare state with no audioCfg must not stamp `{}` on the scene,
      // because recall treats any audioCfg object as "replace the live setup".
      audioCfg: this.state.audioCfg ? { ...this.state.audioCfg } : undefined,
    };
  }

  recallScene(scene, fadeMs) {
    if (!scene) return false;
    this.startFade(fadeMs != null ? fadeMs : scene.fadeMs);
    for (const sf of scene.fixtures) {
      const f = this.state.fixtures.find((x) => x.id === sf.id);
      if (f) { f.on = sf.on !== false; Object.assign(f.values, sf.values); }
    }
    this.state.raw = { ...scene.raw };
    // A scene that knows its FX brings it along; an old scene without one leaves the
    // running effect alone, so recalling it never yanks a live effect out from under the rig.
    // The TEMPO is the one field a scene never brings: bpm belongs to the operator (Tap /
    // the BPM field) and has to survive every recall, or a beat-matched rig drifts off the
    // music each time a look changes. Scenes carry mode/depth/spatial/exclude/enabled.
    if (scene.fx) {
      if (!this.state.fx) this.state.fx = {};
      const liveBpm = this.state.fx.bpm;
      const liveExclude = Array.isArray(this.state.fx.exclude) ? this.state.fx.exclude.slice() : [];
      Object.assign(this.state.fx, scene.fx);
      if (liveBpm != null) this.state.fx.bpm = liveBpm;
      // The exclude list protects fixtures (the beams) from every effect. A scene that
      // carries one sets it; a scene saved without one leaves the live list alone rather
      // than silently clearing it — an fx with no list used to recall as "exclude nothing".
      this.state.fx.exclude = Array.isArray(scene.fx.exclude) ? scene.fx.exclude.slice() : liveExclude;
    }
    // Same rule for the LFOs: a scene that captured them replaces the whole list, a scene
    // from before LFOs existed leaves the running ones alone.
    if (Array.isArray(scene.lfos)) this.state.lfos = JSON.parse(JSON.stringify(scene.lfos));
    // And again for the audio setup: replaced whole through the same clamps the live
    // route applies, so a hand-edited show.json cannot recall an invalid config; a scene
    // without one leaves the current setting alone.
    if (scene.audioCfg) this.state.audioCfg = sanitizeAudioCfg(scene.audioCfg);
    this.state.activeScene = scene.id;
    return true;
  }

  tickChase() {
    const c = this.state.chase;
    if (!c.enabled || c.sceneIds.length === 0) { this.chase.running = false; return; }
    const now = Date.now();
    if (!this.chase.running) { this.chase.running = true; this.chase.index = -1; this.chase.nextAt = now; }
    if (now < this.chase.nextAt) return;
    this.chase.index = (this.chase.index + 1) % c.sceneIds.length;
    const scene = this.state.scenes.find((s) => s.id === c.sceneIds[this.chase.index]);
    if (scene) this.recallScene(scene, c.fadeMs);
    this.chase.nextAt = now + Math.max(50, c.holdMs);
  }
}

module.exports = {
  Engine, PROFILES, makeFixture, DEFAULT_LIMITS,
  ROLE_DEFAULTS, LIGHT_ROLES, roleKind, roleKinds,
  addProfile, removeProfile, customProfiles, validateProfile, findProfile,
  AUDIO_MODES, sanitizeAudioCfg,
};
