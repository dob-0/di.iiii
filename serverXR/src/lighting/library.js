'use strict';
// THE FIXTURE LIBRARY — patching by name instead of by channel order.
//
// Until now a fixture was patched by picking a profile whose NAME is its channel order:
// `ptdrgbws` is pan, tilt, dimmer, red, green, blue, white, strobe. That is honest and
// fast for someone who knows it, and it is a wall for everyone else — you have to read
// the fixture's DMX chart and translate it yourself, and a wrong guess puts every
// channel one place out.
//
// The Open Fixture Library (open-fixture-library.org, MIT, ~630 fixtures across 132
// manufacturers) publishes those charts as JSON with SEMANTIC capabilities: this channel
// is Intensity, that one is ColorIntensity/Red, that one is a Pan with a fine byte. So a
// fixture can be imported by name and become one of this desk's profiles.
//
// It carries one thing that matters more than the channel order: `defaultValue`. On a
// great many moving heads the shutter sits on the strobe channel and 0 means CLOSED, so
// a head patched with a generic default comes up dark however far its dimmer is pushed —
// a fixture that looks broken and is merely shut. This desk learnt that the hard way on
// a real rig. The library knows the answer, so an imported fixture arrives with it.
//
// Nothing is vendored: the catalogue is fetched when asked for and cached on disk beside
// the show, so a venue with no internet still has whatever it imported before. No
// dependency, node:https only — the same rule as the rest of the desk, and the same
// reason serverXR bans global fetch.

const fs = require('fs');
const path = require('path');
const https = require('https');

const HOST = 'open-fixture-library.org';
const CACHE_MS = 24 * 60 * 60 * 1000;

// ---- fetching -------------------------------------------------------------

function get(urlPath, { timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      host: HOST, path: urlPath, headers: { accept: 'application/json', 'user-agent': 'di.iiii lighting desk' },
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`the fixture library answered ${res.statusCode} for ${urlPath}`));
        return;
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(new Error('the fixture library sent something that is not JSON')); }
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('the fixture library did not answer in time')));
    req.on('error', (e) => reject(new Error(`could not reach the fixture library: ${e.message}`)));
  });
}

// A read-through cache on disk. The catalogue is the same all night; a venue on a phone
// hotspot should pay for it once, and a venue with no internet at all should still be
// able to patch the fixtures it imported at home.
function cached(dir, name, maxAgeMs = CACHE_MS) {
  const file = path.join(dir, name);
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > maxAgeMs) return { stale: true, file, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
    return { stale: false, file, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) { return { stale: true, file, value: null }; }
}

function store(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  } catch (e) { /* a cache that cannot be written is not a reason to fail the import */ }
}

async function fetchWithCache(dir, name, urlPath) {
  const hit = cached(dir, name);
  if (hit.value && !hit.stale) return { value: hit.value, from: 'cache' };
  try {
    const value = await get(urlPath);
    store(hit.file, value);
    return { value, from: 'library' };
  } catch (e) {
    // Stale beats nothing: an old catalogue still patches the fixture in front of you.
    if (hit.value) return { value: hit.value, from: 'cache (offline)', warning: e.message };
    throw e;
  }
}

const manufacturers = (dir) => fetchWithCache(dir, 'manufacturers.json', '/api/v1/manufacturers');
const manufacturer = (dir, key) =>
  fetchWithCache(dir, path.join('manufacturers', `${safeKey(key)}.json`), `/api/v1/manufacturers/${encodeURIComponent(key)}`);
const fixture = (dir, man, key) =>
  fetchWithCache(dir, path.join('fixtures', safeKey(man), `${safeKey(key)}.json`),
    `/${encodeURIComponent(man)}/${encodeURIComponent(key)}.json`);

// Keys come from the network and become file paths. Anything but a plain key is refused
// rather than sanitised into something else — a traversal must not be silently rewritten
// into a valid-looking read.
function safeKey(key) {
  const k = String(key || '');
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(k)) throw new Error(`"${k}" is not a fixture key`);
  return k;
}

// ---- converting -----------------------------------------------------------

// An OFL colour name to this desk's emitter role. Cyan and magenta have no emitter here
// (subtractive wheels on a moving head, not LEDs) and land on spares.
const COLOUR_ROLE = {
  Red: 'r', Green: 'g', Blue: 'b', White: 'w', Amber: 'a', UV: 'uv', Lime: 'lime',
  Yellow: 'y', 'Warm White': 'warm', 'Cold White': 'cool',
};

// A capability type to a role. Order matters: the first capability that names something
// this desk understands wins, because a wheel channel is typically NoFunction at 0 and
// only says what it is further up its range.
const TYPE_ROLE = {
  Intensity: 'dimmer',
  Pan: 'pan', Tilt: 'tilt', PanTiltSpeed: 'speed',
  ShutterStrobe: 'strobe', StrobeSpeed: 'speed', StrobeDuration: 'speed',
  Zoom: 'zoom', Focus: 'focus', Iris: 'iris', Prism: 'prism', PrismRotation: 'rotation',
  Frost: 'frost', Fog: 'aux', FogOutput: 'aux', Rotation: 'rotation', Speed: 'speed',
  Maintenance: 'aux', Effect: 'aux', EffectSpeed: 'speed', EffectDuration: 'speed',
  BladeInsertion: 'aux', BladeRotation: 'aux', Generic: 'aux', NoFunction: 'aux',
  ColorTemperature: 'aux', SoundSensitivity: 'sound',
};

const has = (text, word) => text.toLowerCase().includes(word);

// What a single OFL channel is, in this desk's vocabulary.
function roleFor(name, channel) {
  const caps = channel && (channel.capabilities || (channel.capability ? [channel.capability] : [])) || [];
  const label = String(name || '');
  // Wheels are named by the channel, not the capability: a WheelSlot could be colour or
  // gobo, and only the channel's own name says which.
  const wheelish = caps.some((c) => String(c.type || '').startsWith('Wheel'));
  if (wheelish) {
    if (has(label, 'colour') || has(label, 'color')) return has(label, 'rot') ? 'rotation' : 'color';
    if (has(label, 'gobo')) return has(label, 'rot') || has(label, 'index') ? 'rotation' : 'gobo';
    return 'aux';
  }
  for (const cap of caps) {
    const type = String(cap.type || '');
    if (type === 'ColorIntensity') {
      const role = COLOUR_ROLE[cap.color];
      if (role) return role;
      return 'aux';
    }
    const mapped = TYPE_ROLE[type];
    // NoFunction is a placeholder at the bottom of a range; keep looking for a real one.
    if (mapped && type !== 'NoFunction') return mapped;
  }
  // Nothing semantic — fall back to the words on the chart, which are usually honest.
  if (has(label, 'dimmer') || has(label, 'intensity') || has(label, 'master')) return 'dimmer';
  if (has(label, 'strobe') || has(label, 'shutter')) return 'strobe';
  if (has(label, 'macro')) return 'macro';
  if (has(label, 'sound')) return 'sound';
  if (has(label, 'speed')) return 'speed';
  if (has(label, 'reset') || has(label, 'control') || has(label, 'function')) return 'control';
  return 'aux';
}

// A profile name this desk will accept: 24 characters, letters and numbers to start.
function profileName(fixtureName, modeName, taken) {
  const clean = (s) => String(s || '').replace(/[^A-Za-z0-9 _-]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = clean(fixtureName) || 'Fixture';
  const mode = clean(modeName);
  // The mode belongs in the name when a fixture has several: "Spot 260" in 8-channel and
  // in 14-channel are different fixtures as far as a patch is concerned.
  let candidate = (mode ? `${base} ${mode.replace(/-?channel$/i, 'ch').replace(/\s+/g, '')}` : base).slice(0, 24).trim();
  if (!/^[A-Za-z0-9]/.test(candidate)) candidate = `F ${candidate}`.slice(0, 24).trim();
  if (!taken || !taken(candidate)) return candidate;
  for (let n = 2; n < 100; n++) {
    const numbered = `${candidate.slice(0, 21).trim()} ${n}`;
    if (!taken(numbered)) return numbered;
  }
  throw new Error('too many fixtures already named that');
}

// One OFL mode → one profile for this desk: an ordered list of roles, plus the resting
// values the chart specifies.
function toProfile(oflFixture, modeIndex, { taken, spares = 16 } = {}) {
  const modes = Array.isArray(oflFixture && oflFixture.modes) ? oflFixture.modes : [];
  const mode = modes[modeIndex];
  if (!mode) throw new Error('no such mode on that fixture');
  const available = oflFixture.availableChannels || {};
  const channels = [];
  const defaults = {};
  const used = new Set();
  let auxAt = 1;

  // Which channel a fine alias belongs to, so "Pan fine" becomes panFine rather than a
  // spare — the 16-bit low byte has to sit with its coarse channel or movement is jerky.
  const fineOwner = new Map();
  for (const [name, ch] of Object.entries(available)) {
    for (const alias of ch.fineChannelAliases || []) fineOwner.set(alias, name);
  }

  const claim = (role) => {
    if (role !== 'aux' && !used.has(role)) { used.add(role); return role; }
    // A role this fixture already uses, or an explicit spare: give it its own identity,
    // because a profile that repeats a role drives two channels from one value.
    while (auxAt <= spares) {
      const spare = `aux${auxAt++}`;
      if (!used.has(spare)) { used.add(spare); return spare; }
    }
    throw new Error(`${oflFixture.name} has more channels than this desk has spare roles`);
  };

  for (const entry of mode.channels) {
    // A null in the order is a channel the mode does not use — it still occupies its
    // slot on the wire, so it must occupy one here.
    if (entry === null || entry === undefined) { channels.push(claim('aux')); continue; }
    const name = typeof entry === 'string' ? entry : (entry && entry.insert ? null : null);
    if (name === null) { channels.push(claim('aux')); continue; }
    const owner = fineOwner.get(name);
    if (owner) {
      const coarse = roleFor(owner, available[owner]);
      const fine = coarse === 'pan' ? 'panFine' : coarse === 'tilt' ? 'tiltFine' : coarse === 'dimmer' ? 'dimmerFine' : 'aux';
      channels.push(claim(fine));
      continue;
    }
    const channel = available[name];
    const role = claim(roleFor(name, channel));
    channels.push(role);
    // The resting value from the chart. This is the line that stops an imported moving
    // head coming up dark with a shut shutter and a correct-looking patch.
    const def = channel && channel.defaultValue;
    if (Number.isFinite(+def) && +def > 0) defaults[role] = Math.max(0, Math.min(255, Math.round(+def)));
  }

  return {
    name: profileName(oflFixture.name, mode.name, taken),
    channels,
    cat: (oflFixture.categories || []).some((c) => /moving head|scanner/i.test(c)) ? '_MOVING' : '_GENERIC',
    defaults: Object.keys(defaults).length ? defaults : undefined,
    source: { library: 'open-fixture-library', name: oflFixture.name, mode: mode.name },
  };
}

// What the interface offers before an import: the modes, and what each one would become.
function describe(oflFixture) {
  return {
    name: oflFixture.name,
    categories: oflFixture.categories || [],
    modes: (oflFixture.modes || []).map((mode, i) => ({
      index: i,
      name: mode.name,
      channels: mode.channels.length,
      roles: (() => { try { return toProfile(oflFixture, i).channels; } catch (e) { return null; } })(),
    })),
  };
}

module.exports = { manufacturers, manufacturer, fixture, toProfile, describe, roleFor, profileName, safeKey };
