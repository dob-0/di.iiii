'use strict';
// Local Art-Net light controller: HTTP UI on localhost, DMX out over UDP.

// How far a fixture can be dragged from the room. The room itself is 0..1 — what
// looks.js's spatial fan and the old fx.js radar/x/y modes read as "the venue" — but the
// stage is a canvas, not a fixed floor plan: a rig with a truss run or a followspot
// position off to one side needs somewhere past the walls to put it. 1000 is not
// infinite, it is "never hit the edge arranging a real rig" while keeping a fixture's
// position a plain finite number on the wire and in the show file.
const WORLD = 1000;

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const { ArtNet, broadcastAddresses, localAddresses } = require('./artnet');
const { Enttec, listPorts, describePort, PORT_NAME, DEFAULT_PORT } = require('./enttec');
const {
  Engine, PROFILES, makeFixture, DEFAULT_LIMITS, roleKinds, ROLE_DEFAULTS,
  addProfile, removeProfile, customProfiles, findProfile,
  AUDIO_MODES, sanitizeAudioCfg,
} = require('./engine');
const { FX_MODES, FX_SPATIAL, DEFAULT_FX, sanitizeFxPatch, fxActive } = require('./fx');
const { sanitizeLfos, LFO_WAVES, isGenericChannels } = require('./lfo');
const { STYLES: FAN_STYLES, fanValues } = require('./fan');
const library = require('./library');
const { SACN } = require('./sacn');
const {
  sanitizeLook, sanitizeLooks, sanitizeLayer, sanitizeLayers,
  KINDS: LOOK_KINDS, MERGES: LAYER_MERGES, SCOPES: LOOK_SCOPES, SPATIAL: LOOK_SPATIAL, kindAllows,
} = require('./looks');

// The desk as a module. `createDesk` builds one lighting desk — state, engine, the 40 Hz
// output loop, the HTTP routes and the interface files — and hands back `handle`, which
// answers a request for a path relative to wherever the desk is mounted. `standalone.js`
// puts it on a port of its own (the club desk); di.iiii mounts it at /light.
function createDesk(opts = {}) {
  const DATA = opts.dataDir || path.join(__dirname, 'data');
  const PUBLIC = opts.uiDir || path.join(__dirname, 'ui');
  const SHOW = path.join(DATA, 'show.json');
  const SHOW_PREV = path.join(DATA, 'show.prev.json');
  // The fixture catalogue, cached beside the show so it survives a night with no wifi.
  const LIBRARY_DIR = path.join(DATA, 'library');
  // Offline renders everything and transmits nothing — tests, and a desk with no rig.
  const offline = !!opts.offline;
  const bindPort = opts.bindPort == null ? null : Number(opts.bindPort);
  const outputEnabledDefault = opts.outputEnabledDefault !== false;
  const lanAllowed = opts.lanAllowed !== false;
  const log = opts.log || console.log;
  // True when this desk found no show to load. It stays true only until the first write,
  // and it is what stops an empty desk from silently replacing a real one.
  let bootedWithNothing = false;

  const DEFAULT_STATE = {
    master: 255,
    blackout: false,
    fixtures: [],
    groups: [],
    raw: {},
    scenes: [],
    activeScene: null,
    chase: { enabled: false, sceneIds: [], holdMs: 2000, fadeMs: 800 },
    midi: { maps: [] },
    // The content model: looks are lists of steps, layers are looks under a finger.
    // Both empty means the desk renders exactly as it did before they existed.
    looks: [],
    layers: [],
    // driver picks which wire the frames leave on: 'artnet' over UDP, or 'enttec' for a
    // DMX USB PRO on a serial port. They are mutually exclusive because the widget owns
    // its port outright and Art-Net gear does not exist on the same cable.
    // `manual` is the devices added by hand as {ip, name}. Discovery cannot be the only way
    // into the device list: plenty of Art-Net gear never answers an ArtPoll, and a show
    // network has no DHCP or internet — the address is known in advance and typed in.
    // The house light controller is a wifi access point: it deals out 192.168.4.x and sits
    // on .1 itself, which is where its Art-Net has to go. It is seeded here rather than
    // waiting to be typed because it is the one address that is always the same — a show
    // with no defaults asks you to remember an IP in the dark. Remove it and it stays gone.
    output: { driver: 'artnet', serialPort: DEFAULT_PORT, mode: 'broadcast', targets: [], enabled: true,
      // sACN's priority, 0..200. Two senders on one universe stop being a coin toss:
      // the higher number wins and the receiver ignores the other, which is the thing
      // Art-Net cannot express at all.
      priority: 100,
      manual: [{ ip: '192.168.4.1', name: 'Light controller' }], port: 6454, refreshHz: 40,
      // MORE THAN ONE DEVICE AT ONCE. `driver` above is the desk's main output and is
      // untouched; each entry here is another device sending alongside it, with its own
      // driver, its own destination and its own list of universes. That is what a rig on
      // two universes actually looks like when the venue has one Art-Net node and you
      // brought a USB widget — or two widgets, one per universe, because a widget is one
      // DMX line and always will be. Empty `universes` means "everything this desk has".
      extra: [] },
    // The effects engine. The defaults live in fx.js next to the maths that reads them, so
    // there is one answer to "what is depth when nobody has set it" rather than two.
    fx: { ...DEFAULT_FX },
    // Low-frequency oscillators: modulation riding on the scene in the render path. The
    // list is replaced whole by POST /api/lfos and captured/recalled with scenes.
    lfos: [],
    // Audio-reactive configuration persists; the live audio LEVELS do not — they arrive
    // many times a second and are attached to `state` as a non-enumerable property below,
    // which is what keeps them out of every JSON.stringify(state) forever.
    audioCfg: { enabled: false, mode: 'level', amount: 255, release: 300, useBeats: true },
    customProfiles: [],
    // Live sets: named, ordered scene playlists for running a planned show from the Touch
    // page. They reference scenes by id and tolerate dead references — the player shows a
    // missing step rather than silently renumbering the operator's set list mid-show.
    sets: [],
  };

  function sanitizeSets(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 50).map((s) => ({
      id: typeof s?.id === 'string' && s.id ? s.id.slice(0, 40) : 'set' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: String(s?.name || 'Set').slice(0, 40),
      sceneIds: (Array.isArray(s?.sceneIds) ? s.sceneIds : [])
        .filter((id) => typeof id === 'string' && id).slice(0, 1000),
    }));
  }

  // AUDIO_MODES and sanitizeAudioCfg live in engine.js now — recallScene applies the same
  // clamps this file's routes do, and there must be exactly one copy of them.

  // The volatile half of audio-reactive: fed by POST /api/audio, read by the render loop,
  // never written to disk. Non-enumerable so save()'s JSON.stringify cannot see it.
  function attachAudio(s) {
    delete s.audio;   // in case a hand-edited show.json carried one in
    Object.defineProperty(s, 'audio', {
      value: { level: 0, low: 0, mid: 0, high: 0, beatAt: 0, bpm: null, lastAt: 0 },
      enumerable: false, writable: true, configurable: true,
    });
    // Identify is the same shape of thing: fixtureId -> the millisecond it stops
    // flashing. A saved show that came back with lamps flashing would be a haunting.
    delete s.identify;
    Object.defineProperty(s, 'identify', {
      value: {}, enumerable: false, writable: true, configurable: true,
    });
    return s;
  }

  // Address validation lives in one place because a rejected address has to be rejected the
  // same way everywhere: 2.0.0.10 is a perfectly ordinary Art-Net address and 300.1.1.1 is
  // not an address at all, and the difference must not depend on which route you came in by.
  const IPV4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  // A port name in this platform's spelling: COMn on Windows, a /dev path elsewhere.
  const portName = (p) => (process.platform === 'win32' ? String(p).trim().toUpperCase() : String(p).trim());

  function validIp(v) {
    if (typeof v !== 'string') return null;
    const ip = v.trim();
    if (!IPV4.test(ip)) return null;
    return ip.split('.').every((o) => Number(o) <= 255) ? ip : null;
  }

  function normaliseManual(list) {
    const out = [];
    for (const entry of Array.isArray(list) ? list : []) {
      const ip = validIp(typeof entry === 'string' ? entry : entry && entry.ip);
      if (!ip || out.some((m) => m.ip === ip)) continue;
      const name = entry && typeof entry.name === 'string' ? entry.name.trim().slice(0, 40) : '';
      out.push({ ip, name });
    }
    return out;
  }

  // A scene as stored. Anything that is not one is dropped at load, because a malformed
  // entry did not fail at boot — it threw inside the chase tick, from a timer, and took
  // the process with it.
  function sanitizeScene(s) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id) return null;
    const fixtures = (Array.isArray(s.fixtures) ? s.fixtures : [])
      .filter((sf) => sf && typeof sf === 'object' && sf.id != null)
      .map((sf) => ({ id: String(sf.id), on: sf.on !== false, values: sanitizeValues(sf.values) }));
    const out = {
      ...s,
      id: s.id.slice(0, 40),
      name: String(s.name || 'Scene').slice(0, 60),
      fadeMs: Number.isFinite(+s.fadeMs) ? Math.max(0, Math.min(60000, Math.round(+s.fadeMs))) : 1000,
      fixtures,
      raw: sanitizeRaw(s.raw),
    };
    if (s.fx && typeof s.fx === 'object') out.fx = withoutExcludeIfAbsent(sanitizeFxPatch({ ...DEFAULT_FX }, s.fx), s.fx);
    else delete out.fx;
    if (s.lfos != null) { const l = sanitizeLfos(s.lfos); if (l) out.lfos = l; else delete out.lfos; }
    if (s.audioCfg && typeof s.audioCfg === 'object') out.audioCfg = sanitizeAudioCfg(s.audioCfg);
    else delete out.audioCfg;
    return out;
  }

  // sanitizeFxPatch fills a missing exclude from its `current` — for a stored scene that is
  // DEFAULT_FX, i.e. []. Absent stays absent, so recall can tell "no opinion" from "none".
  function withoutExcludeIfAbsent(fx, given) {
    if (!Array.isArray(given && given.exclude)) delete fx.exclude;
    return fx;
  }

  // The show file, or the newest complete copy of it. Order: the file itself; a finished
  // temp file whose rename was interrupted; the previous save. A truncated file is never
  // the reason for an empty desk while a complete one is sitting next to it.
  function readShow() {
    let firstError = null;
    for (const file of [SHOW, SHOW + '.tmp', SHOW_PREV]) {
      if (!fs.existsSync(file)) continue;
      try {
        const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (file !== SHOW) log('  show.json was unreadable; loaded ' + path.basename(file) + ' instead');
        return disk;
      } catch (e) { if (!firstError) firstError = e; }
    }
    if (firstError) throw firstError;
    const e = new Error('no show file'); e.code = 'ENOENT'; throw e;
  }

  function loadState() {
    try {
      const disk = readShow();
      const s = { ...DEFAULT_STATE, ...disk };
      s.chase = { ...DEFAULT_STATE.chase, ...(disk.chase || {}) };
      // A show file saved with the chase armed but no steps is a landmine: the first scene
      // added to the list would start a chase instantly. An empty chase is never armed.
      if (!Array.isArray(s.chase.sceneIds)) s.chase.sceneIds = [];
      if (s.chase.sceneIds.length === 0) s.chase.enabled = false;
      s.output = { ...DEFAULT_STATE.output, ...(disk.output || {}) };
      // The wire switch. A show file from before it existed takes the desk's default:
      // ON standing alone (the club desk must come back transmitting after a restart),
      // OFF inside di.iiii (a dev server must never broadcast on a studio network).
      s.output.enabled = disk.output && disk.output.enabled != null ? !!disk.output.enabled : outputEnabledDefault;
      s.output.manual = normaliseManual(s.output.manual);
      // Every extra device goes back through the same clamps the route uses, so a show
      // file edited by hand cannot smuggle in a send the live route would have refused.
      s.output.extra = (Array.isArray(disk.output && disk.output.extra) ? disk.output.extra : [])
        .slice(0, 16).map((raw) => sanitizeSend(raw, raw)).filter(Boolean);
      s.fx = { ...DEFAULT_STATE.fx, ...(disk.fx || {}) };
      s.fx.exclude = Array.isArray(s.fx.exclude)
        ? s.fx.exclude.filter((p) => typeof p === 'string' && p).slice(0, 20)
        : [];
      s.lfos = sanitizeLfos(disk.lfos) || [];
      s.audioCfg = sanitizeAudioCfg({ ...DEFAULT_STATE.audioCfg, ...(disk.audioCfg || {}) });
      s.sets = sanitizeSets(disk.sets);
      s.midi = sanitizeMidi(disk.midi) || { maps: [] };
      s.looks = sanitizeLooks(disk.looks) || [];
      s.layers = sanitizeLayers(disk.layers) || [];

      // Custom profiles MUST be registered before the fixtures are built. makeFixture falls
      // back to `rgb` for a profile it does not know, so loading them in the other order
      // would silently turn every custom fixture into a 3-channel RGB one — the patch would
      // come back from disk quietly wrong, which is the worst way to lose a rig.
      for (const p of disk.customProfiles || []) {
        try { addProfile(p.name, p.channels, { cat: p.cat, replace: true, defaults: p.defaults, labels: p.labels }); }
        catch (e) { log('  skipped custom fixture "' + p.name + '": ' + e.message); }
      }
      s.customProfiles = customProfiles();

      s.fixtures = (Array.isArray(disk.fixtures) ? disk.fixtures : [])
        .filter((f) => f && typeof f === 'object').map(makeFixture);
      s.groups = (Array.isArray(disk.groups) ? disk.groups : [])
        .filter((g) => g && typeof g === 'object' && typeof g.id === 'string' && Array.isArray(g.ids))
        .map((g) => ({ id: g.id, name: String(g.name || 'Group').slice(0, 24), ids: g.ids.filter((id) => typeof id === 'string') }));
      s.scenes = (Array.isArray(disk.scenes) ? disk.scenes : []).map(sanitizeScene).filter(Boolean);
      s.raw = sanitizeRaw(disk.raw);
      s.master = Number.isFinite(+disk.master) ? Math.max(0, Math.min(255, Math.round(+disk.master))) : 255;
      s.blackout = !!disk.blackout;
      return s;
    } catch (e) {
      // Nothing was loaded. Remembered, because an empty desk that then SAVES would
      // write its emptiness over whatever appears at that path afterwards.
      bootedWithNothing = true;
      if (fs.existsSync(SHOW)) {
        const aside = SHOW.replace(/.json$/, '-broken-' + Date.now() + '.json');
        try { fs.copyFileSync(SHOW, aside); } catch (e2) {}
        log('COULD NOT LOAD ' + SHOW + ': ' + e.message);
        log('Starting with an EMPTY desk; your show is preserved at ' + aside);
      }
      const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
      fresh.output.enabled = outputEnabledDefault;
      return fresh;
    }
  }

  const state = attachAudio(loadState());
  const engine = new Engine(state);
  const artnet = new ArtNet({
    port: state.output.port,
    // Tests bind an ephemeral local port so they never contend for 6454 with a running desk.
    bindPort,
    // ARTNET_OFFLINE=1 keeps a test run off the wire entirely.
    offline: offline,
  });

  // The serial widget is only opened while it is the selected driver: holding COM3 open
  // would lock TouchDesigner, Daslight or ENTTEC EMU out of it for no reason whenever the
  // desk happens to be running on Art-Net.
  let enttec = null;
  function enttecDriver() {
    if (state.output.driver !== 'enttec') { if (enttec) { enttec.close(); enttec = null; } return null; }
    if (enttec && enttec.port !== state.output.serialPort) { enttec.close(); enttec = null; }
    if (!enttec) {
      enttec = new Enttec({
        port: state.output.serialPort,
        maxHz: state.output.refreshHz,
        offline: offline,
      });
    }
    return enttec;
  }
  enttecDriver();

  // sACN, built on first use like the serial widget, and closed when the driver moves
  // away from it: a socket nobody is sending on has no business being open.
  let sacn = null;
  function sacnDriver() {
    if (state.output.driver !== 'sacn') { if (sacn) { sacn.close(); sacn = null; } return null; }
    const targets = state.output.mode === 'unicast' ? state.output.targets : [];
    const priority = state.output.priority;
    if (sacn && (sacn.priority !== priority || sacn.targets.join() !== targets.join())) { sacn.close(); sacn = null; }
    if (!sacn) sacn = new SACN({ offline, targets, priority, sourceName: 'di.iiii lighting desk' });
    return sacn;
  }

  // ---- more than one device at once -----------------------------------------
  // Each extra send owns a driver instance of its own, keyed by the send's id. They are
  // built on first use and closed the moment their send is removed, changed onto another
  // device, or switched off — a serial port held open by a send nobody is using is a port
  // the next program cannot have.
  const extraDrivers = new Map();

  function sanitizeSend(raw, existing) {
    if (!raw || typeof raw !== 'object') return null;
    const prev = existing || {};
    const driver = ['artnet', 'sacn', 'enttec'].includes(raw.driver) ? raw.driver : (prev.driver || 'artnet');
    const serialPort = raw.serialPort && PORT_NAME.test(String(raw.serialPort).trim())
      ? portName(raw.serialPort) : (prev.serialPort || DEFAULT_PORT);
    return {
      id: String(prev.id || raw.id || ('snd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6))).slice(0, 24),
      name: String(raw.name != null ? raw.name : (prev.name || '')).slice(0, 40),
      driver,
      // Which universes go out of THIS device. Empty is every universe the desk has —
      // right for a second Art-Net node mirroring the rig, wrong for a widget, which
      // carries one DMX line and should be told which one.
      universes: Array.isArray(raw.universes)
        ? [...new Set(raw.universes.map((u) => u | 0).filter((u) => u >= 0 && u <= 32767))].slice(0, 64).sort((a, b) => a - b)
        : (Array.isArray(prev.universes) ? prev.universes : []),
      targets: Array.isArray(raw.targets) ? raw.targets.map(validIp).filter(Boolean).slice(0, 8)
        : (Array.isArray(prev.targets) ? prev.targets : []),
      serialPort,
      priority: raw.priority != null ? Math.max(0, Math.min(200, raw.priority | 0)) : (prev.priority != null ? prev.priority : 100),
      enabled: raw.enabled != null ? !!raw.enabled : (prev.enabled !== false),
    };
  }

  // The driver for one extra send, built or rebuilt when what it points at changes.
  function extraDriver(send) {
    const held = extraDrivers.get(send.id);
    const sig = [send.driver, send.serialPort, send.targets.join(), send.priority].join('|');
    if (held && held.sig !== sig) { held.drv.close(); extraDrivers.delete(send.id); }
    const again = extraDrivers.get(send.id);
    if (again) return again.drv;
    let drv = null;
    if (send.driver === 'enttec') drv = new Enttec({ port: send.serialPort, maxHz: state.output.refreshHz, offline });
    else if (send.driver === 'sacn') drv = new SACN({ offline, targets: send.targets, priority: send.priority, sourceName: 'di.iiii lighting desk' });
    // Art-Net needs no instance: one socket carries every destination, so an extra
    // Art-Net send is a list of addresses to also send each frame to, nothing more.
    if (drv) extraDrivers.set(send.id, { sig, drv });
    return drv;
  }

  function closeExtra(id) {
    const held = extraDrivers.get(id);
    if (held) { held.drv.close(); extraDrivers.delete(id); }
  }

  // Anything holding a device for a send that is gone or switched off lets it go.
  function pruneExtra() {
    const live = new Set((state.output.extra || []).filter((s) => s.enabled).map((s) => s.id));
    for (const id of [...extraDrivers.keys()]) if (!live.has(id)) closeExtra(id);
  }

  // The show file is written whole, to a temp file, then renamed over the old one, with
  // the previous good copy kept beside it. It used to be truncated in place: a crash or a
  // power cut mid-write left half a file, and the next boot was an EMPTY desk on the wrong
  // driver, mid-gig. Now every state the file can be in is a complete show.
  //
  // Writes coalesce for 400ms after the FIRST change, not the last — a fader drag that
  // posts every 100ms used to restart the timer each time and never write at all, and
  // Ctrl+C then threw the whole drag away. Exit flushes whatever is pending.
  let saveTimer = null;
  let dirty = false;
  function writeShow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!dirty) return;
    dirty = false;
    fs.mkdirSync(DATA, { recursive: true });
    // A show that appeared after we booted with nothing belongs to somebody else — a
    // second desk on the same folder, a file restored by hand between the boot and now.
    // It is preserved and named rather than overwritten, and said out loud. An empty
    // desk quietly replacing a real one is the worst thing this file could do.
    if (bootedWithNothing && fs.existsSync(SHOW)) {
      const aside = SHOW.replace(/\.json$/, '-found-' + Date.now() + '.json');
      try {
        fs.copyFileSync(SHOW, aside);
        log('A show appeared at ' + SHOW + ' after this desk started empty.');
        log('It has NOT been overwritten blindly — it is kept at ' + aside);
      } catch (e) { /* if it cannot be preserved, the write below is still refused */ }
    }
    bootedWithNothing = false;
    const tmp = SHOW + '.tmp';
    // Compact, not pretty-printed: at 500+ scenes the indented form cost ~29ms to
    // stringify, over the 25ms frame budget at 40Hz. Compact is ~9ms and a third the size.
    fs.writeFileSync(tmp, JSON.stringify(state));
    // The previous copy is COPIED aside, never renamed. Renaming the live file away
    // first left a window — microseconds, but real — in which show.json did not exist at
    // all, and a second desk booting into that window found no show, started empty, and
    // saved its emptiness over the top. That is not hypothetical: it happened on the dev
    // stack when a restart overlapped a save, and only show.prev.json still held the rig.
    // A rename onto the live path is atomic, so show.json now goes straight from the old
    // contents to the new and is never absent.
    try { fs.copyFileSync(SHOW, SHOW_PREV); } catch (e) { /* first save ever */ }
    fs.renameSync(tmp, SHOW);
  }
  // The layer an outside caller's cue drives, unless it names another.
  const CUE_LAYER = 'cue';
  let nextLookId = 1;
  let nextLayerId = 1;
  // Add or replace by id, keeping the library's order — an edit must not make a look
  // jump to the end of the list the operator is reading.
  function putLook(look) {
    const at = state.looks.findIndex((l) => l.id === look.id);
    if (at >= 0) state.looks[at] = look; else state.looks.push(look);
  }

  let stateVersion = 0;
  function save() {
    dirty = true;
    stateVersion++;
    if (!saveTimer) saveTimer = setTimeout(writeShow, 400);
  }

  // ---- output loop ----------------------------------------------------------
  let timer = null;
  const stats = { ticks: 0, lastSend: 0 };

  function manualIps() { return state.output.manual.map((m) => m.ip); }

  // The device list the interface shows. A hand-added device is a row whether or not it has
  // ever spoken — it is the one the address was typed for, so it cannot disappear because it
  // keeps quiet. If it does answer, the reply fills its name and last-seen in underneath.
  function nodeList() {
    const byIp = new Map(artnet.nodeList().map((n) => [n.ip, n]));
    const manual = state.output.manual.map((m) => {
      const live = byIp.get(m.ip);
      byIp.delete(m.ip);
      return { ip: m.ip, ageMs: null, ...(live || {}), manual: true, name: m.name };
    });
    return [...manual, ...byIp.values()];
  }

  function targetsFor() {
    if (state.output.mode === 'unicast' && state.output.targets.length) return state.output.targets;
    return broadcastAddresses();
  }

  // How much of each universe actually carries anything: the highest patched channel and
  // the highest manual hold. Frames are trimmed to this, because a 518-byte frame takes
  // ~21ms of a 25ms tick at 250k baud — one timer hiccup and writes start colliding. Her
  // rig ends at channel 216: trimming more than halves the wire time and turns the felt
  // tick-to-light delay with it.
  function footprints() {
    const out = new Map();
    const bump = (u, ch) => { if (ch > (out.get(u) || 0)) out.set(u, ch); };
    for (const f of state.fixtures) {
      const w = (PROFILES[f.profile] || PROFILES.rgb).channels.length;
      bump(f.universe, Math.min(512, f.address + w - 1));
    }
    for (const k of Object.keys(state.raw)) {
      const [u, ch] = k.split(':').map(Number);
      bump(u, ch);
    }
    // Minimum 24 channels (the widget's floor), rounded up to even.
    for (const [u, ch] of out) out.set(u, Math.max(24, ch + (ch % 2)));
    return out;
  }

  // One frame out NOW. Every mutating route calls this instead of leaving the change to
  // wait out the remainder of the 25ms tick — the reply to the client means "already on
  // the wire", not "queued for the next tick". The interval keeps running regardless; it
  // is what carries fades, FX and the continuous refresh.
  function pushFrame() {
    const frames = engine.tick();
    stats.ticks++;
    // Output off: the engine still renders (the stage view is live, scenes still work),
    // nothing leaves the machine and the serial port is left alone for other programs.
    if (!state.output.enabled) {
      if (enttec) { enttec.close(); enttec = null; }
      if (sacn) { sacn.close(); sacn = null; }
      // The wire switch is the wire switch: it stops every device, not only the main one.
      for (const id of [...extraDrivers.keys()]) closeExtra(id);
      return;
    }
    const fp = footprints();
    const stream = sacnDriver();
    if (stream) {
      // sACN carries a whole universe or nothing: the packet fixes 512 slots, so there
      // is no footprint to trim and no empty-desk special case — the universe goes out,
      // zeros and all, which is what stops a node's own timeout firing and its fixtures
      // falling into their built-in programs.
      for (const [universe, buf] of frames) stream.send(universe, buf);
      if (!frames.size) stream.send(0, Buffer.alloc(512));
      sendExtras(frames, fp);
      stats.lastSend = Date.now();
      return;
    }
    const wire = enttecDriver();
    if (wire) {
      // The unreachable warning is rebuilt from the PATCH every frame, not accumulated.
      // The driver's set only ever grew, and the engine deliberately keeps draining zeros
      // for a universe that lost its last fixture (so blackout can still reach an Art-Net
      // node holding a frame) — together those latched "universe 2 is patched" forever,
      // surviving the unpatch that made it untrue. Only the server knows the patch, so
      // only the server can say it honestly: a universe is worth warning about while a
      // fixture actually lives there.
      wire.unreachable.clear();
      const patched = new Set(state.fixtures.map((f) => f.universe));
      for (const [universe, buf] of frames) {
        if (universe === wire.universe || patched.has(universe)) {
          wire.send(universe, buf.subarray(0, fp.get(universe) || 24));
        }
      }
      // An empty desk still refreshes: fixtures time out into their built-in programs when
      // frames stop, and "no fixtures patched" must not mean "no signal".
      if (!frames.has(wire.universe)) wire.send(wire.universe, Buffer.alloc(24));
    } else {
      const targets = targetsFor();
      for (const [universe, buf] of frames) {
        for (const t of targets) artnet.send(t, universe, buf.subarray(0, fp.get(universe) || 24));
      }
    }
    sendExtras(frames, fp);
    stats.lastSend = Date.now();
  }

  // The same frame, out of every other device that has been added. Each send picks the
  // universes it was told to carry — empty means all of them, which is right for a second
  // node mirroring the rig and wrong for a widget, which is one DMX line.
  function sendExtras(frames, fp) {
    const list = state.output.extra || [];
    if (!list.length) { if (extraDrivers.size) pruneExtra(); return; }
    pruneExtra();
    for (const send of list) {
      if (!send.enabled) continue;
      const wanted = send.universes.length ? new Set(send.universes) : null;
      if (send.driver === 'artnet') {
        if (!send.targets.length) continue;   // an Art-Net send with nowhere to go is not a send
        for (const [universe, buf] of frames) {
          if (wanted && !wanted.has(universe)) continue;
          for (const t of send.targets) artnet.send(t, universe, buf.subarray(0, fp.get(universe) || 24));
        }
        continue;
      }
      const drv = extraDriver(send);
      if (!drv) continue;
      if (send.driver === 'sacn') {
        for (const [universe, buf] of frames) {
          if (wanted && !wanted.has(universe)) continue;
          drv.send(universe, buf);
        }
        continue;
      }
      // A widget carries ONE line. Told which universe, it sends that one and keeps
      // refreshing it even when nothing is patched there yet — a rig that stops receiving
      // frames falls into its built-in programs, and "not patched yet" must not do that.
      const only = send.universes.length ? send.universes[0] : 0;
      const buf = frames.get(only);
      drv.unreachable.clear();
      drv.send(only, buf ? buf.subarray(0, fp.get(only) || 24) : Buffer.alloc(24));
    }
  }

  function startLoop() {
    clearInterval(timer);
    const hz = Math.max(1, Math.min(44, state.output.refreshHz || 40));
    timer = setInterval(pushFrame, Math.round(1000 / hz));
  }
  startLoop();

  // Poll the configured unicast targets by name as well as broadcasting: if you have typed
  // the node's address in, that is the one address worth asking directly.
  const pollTimer = setInterval(() => {
    artnet.pruneNodes();
    // No point broadcasting discovery on a network that is not carrying the show.
    if (state.output.enabled && state.output.driver !== 'enttec') artnet.poll([...state.output.targets, ...manualIps()]);
  }, 10000);
  const firstPoll = setTimeout(() => { if (state.output.enabled && state.output.driver !== 'enttec') artnet.poll([...state.output.targets, ...manualIps()]); }, 800);

  // ---- http -----------------------------------------------------------------
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };

  // Browsers request /favicon.ico no matter what the markup links. Answer quietly rather
  // than logging a 404 on every page load.
  const FAVICON_204 = '/favicon.ico';

  // Big replies are gzipped when the client accepts it. /api/state carries the whole
  // library — 1.9 MB raw, 45 KB gzipped, polled every 1.5 s by every open tab; on venue
  // wifi the raw version was 10 Mbit/s per phone, and phones fell off the desk.
  const GZIP_MIN = 4096;
  function json(res, body, code, req) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
    const accepts = req && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (!accepts || text.length < GZIP_MIN) {
      res.writeHead(code || 200, headers);
      return res.end(text);
    }
    zlib.gzip(text, { level: 1 }, (err, gz) => {
      if (err) { res.writeHead(code || 200, headers); return res.end(text); }
      res.writeHead(code || 200, { ...headers, 'content-encoding': 'gzip', vary: 'accept-encoding' });
      res.end(gz);
    });
  }

  // 16MB: a full 500-scene library POSTed to /api/scenes/replace is ~5MB. The old 1MB
  // cap reset the socket mid-upload, which read as a dead server rather than a refusal.
  const BODY_MAX = 16 * 1024 * 1024;

  function readBody(req) {
    return new Promise((resolve, reject) => {
      // Chunks are joined as bytes, then decoded once. Decoding each chunk on its own
      // split multi-byte characters at socket boundaries: a library push turned `›` and
      // `·` in scene names into U+FFFD, silently, and the corruption reached show.json.
      const chunks = [];
      let size = 0;
      let done = false;
      req.on('data', (c) => {
        if (done) return;
        size += c.length;
        if (size > BODY_MAX) {
          done = true;
          const e = new Error(`request body over ${BODY_MAX >> 20} MB`);
          e.status = 413;
          reject(e);
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (done) return;
        done = true;
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve(text ? JSON.parse(text) : {});
        } catch (e) { reject(e); }
      });
      req.on('error', (e) => { if (!done) { done = true; reject(e); } });
    });
  }

  // Fixture values as stored: a known role name, an integer 0..255. Anything else was
  // reaching the render as NaN and putting that channel at 0 on the wire in silence.
  function sanitizeValues(values) {
    const out = {};
    if (!values || typeof values !== 'object') return out;
    for (const [k, v] of Object.entries(values)) {
      if (typeof k !== 'string' || !k || k.length > 24) continue;
      const n = +v;
      if (!Number.isFinite(n)) continue;
      out[k] = Math.max(0, Math.min(255, Math.round(n)));
    }
    return out;
  }

  // Manual holds as stored: `universe:channel` keys with a real universe and a channel in
  // 1..512, values 0..255. A garbage key used to become a 512-channel universe that was
  // rendered and transmitted every tick for the rest of the run.
  function sanitizeRaw(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const [k, v] of Object.entries(raw)) {
      const m = /^(\d{1,5}):(\d{1,3})$/.exec(k);
      if (!m) continue;
      const u = +m[1];
      const ch = +m[2];
      if (u > 32767 || ch < 1 || ch > 512) continue;
      const n = +v;
      if (!Number.isFinite(n)) continue;
      out[`${u}:${ch}`] = Math.max(0, Math.min(255, Math.round(n)));
    }
    return out;
  }

  function sanitizeLimits(l) {
    const out = {};
    for (const k of ['dimMin', 'dimMax', 'panMin', 'panMax', 'tiltMin', 'tiltMax']) {
      if (l[k] != null) out[k] = Math.max(0, Math.min(255, l[k] | 0));
    }
    for (const k of ['invertPan', 'invertTilt', 'swapPT']) {
      if (l[k] != null) out[k] = !!l[k];
    }
    return out;
  }

  // One manual channel override. Out-of-range channels are dropped rather than stored:
  // render ignores them anyway, and letting them accumulate would quietly bloat show.json
  // with keys that can never do anything.
  function setRaw(universe, channel, value) {
    const ch = channel | 0;
    if (ch < 1 || ch > 512) return;
    const key = Math.max(0, Math.min(32767, universe | 0)) + ':' + ch;
    if (value == null || value < 0) delete state.raw[key];
    else state.raw[key] = Math.max(0, Math.min(255, value | 0));
  }

  function snapshot() {
    const out = {};
    for (const [u, buf] of engine.toBuffers()) out[u] = Array.from(buf);
    return out;
  }

  // The scenes are the bulk of /api/state and change only through routes, every one of
  // which calls save(). Their JSON is built once per change and spliced in as text, so a
  // poll costs the small part — fixtures, status, the dmx snapshot — not 15 ms of
  // stringifying 600 scenes per tab per poll on the thread that runs the DMX loop.
  let sceneJsonCache = { version: -1, text: '[]' };
  const SCENES_PLACEHOLDER = '\u0000scenes\u0000';
  const SCENES_TOKEN = JSON.stringify(SCENES_PLACEHOLDER);
  function scenesJson() {
    if (sceneJsonCache.version === stateVersion) return sceneJsonCache.text;
    const patched = new Set(state.fixtures.map((f) => f.id));
    const text = JSON.stringify(state.scenes.map((s) => {
      const live = s.fixtures.filter((sf) => patched.has(sf.id)).length;
      return Object.assign({}, s, { live, missing: s.fixtures.length - live });
    }));
    sceneJsonCache = { version: stateVersion, text };
    return text;
  }
  function publicStateJson() {
    const body = JSON.stringify(Object.assign(publicState(false), { scenes: SCENES_PLACEHOLDER }));
    return body.replace(SCENES_TOKEN, scenesJson());
  }

  function summary() {
    const active = state.activeScene ? state.scenes.find((s) => s.id === state.activeScene) : null;
    const ser = enttec ? enttec.status() : null;
    return {
      master: state.master,
      blackout: state.blackout,
      activeScene: state.activeScene,
      activeSceneName: active ? active.name : null,
      fading: !!engine.fade,
      fx: { mode: state.fx.mode, bpm: state.fx.bpm, depth: state.fx.depth, enabled: !!state.fx.enabled },
      chase: { enabled: !!state.chase.enabled, index: engine.chase.index, count: state.chase.sceneIds.length },
      fixtures: state.fixtures.length,
      scenes: state.scenes.length,
      looks: state.looks.length,
      layers: state.layers.map((l) => ({ id: l.id, name: l.name, on: l.on, level: l.level, lookId: l.lookId })),
      universes: engine.universes(),
      // Which fixtures are flashing to be found, right now. The page paints them so the
      // operator can tell the desk is doing what they asked while they look at the rig.
      identifying: Object.entries(state.identify || {}).filter(([, t]) => t > Date.now()).map(([id]) => id),
      output: {
        driver: state.output.driver,
        enabled: !!state.output.enabled,
        connected: state.output.driver === 'enttec' ? !!(ser && ser.connected)
          : state.output.driver === 'sacn' ? !!(sacn && sacn.ready) : !!artnet.ready,
        packetsSent: enttec ? enttec.packetsSent : sacn ? sacn.packetsSent : artnet.packetsSent,
        lastError: enttec ? enttec.lastError : sacn ? sacn.lastError : artnet.lastError,
        lanAllowed,
      },
    };
  }

  // {maps: [...]} of flat objects — strings, finite numbers, booleans — nothing nested,
  // nothing long. The MIDI page owns the meaning of the fields; the server keeps them.
  function sanitizeMidi(midi) {
    if (!midi || typeof midi !== 'object' || !Array.isArray(midi.maps)) return null;
    if (midi.maps.length > 400) return null;
    const maps = [];
    for (const m of midi.maps) {
      if (!m || typeof m !== 'object') return null;
      const out = {};
      for (const [k, v] of Object.entries(m)) {
        if (typeof k !== 'string' || k.length > 32) return null;
        if (typeof v === 'string') { if (v.length > 120) return null; out[k] = v; }
        else if (typeof v === 'number') { if (!Number.isFinite(v)) return null; out[k] = v; }
        else if (typeof v === 'boolean' || v === null) out[k] = v;
        else return null;
      }
      maps.push(out);
    }
    return { maps };
  }

  function publicState(withScenes = true) {
    const patched = new Set(state.fixtures.map((f) => f.id));
    return Object.assign({}, state, {
      // How much of each scene still exists. Recall skips fixtures that have been unpatched,
      // so a scene saved against a rig that has since been repatched recalls silently and
      // does nothing at all — which reads as a broken button. The counts let the interface
      // say so instead. Pruning the dead entries would be worse: it would quietly rewrite
      // looks she saved, and they come back if the fixtures are ever restored.
      scenes: !withScenes ? [] : state.scenes.map((s) => {
        const live = s.fixtures.filter((sf) => patched.has(sf.id)).length;
        return Object.assign({}, s, { live, missing: s.fixtures.length - live });
      }),
      // `custom` tells the interface which ones can be edited or deleted; the built-ins
      // cannot be, so the library can hide those controls rather than offering them and
      // then refusing.
      profiles: Object.fromEntries(Object.entries(PROFILES).map(([k, v]) =>
        [k, { label: v.label, channels: v.channels, cat: v.cat, custom: !!v.custom, labels: v.labels }])),
      // What each channel role IS, so the interface can ask rather than keep its own copy.
      roleKinds: roleKinds(),
      // Profiles patched on fixtures whose channels are ALL generic (c1, c2, ...): pure
      // mode-switch banks with no dimmer or emitter, which blackout deliberately cannot
      // touch (scaling a mode switch changes the mode). Empty on the current rig — the
      // laser grew a real dimmer channel — but published so the UI can warn the moment
      // such a profile is ever patched again.
      blackoutBlind: [...new Set(state.fixtures
        .filter((f) => isGenericChannels((PROFILES[f.profile] || PROFILES.rgb).channels))
        .map((f) => f.profile))],
      // Same rule for the effects: the pads are built from this list, so an effect added to
      // fx.js appears on the page without anyone remembering to add it twice.
      fxModes: FX_MODES,
      fxSpatial: FX_SPATIAL,
      fanStyles: FAN_STYLES,
      lfoWaves: LFO_WAVES,
      audioModes: AUDIO_MODES,
      // Live audio input is non-enumerable on `state` (so it never persists); the page
      // still gets a snapshot. `fresh` is the same 1.5s staleness gate the engine applies.
      audio: {
        fresh: (Date.now() - (state.audio.lastAt || 0)) < 1500,
        level: state.audio.level, low: state.audio.low,
        mid: state.audio.mid, high: state.audio.high,
        bpm: state.audio.bpm,
      },
      status: {
        // Which fixtures are flashing to be found. Live-only, like the audio levels
        // above it — the page paints the row so the desk visibly agrees with what the
        // operator asked for while they are turned round looking at the rig.
        identifying: Object.entries(state.identify || {}).filter(([, t]) => t > Date.now()).map(([id]) => id),
        nodes: nodeList(),
        interfaces: localAddresses(),
        broadcast: broadcastAddresses(),
        // Whichever driver is live owns the counters the interface shows, so a frozen rig
        // reads as a frozen count on the page rather than an Art-Net count ticking happily
        // up while nothing leaves the serial port.
        driver: state.output.driver,
        sacn: sacn ? sacn.status() : null,
        outputEnabled: !!state.output.enabled,
        lanAllowed,
        serial: enttec ? enttec.status() : null,
        // Every other device, and whether it is actually connected. A second widget that
        // will not open has to be visible as a dead line here, not as a dark half of the
        // rig nobody can explain.
        extra: (state.output.extra || []).map((s) => {
          const held = extraDrivers.get(s.id);
          const st = held && held.drv.status ? held.drv.status() : null;
          return {
            id: s.id, name: s.name, driver: s.driver, enabled: s.enabled,
            universes: s.universes, targets: s.targets, serialPort: s.serialPort, priority: s.priority,
            connected: s.driver === 'artnet' ? !!s.targets.length : !!(st && (st.connected || st.ready)),
            packetsSent: st ? st.packetsSent : null,
            lastError: st ? st.lastError : null,
          };
        }),
        serialPorts: listPorts(),
        packetsSent: enttec ? enttec.packetsSent : sacn ? sacn.packetsSent : artnet.packetsSent,
        lastError: enttec ? enttec.lastError : sacn ? sacn.lastError : artnet.lastError,
        universes: engine.universes(),
        fading: !!engine.fade,
        chaseIndex: engine.chase.index,
      },
      dmx: snapshot(),
    });
  }

  const routes = {

    'GET /api/state': (req, res) => json(res, publicStateJson(), 200, req),

    // The cheap read: a few hundred bytes for anything that polls fast — the graph's
    // DMX Out node, a phone strip, an AI director. /api/state is the whole library.
    'GET /api/summary': (req, res) => json(res, summary()),

    // Scene names and health only — what a picker needs, ~50 bytes a scene.
    'GET /api/scenes/summary': (req, res) => {
      const patched = new Set(state.fixtures.map((f) => f.id));
      json(res, { scenes: state.scenes.map((s) => {
        const live = s.fixtures.filter((sf) => patched.has(sf.id)).length;
        return { id: s.id, name: s.name, fadeMs: s.fadeMs, live, missing: s.fixtures.length - live };
      }) });
    },

    // The content library. A look is a list of steps: one step is a scene or a palette,
    // two or more are a chase or a wave, and a value may point at another look.
    'GET /api/looks': (req, res) => json(res, { looks: state.looks, kinds: LOOK_KINDS, scopes: LOOK_SCOPES, spatial: LOOK_SPATIAL }, 200, req),
    'POST /api/looks': (req, res, body) => {
      const looks = sanitizeLooks(body.looks);
      if (!looks) return json(res, { error: 'looks must be a list, each with an id and at least one step' }, 400);
      state.looks = looks;
      // No pushFrame: replacing the library is a data change. A layer pointing at a look
      // that just vanished simply stops contributing on the next tick, which is the
      // honest behaviour — nothing snaps and nothing is quietly held.
      save(); json(res, { ok: true, count: looks.length });
    },

    // The fixture library. Patching by name instead of by channel order: the catalogue
    // is fetched when asked for and cached beside the show, so a venue with no internet
    // still has whatever it imported before. See library.js.
    'GET /api/library': async (req, res) => {
      const { value, from, warning } = await library.manufacturers(LIBRARY_DIR);
      const list = Object.entries(value).map(([key, m]) => ({ key, name: m.name, fixtures: m.fixtureCount || 0 }))
        .filter((m) => m.fixtures > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
      json(res, { manufacturers: list, from, warning }, 200, req);
    },
    'GET /api/library/manufacturer': async (req, res) => {
      const key = new URL(req.url, 'http://localhost').searchParams.get('key') || '';
      const { value, from, warning } = await library.manufacturer(LIBRARY_DIR, key);
      json(res, { name: value.name, key: value.key, fixtures: value.fixtures || [], from, warning }, 200, req);
    },
    // What a fixture would become before anyone commits to it: its modes, and the roles
    // each mode maps onto. A patch is hard to undo; looking first is cheap.
    'GET /api/library/fixture': async (req, res) => {
      const params = new URL(req.url, 'http://localhost').searchParams;
      const { value, from, warning } = await library.fixture(LIBRARY_DIR, params.get('manufacturer') || '', params.get('key') || '');
      json(res, { ...library.describe(value), from, warning }, 200, req);
    },
    'POST /api/library/import': async (req, res, body) => {
      const { value } = await library.fixture(LIBRARY_DIR, body.manufacturer, body.key);
      const profile = library.toProfile(value, Math.max(0, Math.round(+body.mode || 0)), {
        taken: (name) => !!PROFILES[name],
      });
      const name = addProfile(profile.name, profile.channels, { cat: profile.cat, defaults: profile.defaults });
      state.customProfiles = customProfiles();
      save();
      json(res, { ok: true, name, profile: PROFILES[name], source: profile.source });
    },

    // Fan: one gesture, N related values across the selection, in the order the
    // interface sent them. The output is plain static values on the fixtures — nothing
    // keeps running afterwards — so it records into a look like anything else.
    'POST /api/fan': (req, res, body) => {
      const role = typeof body.role === 'string' ? body.role : '';
      if (!role) return json(res, { error: 'name the attribute to fan' }, 400);
      const ids = Array.isArray(body.fixtures) && body.fixtures.length ? body.fixtures : state.fixtures.map((f) => f.id);
      // Selection ORDER is the whole input: a fan across the rig left to right and the
      // same fan in patch order are different looks, and the caller decides which.
      const chosen = ids.map((id) => state.fixtures.find((f) => f.id === id)).filter(Boolean);
      if (!chosen.length) return json(res, { error: 'no such fixtures' }, 404);
      const style = FAN_STYLES.includes(body.style) ? body.style : 'line';
      const from = Math.max(0, Math.min(255, Math.round(+body.from || 0)));
      const to = Math.max(0, Math.min(255, Math.round(body.to == null ? 255 : +body.to)));
      const values = fanValues(chosen.length, from, to, {
        style,
        groups: Math.max(2, Math.min(64, Math.round(+body.groups || 2))),
        seed: Math.max(0, Math.min(32767, Math.round(+body.seed || 1))),
      });
      chosen.forEach((f, i) => {
        // Only a role the fixture actually has: fanning tilt across a rig that is half
        // washes must move the heads and leave the washes alone, not invent a channel.
        const profile = PROFILES[f.profile] || PROFILES.rgb;
        if (profile.channels.includes(role)) f.values[role] = values[i];
      });
      state.activeScene = null;
      engine.cancelFade(); save(); pushFrame();
      json(res, { ok: true, style, values, fixtures: chosen.length });
    },

    // Record: the stage as it stands right now becomes a look. This is the verb every
    // desk in the audit has and calls Record or Store — with `kind` it stores only that
    // lane, which is how a colour palette gets made without touching the heads.
    'POST /api/looks/capture': (req, res, body) => {
      const kind = LOOK_KINDS.includes(body.kind) ? body.kind : 'all';
      const chosen = Array.isArray(body.fixtures) && body.fixtures.length
        ? state.fixtures.filter((f) => body.fixtures.includes(f.id))
        : state.fixtures;
      if (!chosen.length) return json(res, { error: 'nothing patched to record' }, 400);
      // Recorded through the mask, not merely rendered through it. A colour palette
      // that quietly held pan and tilt would be a palette that lies about itself, and
      // recalling it later would swing the heads for a reason nobody could see.
      const values = {};
      for (const f of chosen) {
        const cell = {};
        for (const [role, v] of Object.entries(f.values)) if (kindAllows(kind, role)) cell[role] = v;
        if (Object.keys(cell).length) values[f.id] = cell;
      }
      const look = sanitizeLook({
        id: body.id || `lk${Date.now().toString(36)}${(nextLookId++).toString(36)}`,
        name: body.name || `Look ${state.looks.length + 1}`,
        kind,
        fixtures: chosen.map((f) => f.id),
        steps: [{ values }],
      });
      if (!look) return json(res, { error: 'nothing in that lane to record' }, 400);
      putLook(look);
      save(); json(res, { ok: true, look });
    },

    // One look at a time. The replace-whole route is for a tool pushing a library; a
    // person editing one look must not have to send the other five hundred, and two
    // people on two phones must not overwrite each other.
    'POST /api/looks/add': (req, res, body) => {
      const look = sanitizeLook(body.look);
      if (!look) return json(res, { error: 'a look needs an id and at least one step' }, 400);
      putLook(look);
      save(); json(res, { ok: true, look });
    },
    'POST /api/looks/remove': (req, res, body) => {
      const before = state.looks.length;
      state.looks = state.looks.filter((l) => l.id !== body.id);
      if (state.looks.length === before) return json(res, { error: 'no such look' }, 404);
      // A layer left pointing at nothing is emptied rather than deleted: the operator
      // put that layer there, and its fader keeps its place in the stack.
      let emptied = 0;
      for (const layer of state.layers) if (layer.lookId === body.id) { layer.lookId = null; emptied++; }
      save(); pushFrame(); json(res, { ok: true, emptied });
    },

    // Fire a look from outside the desk — a map cue, a graph node, a phone. A look is
    // content, not a state, so firing it means putting it ON something: one dedicated
    // layer that outside callers drive, created on first use and visible in the stack
    // like any other. Fire look A then look B and the layer holds B, which is the
    // one-clip-per-layer rule the whole interface already reads by.
    'POST /api/looks/fire': (req, res, body) => {
      const look = state.looks.find((l) => l.id === body.id);
      if (!look) return json(res, { error: 'no such look' }, 404);
      const layerId = typeof body.layerId === 'string' && body.layerId ? body.layerId : CUE_LAYER;
      let layer = state.layers.find((l) => l.id === layerId);
      if (!layer) {
        layer = sanitizeLayer({
          id: layerId,
          name: layerId === CUE_LAYER ? 'Cues' : layerId,
          priority: state.layers.reduce((n, l) => Math.max(n, l.priority), 0) + 1,
        });
        state.layers.push(layer);
      }
      layer.lookId = look.id;
      layer.on = true;
      layer.level = body.level != null && Number.isFinite(+body.level)
        ? Math.max(0, Math.min(1, +body.level)) : 1;
      save(); pushFrame();
      json(res, { ok: true, look: { id: look.id, name: look.name }, layer });
    },

    // What an outside caller may fire, in one list: the looks and the scenes, each
    // saying which it is. A picker should not have to know the desk's history to offer
    // both, and a cue that names one must be able to tell them apart.
    'GET /api/fireable': (req, res) => {
      const patched = new Set(state.fixtures.map((f) => f.id));
      json(res, {
        looks: state.looks.map((l) => ({ id: l.id, name: l.name, kind: l.kind, steps: l.steps.length })),
        scenes: state.scenes.map((s) => {
          const live = s.fixtures.filter((sf) => patched.has(sf.id)).length;
          return { id: s.id, name: s.name, fadeMs: s.fadeMs, live, missing: s.fixtures.length - live };
        }),
      }, 200, req);
    },

    // The stack. Bottom to top by priority; each layer contributes what its mask allows.
    'GET /api/layers': (req, res) => json(res, { layers: state.layers, merges: LAYER_MERGES }, 200, req),
    'POST /api/layers/add': (req, res, body) => {
      if (state.layers.length >= 64) return json(res, { error: 'that is as many layers as the stack holds' }, 400);
      const top = state.layers.reduce((n, l) => Math.max(n, l.priority), 0);
      const layer = sanitizeLayer({
        id: `ly${Date.now().toString(36)}${(nextLayerId++).toString(36)}`,
        name: body.name || `Layer ${state.layers.length + 1}`,
        lookId: body.lookId || null,
        // A new layer arrives at the top of the stack and OFF the rig: nothing an
        // operator adds mid-show may change the room before they touch its fader.
        level: body.level != null ? body.level : 0,
        priority: top + 1,
        mask: body.mask,
        merge: body.merge,
      });
      state.layers.push(layer);
      save(); json(res, { ok: true, layer });
    },
    'POST /api/layers/remove': (req, res, body) => {
      const before = state.layers.length;
      state.layers = state.layers.filter((l) => l.id !== body.id);
      if (state.layers.length === before) return json(res, { error: 'no such layer' }, 404);
      save(); pushFrame(); json(res, { ok: true });
    },
    'POST /api/layers': (req, res, body) => {
      const layers = sanitizeLayers(body.layers);
      if (!layers) return json(res, { error: 'layers must be a list, each with an id' }, 400);
      state.layers = layers;
      save(); pushFrame(); json(res, { ok: true, layers: state.layers });
    },
    // One layer, by id — the fader move. Kept apart from the replace-whole route because
    // a fader is dragged: it must not carry the rest of the stack up the wire on every
    // frame, and two people on two phones must not overwrite each other's layers.
    'POST /api/layer': (req, res, body) => {
      const layer = state.layers.find((l) => l.id === body.id);
      if (!layer) return json(res, { error: 'no such layer' }, 404);
      if (body.level != null && Number.isFinite(+body.level)) layer.level = Math.max(0, Math.min(1, +body.level));
      if (body.on != null) layer.on = !!body.on;
      if (body.lookId !== undefined) layer.lookId = typeof body.lookId === 'string' && body.lookId ? body.lookId.slice(0, 40) : null;
      if (body.rate != null && Number.isFinite(+body.rate)) layer.rate = Math.max(0.01, Math.min(64, +body.rate));
      if (body.name != null) layer.name = String(body.name).slice(0, 60);
      if (LAYER_MERGES.includes(body.merge)) layer.merge = body.merge;
      if (LOOK_KINDS.includes(body.mask)) layer.mask = body.mask;
      if (body.priority != null && Number.isFinite(+body.priority)) layer.priority = Math.max(0, Math.min(999, Math.round(+body.priority)));
      save(); pushFrame(); json(res, { ok: true, layer });
    },

    // MIDI mappings live with the show, not in one browser's storage: every surface on
    // the desk sees the same controller layout. Replace-whole, like sets and LFOs.
    'GET /api/midi': (req, res) => json(res, { midi: state.midi }),
    'POST /api/midi': (req, res, body) => {
      const midi = sanitizeMidi(body.midi);
      if (!midi) return json(res, { error: 'midi must be {maps: [...]} with at most 400 entries of plain fields' }, 400);
      state.midi = midi;
      save(); json(res, { ok: true, midi: state.midi });
    },

    // Just the live DMX buffers — polled fast so the stage view animates smoothly.
    'GET /api/dmx': (req, res) => json(res, { dmx: snapshot(), master: state.master, blackout: state.blackout }),

    'POST /api/master': (req, res, body) => {
      if (body.master != null && Number.isFinite(+body.master)) state.master = Math.max(0, Math.min(255, Math.round(+body.master)));
      if (body.blackout != null) state.blackout = !!body.blackout;
      engine.cancelFade(); save(); pushFrame(); json(res, { ok: true });
    },

    'POST /api/fixture': (req, res, body) => {
      const f = state.fixtures.find((x) => x.id === body.id);
      if (!f) return json(res, { error: 'no such fixture' }, 404);
      // Moving a fixture on the stage view or renaming it is housekeeping: it changes no
      // channel, so it must not cancel a fade or make the desk forget the active scene —
      // a stage tidy mid-show snapped 21 crossfades and blanked the scene bank's highlight.
      const look = body.values != null || body.on != null || body.address != null
        || body.universe != null || body.profile != null || body.limits != null;
      if (body.values) Object.assign(f.values, sanitizeValues(body.values));
      if (body.on != null) f.on = !!body.on;
      if (body.name != null) f.name = String(body.name).slice(0, 40);
      if (body.address != null) f.address = Math.max(1, Math.min(512, body.address | 0));
      if (body.universe != null) f.universe = Math.max(0, Math.min(32767, body.universe | 0));
      if (body.profile && PROFILES[body.profile]) f.profile = body.profile;
      if (body.index != null) f.index = Math.max(1, body.index | 0);
      // The stage world is -1..2: the visible rect at zoom 1 plus a full screen of space
      // on every side. Clamped at all only so a broken client cannot fling a fixture to
      // coordinates the Fit button would then zoom into oblivion trying to frame.
      if (body.x != null) f.x = Math.max(-WORLD, Math.min(WORLD, +body.x));
      if (body.y != null) f.y = Math.max(-WORLD, Math.min(WORLD, +body.y));
      if (body.limits) Object.assign(f.limits, sanitizeLimits(body.limits));
      if (look) { state.activeScene = null; engine.cancelFade(); pushFrame(); }
      save(); json(res, { ok: true, fixture: f });
    },

    // Build a fixture type: {name, channels:[role, ...], cat?, replace?}. Channels are in
    // the order the fixture expects them — that order is the whole definition.
    'POST /api/profiles/add': (req, res, body) => {
      const users = state.fixtures.filter((f) => f.profile === (body.name || '').trim());
      const replacing = !!body.replace && users.length > 0;

      // Reshaping a profile changes the patch width of every fixture using it, which can
      // push them into their neighbours or off the end of the universe. Check before, not
      // after: a rig that silently overlaps is far harder to notice than a refused edit.
      if (replacing) {
        const width = Array.isArray(body.channels) ? body.channels.length : 0;
        const others = state.fixtures.filter((f) => f.profile !== body.name.trim());
        const taken = new Map();
        for (const f of others) {
          const w = (PROFILES[f.profile] || PROFILES.rgb).channels.length;
          for (let c = f.address; c < f.address + w && c <= 512; c++) taken.set(f.universe + ':' + c, f);
        }
        for (const f of users) {
          if (f.address + width - 1 > 512) {
            return json(res, { error: `${f.index}.${f.name} at ${f.address} would run off the end at ${width} channels` }, 409);
          }
          for (let c = f.address; c < f.address + width; c++) {
            const hit = taken.get(f.universe + ':' + c);
            if (hit) {
              return json(res, { error: `${f.index}.${f.name} would grow into ${hit.index}.${hit.name} at channel ${c}` }, 409);
            }
          }
        }
      }

      let name;
      try {
        name = addProfile(body.name, body.channels, { cat: body.cat, replace: !!body.replace, defaults: body.defaults, labels: body.labels });
      } catch (e) {
        return json(res, { error: e.message }, 400);
      }
      state.customProfiles = customProfiles();
      // Fixtures already patched on this profile keep their address but change width. A
      // channel the reshaped profile adds gets the profile's own resting value, the way a
      // fresh patch would — otherwise a new shutter channel came up at the generic 0, which
      // on these heads is closed, and six correctly patched beams went dark.
      const own = PROFILES[name].defaults || {};
      for (const f of users) {
        for (const role of PROFILES[name].channels) {
          if (f.values[role] == null) f.values[role] = own[role] != null ? own[role] : (ROLE_DEFAULTS[role] || 0);
        }
      }
      engine.cancelFade(); save();
      json(res, { ok: true, name, profile: PROFILES[name], inUse: users.length });
    },

    'POST /api/profiles/remove': (req, res, body) => {
      // Built-in first: it is the more fundamental refusal. Reporting "still patched" for a
      // built-in would send someone off to unpatch a rig and then fail them anyway.
      const key = findProfile(body.name);
      if (!key) return json(res, { error: `"${body.name}" does not exist` }, 400);
      if (PROFILES[key].builtin) {
        return json(res, { error: `"${key}" is a built-in fixture and cannot be deleted` }, 400);
      }
      const users = state.fixtures.filter((f) => f.profile === key);
      if (users.length) {
        return json(res, {
          error: `${users.length} fixture${users.length === 1 ? ' is' : 's are'} still patched as "${key}" — unpatch ${users.length === 1 ? 'it' : 'them'} first`,
          inUse: users.map((f) => ({ id: f.id, index: f.index, name: f.name, address: f.address })),
        }, 409);
      }
      removeProfile(key);
      state.customProfiles = customProfiles();
      save(); json(res, { ok: true });
    },

    'POST /api/fixtures/add': (req, res, body) => {
      const count = Math.max(1, Math.min(128, body.count || 1));
      const profile = PROFILES[body.profile] ? body.profile : 'rgb';
      const width = PROFILES[profile].channels.length;
      const universe = Math.max(0, body.universe | 0);
      let addr = body.address ? Math.max(1, Math.min(512, body.address | 0)) : engine.nextFreeAddress(universe, width);
      // An address typed from a channel plot must be checked the way a dragged one is.
      // Patching ON TOP of a patched fixture used to succeed silently: both kept receiving
      // DMX every frame, the patch grid drew only the newer one, and the older fixture
      // simply disappeared from the desk while still lighting the room. Deliberate stacking
      // is legitimate — it mirrors two units — so `force: true` still allows it, exactly as
      // the readdress route does. This is only the accident that could not be seen.
      if (body.address && !body.force) {
        const occupied = new Map();
        for (const f of state.fixtures) {
          if (f.universe !== universe) continue;
          const w = (PROFILES[f.profile] || PROFILES.rgb).channels.length;
          for (let c = f.address; c < f.address + w && c <= 512; c++) occupied.set(c, f);
        }
        for (let i = 0; i < count; i++) {
          const start = addr + i * width;
          if (start + width - 1 > 512) break;
          for (let c = start; c < start + width; c++) {
            const hit = occupied.get(c);
            if (hit) {
              return json(res, {
                error: `channel ${c} is taken by ${hit.index}.${hit.profile} — patch somewhere else, or send force to stack them deliberately`,
                conflict: { channel: c, universe, by: { id: hit.id, index: hit.index, profile: hit.profile } },
              }, 409);
            }
          }
        }
      }
      let index = body.index != null ? Math.max(1, body.index | 0) : engine.nextIndex();
      const row = state.fixtures.length;
      const added = [];
      for (let i = 0; i < count; i++) {
        if (addr == null || addr + width - 1 > 512) break;
        const f = makeFixture({
          name: body.name || profile,
          profile, address: addr, universe, index,
          // lay new fixtures out left to right, wrapping every 12
          x: 0.06 + ((row + i) % 12) * 0.075,
          y: 0.28 + Math.floor((row + i) / 12) * 0.16,
        });
        state.fixtures.push(f); added.push(f);
        addr += width; index++;
      }
      save(); json(res, { ok: true, added });
    },

    // Re-address patched fixtures — what dragging one across the patch grid does. Takes
    // {id, universe, address} for one, or {moves:[{id, universe, address}, ...]} for a whole
    // selection dragged together.
    //
    // Atomic on purpose: if any fixture would land on another, nothing moves at all and the
    // blockers are named. A half-landed selection is worse than a refused one — you would
    // have to work out which of them made it before you could undo anything. `force: true`
    // stacks them anyway, because two fixtures sharing an address is legitimate (it mirrors
    // them); it just has to be deliberate rather than the result of a slipped drag.
    'POST /api/fixtures/readdress': (req, res, body) => {
      const moves = Array.isArray(body.moves) ? body.moves
        : (body.id != null ? [{ id: body.id, universe: body.universe, address: body.address }] : []);
      if (!moves.length) return json(res, { error: 'nothing to move' }, 400);

      const widthOf = (f) => (PROFILES[f.profile] || PROFILES.rgb).channels.length;
      const moving = new Set(moves.map((m) => m.id));
      const planned = [];
      for (const m of moves) {
        const f = state.fixtures.find((x) => x.id === m.id);
        if (!f) return json(res, { error: 'no such fixture: ' + m.id }, 404);
        const universe = m.universe != null ? Math.max(0, Math.min(32767, m.universe | 0)) : f.universe;
        const address = Math.max(1, Math.min(512, (m.address != null ? m.address : f.address) | 0));
        const width = widthOf(f);
        if (address + width - 1 > 512) {
          return json(res, {
            error: `${f.index}.${f.profile} needs ${width} channels and runs off the end at ${address}`,
          }, 409);
        }
        planned.push({ f, universe, address, width });
      }

      if (!body.force) {
        // Occupancy of everything that is NOT moving, so a fixture never blocks itself when
        // it shifts by less than its own width.
        const occupied = new Map();
        for (const f of state.fixtures) {
          if (moving.has(f.id)) continue;
          for (let c = f.address; c < f.address + widthOf(f) && c <= 512; c++) occupied.set(f.universe + ':' + c, f);
        }
        const claimed = new Map();
        const blockers = new Map();
        for (const p of planned) {
          for (let c = p.address; c < p.address + p.width; c++) {
            const key = p.universe + ':' + c;
            const hit = occupied.get(key) || claimed.get(key);
            if (hit && hit !== p.f && !blockers.has(hit.id)) {
              blockers.set(hit.id, { channel: c, universe: p.universe, moved: p.f.id, by: hit });
            }
            claimed.set(key, p.f);
          }
        }
        if (blockers.size) {
          const list = [...blockers.values()];
          const first = list[0];
          return json(res, {
            error: `channel ${first.channel} is taken by ${first.by.index}.${first.by.profile}`,
            conflicts: list.map((c) => ({
              channel: c.channel, universe: c.universe, moved: c.moved,
              blockedBy: { id: c.by.id, index: c.by.index, profile: c.by.profile, address: c.by.address },
            })),
          }, 409);
        }
      }

      for (const p of planned) { p.f.universe = p.universe; p.f.address = p.address; }
      state.activeScene = null;
      engine.cancelFade(); save();
      json(res, { ok: true, moved: planned.map((p) => ({ id: p.f.id, universe: p.universe, address: p.address })) });
    },

    // Drag fixtures around the stage view: [{id, x, y}, ...]
    'POST /api/fixtures/move': (req, res, body) => {
      for (const m of body.moves || []) {
        const f = state.fixtures.find((x) => x.id === m.id);
        if (!f) continue;
        f.x = Math.max(-WORLD, Math.min(WORLD, +m.x));
        f.y = Math.max(-WORLD, Math.min(WORLD, +m.y));
      }
      save(); json(res, { ok: true });
    },

    // IDENTIFY — flash these fixtures white so they can be found in the room. Takes
    // {ids:[...], seconds} or {off:true}. It is not saved and it changes no value: the
    // engine computes the flash while the timer runs and the rig is exactly as it was
    // afterwards, which is what lets it be used in the middle of a running look.
    'POST /api/fixtures/identify': (req, res, body) => {
      if (body.off) { state.identify = {}; return json(res, { ok: true, identifying: [] }); }
      const ids = (Array.isArray(body.ids) ? body.ids : [])
        .filter((id) => state.fixtures.some((f) => f.id === id));
      if (!ids.length) return json(res, { error: 'select a fixture to find' }, 400);
      const seconds = Math.max(1, Math.min(120, +body.seconds || 10));
      const until = Date.now() + seconds * 1000;
      const next = {};
      // Expired entries are dropped rather than accumulating: the map is only ever as
      // big as what is flashing right now.
      for (const [id, t] of Object.entries(state.identify || {})) if (t > Date.now()) next[id] = t;
      for (const id of ids) next[id] = until;
      state.identify = next;
      json(res, { ok: true, identifying: Object.keys(next), until });
    },

    'POST /api/fixtures/limits': (req, res, body) => {
      const lim = sanitizeLimits(body.limits || {});
      for (const id of body.ids || []) {
        const f = state.fixtures.find((x) => x.id === id);
        if (f) Object.assign(f.limits, lim);
      }
      engine.cancelFade(); save(); json(res, { ok: true });
    },

    'POST /api/groups/add': (req, res, body) => {
      const ids = (body.ids || []).filter((id) => state.fixtures.some((f) => f.id === id));
      if (!ids.length) return json(res, { error: 'select some fixtures first' }, 400);
      const g = { id: `gp${Date.now().toString(36)}`, name: String(body.name || 'Group').slice(0, 24), ids };
      state.groups.push(g); save(); json(res, { ok: true, group: g });
    },

    'POST /api/groups/remove': (req, res, body) => {
      state.groups = state.groups.filter((g) => g.id !== body.id);
      save(); json(res, { ok: true });
    },

    // Takes {id} or {ids:[...]}. Deleting from the patch grid unpatches a whole selection at
    // once, and one request per fixture would be a burst of round trips racing the debounced
    // save — the last one wins and the rest are lost work.
    'POST /api/fixtures/remove': (req, res, body) => {
      const ids = new Set(Array.isArray(body.ids) ? body.ids : (body.id != null ? [body.id] : []));
      if (!ids.size) return json(res, { error: 'nothing to remove' }, 400);
      const before = state.fixtures.length;
      state.fixtures = state.fixtures.filter((f) => !ids.has(f.id));

      // A group that still lists a deleted fixture keeps a phantom member: it selects
      // nothing, and the group's count lies about what it holds. Prune the dead ids, and
      // drop any group left with none — the same rule /api/groups/add applies at creation.
      for (const g of state.groups) g.ids = g.ids.filter((id) => !ids.has(id));
      const emptied = state.groups.filter((g) => g.ids.length === 0).map((g) => g.id);
      state.groups = state.groups.filter((g) => g.ids.length > 0);

      engine.cancelFade(); save();
      json(res, { ok: true, removed: before - state.fixtures.length, groupsRemoved: emptied });
    },

    'POST /api/fixtures/all': (req, res, body) => {
      const values = body.values ? sanitizeValues(body.values) : null;
      for (const f of state.fixtures) {
        if (values) Object.assign(f.values, values);
        if (body.on != null) f.on = !!body.on;
      }
      state.activeScene = null;
      engine.cancelFade(); save(); pushFrame(); json(res, { ok: true });
    },

    // {channel, value} sets one. {channels:[{universe, channel, value}, ...]} sets many in
    // one request — a fader panel drags across a dozen channels at a time, and one request
    // each would be a burst of round trips racing the 400ms debounced save. A null or
    // negative value releases the channel back to whatever the fixtures are rendering.
    'POST /api/raw': (req, res, body) => {
      if (body.clear) {
        // {clear:true} releases every manual channel; {clear:true, universe:N} releases just
        // that one. "Reset all" on a fader page means the universe in front of you — wiping
        // held channels on universes you cannot see would be a nasty surprise on a big rig.
        if (body.universe != null) {
          const prefix = (body.universe | 0) + ':';
          for (const key of Object.keys(state.raw)) if (key.startsWith(prefix)) delete state.raw[key];
        } else {
          state.raw = {};
        }
      } else if (Array.isArray(body.channels)) {
        for (const c of body.channels) setRaw(c && c.universe, c && c.channel, c && c.value);
      } else if (body.channel) {
        setRaw(body.universe, body.channel, body.value);
      }
      engine.cancelFade(); save(); pushFrame(); json(res, { ok: true, raw: state.raw });
    },

    'POST /api/scenes/save': (req, res, body) => {
      const scene = engine.captureScene(body.name);
      if (body.fadeMs != null) scene.fadeMs = Math.max(0, body.fadeMs | 0);
      state.scenes.push(scene); save(); json(res, { ok: true, scene });
    },

    // Also accepts optional {fx}, {lfos}, {audioCfg} to edit those parts of a saved scene
    // directly — validated by the SAME helpers their live routes use (sanitizeFxPatch,
    // sanitizeLfos, sanitizeAudioCfg), so a scene cannot hold a value the live route would
    // refuse. Only the parts present in the body are replaced: the UI can change a scene's
    // effect without restaging it, and without touching the live desk at all.
    'POST /api/scenes/update': (req, res, body) => {
      const i = state.scenes.findIndex((s) => s.id === body.id);
      if (i === -1) return json(res, { error: 'no such scene' }, 404);
      // Validate the refusable part BEFORE mutating anything, so a rejected body never
      // half-applies its restage or rename first.
      let lfos = null;
      if (body.lfos !== undefined) {
        lfos = sanitizeLfos(body.lfos);
        if (!lfos) return json(res, { error: 'lfos must be an array' }, 400);
      }
      if (body.restage) {
        const captured = engine.captureScene(state.scenes[i].name);
        captured.id = state.scenes[i].id;
        captured.fadeMs = state.scenes[i].fadeMs;
        state.scenes[i] = captured;
      }
      const scene = state.scenes[i];
      if (body.name != null) scene.name = String(body.name).slice(0, 40);
      if (body.fadeMs != null) scene.fadeMs = Math.max(0, body.fadeMs | 0);
      if (body.fx && typeof body.fx === 'object') scene.fx = sanitizeFxPatch(scene.fx, body.fx);
      if (lfos) scene.lfos = lfos;
      if (body.audioCfg && typeof body.audioCfg === 'object') {
        scene.audioCfg = sanitizeAudioCfg({ ...(scene.audioCfg || {}), ...body.audioCfg });
      }
      save(); json(res, { ok: true, scene });
    },

    // Live sets: replaced whole, like /api/lfos. Dead scene ids are kept on purpose — the
    // player marks them missing instead of silently shortening the operator's set.
    'POST /api/sets': (req, res, body) => {
      if (!Array.isArray(body.sets)) return json(res, { error: 'sets must be an array' }, 400);
      state.sets = sanitizeSets(body.sets);
      save(); json(res, { ok: true, sets: state.sets });
    },

    // Replace the whole scene library in one call — a regenerated library lands on the
    // running desk with zero downtime instead of a stop-edit-restart. Values are clamped
    // and the fx/lfos/audioCfg parts go through the same validators as their live routes.
    'POST /api/scenes/replace': (req, res, body) => {
      if (!Array.isArray(body.scenes)) return json(res, { error: 'scenes must be an array' }, 400);
      if (body.scenes.length > 2000) return json(res, { error: 'too many scenes' }, 400);
      const clean = [];
      for (const s of body.scenes) {
        if (!s || typeof s.id !== 'string' || !Array.isArray(s.fixtures)) {
          return json(res, { error: 'every scene needs an id and a fixtures array' }, 400);
        }
        const lfos = s.lfos == null ? undefined : sanitizeLfos(s.lfos);
        if (s.lfos != null && !lfos) return json(res, { error: `scene "${s.name}": bad lfos` }, 400);
        clean.push({
          id: s.id.slice(0, 40),
          name: String(s.name || 'Scene').slice(0, 60),
          fadeMs: Math.max(0, Math.min(60000, s.fadeMs | 0)),
          fixtures: s.fixtures.map((sf) => ({
            id: String(sf.id),
            on: sf.on !== false,
            values: Object.fromEntries(Object.entries(sf.values || {})
              .filter(([k]) => typeof k === 'string' && k.length <= 24)
              .map(([k, v]) => [k, Math.max(0, Math.min(255, +v | 0))])),
          })),
          raw: sanitizeRaw(s.raw),
          // A scene that names no exclude list must not arrive with an empty one: the empty
          // list is "effects on everything", and recalling it un-protected the beams. It
          // is left absent, and recall then keeps whatever the live desk has.
          fx: s.fx ? withoutExcludeIfAbsent(sanitizeFxPatch({ ...DEFAULT_FX }, s.fx), s.fx) : undefined,
          lfos,
          audioCfg: s.audioCfg ? sanitizeAudioCfg(s.audioCfg) : undefined,
        });
      }
      state.scenes = clean;
      const keep = new Set(clean.map((s) => s.id));
      state.chase.sceneIds = state.chase.sceneIds.filter((id) => keep.has(id));
      // Replacing the library can empty the chase; an empty chase is never left armed.
      if (state.chase.sceneIds.length === 0 && state.chase.enabled) {
        state.chase.enabled = false;
        engine.chase.running = false;
      }
      if (state.activeScene && !keep.has(state.activeScene)) state.activeScene = null;
      save(); json(res, { ok: true, count: clean.length });
    },

    'POST /api/scenes/remove': (req, res, body) => {
      state.scenes = state.scenes.filter((s) => s.id !== body.id);
      state.chase.sceneIds = state.chase.sceneIds.filter((id) => id !== body.id);
      // Removing the last step disarms the chase outright — see POST /api/chase.
      if (state.chase.sceneIds.length === 0 && state.chase.enabled) {
        state.chase.enabled = false;
        engine.chase.running = false;
      }
      save(); json(res, { ok: true });
    },

    'POST /api/scenes/recall': (req, res, body) => {
      const scene = state.scenes.find((s) => s.id === body.id);
      // A manual recall takes the rig over: a running chase is PAUSED first, or its next
      // hold would snap the operator's choice back within seconds. The chase engine itself
      // never comes through here — tickChase calls engine.recallScene directly — so this
      // only ever fires on a person pressing a scene button.
      let chasePaused = false;
      if (scene && state.chase.enabled) {
        state.chase.enabled = false;
        engine.chase.running = false;
        chasePaused = true;
      }
      // Before/after comparison so the reply can say what the recall actually did — the UI
      // toasts it, because a scene silently stopping a strobe or releasing held faders is
      // otherwise invisible until something looks wrong.
      const fxWasOn = fxActive(state.fx);
      const rawBefore = Object.keys(state.raw);
      const ok = engine.recallScene(scene, body.fadeMs);
      const out = { ok };
      if (chasePaused) out.chasePaused = true;
      if (ok) {
        const fxIsOn = fxActive(state.fx);
        if (!fxWasOn && fxIsOn) out.fxStarted = state.fx.mode;
        if (fxWasOn && !fxIsOn) out.fxStopped = true;
        const released = rawBefore.filter((k) => !(k in state.raw)).length;
        if (released > 0) out.releasedHolds = released;
      }
      save(); pushFrame(); json(res, out);
    },

    'POST /api/chase': (req, res, body) => {
      const wasEmpty = state.chase.sceneIds.length === 0;
      Object.assign(state.chase, {
        enabled: body.enabled != null ? !!body.enabled : state.chase.enabled,
        sceneIds: Array.isArray(body.sceneIds)
          ? body.sceneIds.filter((id) => typeof id === 'string' && state.scenes.some((s) => s.id === id))
          : state.chase.sceneIds,
        holdMs: body.holdMs != null ? Math.max(50, body.holdMs | 0) : state.chase.holdMs,
        fadeMs: body.fadeMs != null ? Math.max(0, body.fadeMs | 0) : state.chase.fadeMs,
      });
      // A chase with no steps can never be armed: `enabled` left true on an empty list is a
      // landmine — the first "include in chase" later would start a fast chase instantly.
      // For the same reason, adding the first step to an EMPTY list never starts the chase
      // by itself: unless this very request said enabled:true, the transition from empty
      // disarms it and running again is an explicit re-enable.
      if (state.chase.sceneIds.length === 0) state.chase.enabled = false;
      else if (wasEmpty && state.chase.enabled && body.enabled !== true) state.chase.enabled = false;
      if (!state.chase.enabled) engine.chase.running = false;
      save(); json(res, { ok: true, chase: state.chase });
    },

    // The effects engine: mode, tempo, depth and whether it is running. One route for all
    // four because they are one control — setting a mode against a depth left at 4% from
    // last time is exactly how an effect looks broken when it is working perfectly.
    'POST /api/fx': (req, res, body) => {
      // The clamps live in fx.js (sanitizeFxPatch), shared with scene editing — one answer
      // to what a valid fx config is, whichever route it arrives by.
      state.fx = sanitizeFxPatch(state.fx, body);
      // Choosing a mode arms it and choosing "none" disarms it, unless the caller said
      // otherwise: a pad that sets a mode and leaves the engine switched off is a button
      // that visibly does nothing.
      if (body.mode != null && body.enabled == null) state.fx.enabled = state.fx.mode !== 'none';
      save(); pushFrame(); json(res, { ok: true, fx: state.fx });
    },

    // The LFO list, replaced whole. Per-LFO validation lives in lfo.js next to the maths
    // that reads the fields, so a value that gets in is a value the oscillator can run.
    'POST /api/lfos': (req, res, body) => {
      const lfos = sanitizeLfos(body && body.lfos);
      if (!lfos) return json(res, { error: 'lfos must be an array' }, 400);
      state.lfos = lfos;
      save(); pushFrame(); json(res, { ok: true, lfos: state.lfos });
    },

    // Live audio levels, arriving many times a second. Deliberately CHEAP: no save (the
    // levels are volatile by design) and no pushFrame (the 40Hz loop reads them on its
    // next tick anyway — pushing here would double the frame rate under load).
    'POST /api/audio': (req, res, body) => {
      const a = state.audio;
      const now = Date.now();
      const c01 = (v, old) => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : old);
      a.level = c01(body.level, a.level);
      a.low = c01(body.low, a.low);
      a.mid = c01(body.mid, a.mid);
      a.high = c01(body.high, a.high);
      if (body.beat) a.beatAt = now;
      if (body.bpm !== undefined) {
        a.bpm = Number.isFinite(+body.bpm) ? Math.max(20, Math.min(300, +body.bpm)) : null;
      }
      a.lastAt = now;
      json(res, { ok: true });
    },

    // How the audio drives the rig — this half persists.
    'POST /api/audiocfg': (req, res, body) => {
      state.audioCfg = sanitizeAudioCfg({ ...state.audioCfg, ...(body || {}) });
      save(); pushFrame(); json(res, { ok: true, audioCfg: state.audioCfg });
    },

    // Which widget is on the port, and does it open — answerable without moving a light.
    'POST /api/serial/identify': (req, res, body) => {
      const port = body && body.port && PORT_NAME.test(String(body.port).trim()) ? portName(body.port) : state.output.serialPort;
      const probe = state.output.driver === 'enttec' && enttec && enttec.port === port
        ? enttec
        : new Enttec({ port, offline: offline });
      const result = probe.identify();
      if (probe !== enttec) probe.close();
      json(res, { ok: !!result.ok, port, ...result, ports: listPorts(), device: describePort(port) });
    },

    'POST /api/output': (req, res, body) => {
      if (body.mode) state.output.mode = body.mode === 'unicast' ? 'unicast' : 'broadcast';
      if (Array.isArray(body.targets)) state.output.targets = body.targets.map(validIp).filter(Boolean);
      if (body.refreshHz != null) state.output.refreshHz = Math.max(1, Math.min(44, body.refreshHz | 0));
      if (body.driver) state.output.driver = ['enttec', 'sacn', 'artnet'].includes(body.driver) ? body.driver : 'artnet';
      if (body.priority != null) state.output.priority = Math.max(0, Math.min(200, body.priority | 0));
      if (body.enabled != null) state.output.enabled = !!body.enabled;
      if (body.serialPort && PORT_NAME.test(String(body.serialPort).trim())) state.output.serialPort = portName(body.serialPort);
      // Rebuild the driver before answering, so the reply carries the real outcome of the
      // switch. Selecting a port that will not open has to say so here — finding out by
      // noticing the rig is dark is how this project loses an evening.
      const wire = enttecDriver();
      startLoop(); save();
      json(res, {
        ok: true,
        output: state.output,
        serial: wire ? wire.status() : null,
        error: wire && !wire.connected ? wire.lastError : null,
      });
    },

    // Add or change a device sending alongside the main output. {id} updates the one with
    // that id; without an id a new send is added. A rig on two universes with one node and
    // one widget is two lines in this list, and this is the only way to say so.
    'POST /api/output/send': (req, res, body) => {
      const list = state.output.extra || (state.output.extra = []);
      const existing = body && body.id ? list.find((s) => s.id === body.id) : null;
      if (body && body.id && !existing) return json(res, { error: 'no such output' }, 404);
      const send = sanitizeSend(body, existing);
      if (!send) return json(res, { error: 'nothing to add' }, 400);
      if (existing) Object.assign(existing, send);
      else {
        if (list.length >= 16) return json(res, { error: 'sixteen devices is as many as this desk drives' }, 400);
        list.push(send);
      }
      // A serial port cannot be opened twice: the second desk, or the second send, gets
      // "resource busy" and a line that never lights. Say so here rather than at showtime.
      const ports = new Map();
      for (const s of list) {
        if (s.driver !== 'enttec' || !s.enabled) continue;
        if (ports.has(s.serialPort) || (state.output.driver === 'enttec' && s.serialPort === state.output.serialPort)) {
          return json(res, { error: `${s.serialPort} is already driving another output — one program, one port` }, 409);
        }
        ports.set(s.serialPort, s.id);
      }
      closeExtra(send.id);   // rebuild against whatever it now points at
      pruneExtra(); save();
      json(res, { ok: true, send: existing || send, extra: list });
    },

    'POST /api/output/send/remove': (req, res, body) => {
      const id = body && body.id;
      state.output.extra = (state.output.extra || []).filter((s) => s.id !== id);
      closeExtra(id); save();
      json(res, { ok: true, extra: state.output.extra });
    },

    // Add a device by typing its address. This is the path that works on a show network:
    // no internet, no discovery service, nothing to browse — the node is at the address
    // printed on it, and saying so is enough to make it selectable as a unicast target.
    'POST /api/nodes/add': (req, res, body) => {
      const ip = validIp(body && body.address);
      if (!ip) throw new Error('that is not an IP address — four numbers 0-255, like 2.0.0.10');
      const name = body && typeof body.name === 'string' ? body.name.trim().slice(0, 40) : '';
      const existing = state.output.manual.find((m) => m.ip === ip);
      // Adding an address already in the list renames it rather than refusing: the second
      // add is how you correct a name, and a duplicate row would be two of the same device.
      if (existing) existing.name = name || existing.name;
      else state.output.manual.push({ ip, name });
      save();
      // Ask it who it is straight away, so a device that DOES answer shows its name in the
      // list within the second rather than at the next 10s sweep.
      if (state.output.driver !== 'enttec') artnet.poll([ip]);
      // Typing an address means 'send the show there' — that is the whole reason the address
      // is being typed. Broadcast only reaches the desk's own subnet, and Art-Net gear
      // routinely ships on 2.x.x.x where the broadcast cannot follow, so adding a device and
      // leaving the output pointed somewhere else would add a row that does nothing. Pass
      // send:false to only list it.
      const send = !body || body.send !== false;
      if (send) {
        state.output.mode = 'unicast';
        if (!state.output.targets.includes(ip)) state.output.targets.push(ip);
        save();
      }
      json(res, { ok: true, sending: send, output: state.output, manual: state.output.manual, nodes: nodeList() });
    },

    // Removing a device also stops the show being sent to it. Leaving the address behind in
    // `targets` would keep unicasting at a device that is no longer listed anywhere — the
    // desk would be talking to something the interface says is not part of the rig.
    'POST /api/nodes/remove': (req, res, body) => {
      const ip = validIp(body && body.address);
      state.output.manual = state.output.manual.filter((m) => m.ip !== ip);
      state.output.targets = state.output.targets.filter((t) => t !== ip);
      save();
      json(res, { ok: true, manual: state.output.manual, targets: state.output.targets, nodes: nodeList() });
    },

    // Optional {address} chases one specific node. Worth having when the node is on a
    // foreign subnet and cannot hear the broadcast — the reply still finds its way back,
    // so a direct poll answers "is it reachable at all" when the broadcast says nothing.
    'POST /api/discover': (req, res, body) => {
      const extra = [];
      if (body && typeof body.address === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(body.address.trim())) {
        extra.push(body.address.trim());
      }
      artnet.poll([...state.output.targets, ...extra]);
      json(res, { ok: true, polled: artnet.pollTargets([...state.output.targets, ...extra]) });
    },
  };

  async function handle(req, res, pathname) {
    const url = new URL(req.url, 'http://localhost');
    if (pathname == null) pathname = url.pathname;
    if (pathname === '') pathname = '/';
    if (pathname === FAVICON_204) { res.writeHead(204); return res.end(); }
    const key = req.method + ' ' + pathname;
    if (routes[key]) {
      try {
        // Under Express the JSON body has already been parsed (and the stream drained);
        // standing alone the desk reads it itself.
        const body = req.method !== 'POST' ? null : (req.body && typeof req.body === 'object' ? req.body : await readBody(req));
        // Awaited, not merely returned: a route that reaches the network (the fixture
      // library) rejects asynchronously, and an un-awaited rejection left the caller
      // holding an open socket for ever while the desk logged to a console nobody reads.
      return await routes[key](req, res, body);
      } catch (e) {
        json(res, { error: e.message }, e.status || 400);
        // An oversize upload is not drained: the socket goes once the refusal is out.
        if (e.status === 413) res.on('finish', () => req.destroy());
        return undefined;
      }
    }
    if (pathname.indexOf('/api/') === 0) return json(res, { error: 'not found' }, 404);

    // A malformed escape in the path (`/%`) threw here, outside every catch, and one
    // request from anyone on the wifi ended the process and the show with it.
    let rel;
    try { rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)); }
    catch (e) { res.writeHead(400); return res.end('bad path'); }
    const file = path.join(PUBLIC, rel);
    if (file !== PUBLIC && file.indexOf(PUBLIC + path.sep) !== 0) { res.writeHead(403); return res.end('forbidden'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  }

  function close() {
    clearInterval(timer);
    clearInterval(pollTimer);
    clearTimeout(firstPoll);
    try { writeShow(); } catch (e) { log('could not save the show on close: ' + e.message); }
    artnet.close();
    if (enttec) enttec.close();
    if (sacn) sacn.close();
  }

  return { handle, close, state, engine, writeShow, summary, showFile: SHOW };
}

module.exports = { createDesk };
