'use strict';
// THE PIXEL STRIP — one lamp that is N RGB (or RGBW) pixels in a line.
//
// A WLED-style receiver (WLED docs, "E1.31 / Art-Net realtime") listens to DMX and lights one
// pixel per 3 channels (RGB) or 4 (RGBW), from a start universe and a start address, over as
// many consecutive universes as the strip needs. This file is everything the desk must know
// about that, as plain functions with no I/O: the settings and their defaults, the colour
// order, how the pixels are cut into universes, what a bad patch is refused for, and how a
// frame of pixels is written into the desk's universe buffers.
//
// A pixel is never split across two universes (a universe is 512 slots; 512 / 3 = 170 RGB
// pixels, 512 / 4 = 128 RGBW pixels, the rest of the universe is left unused) — the same
// rule every pixel controller and WLED itself follow. `pixelsPerUniverse` may be set lower
// than that ceiling for a receiver that wants a fixed cut (150, 144, ...).
//
// Nothing here is a constant of one rig: the pixel count, the order, the start, the layout
// and the address of the receiver are all settings with the defaults below. The rig survey
// (Light v3 PLAN.md step 1.1) fills them in; until then a strip is what it is told to be.
//
// Universe numbers are the desk's own: 0-based (U1 = 0). Messages say them the way every
// page of the desk does, starting at 1, so a person reads the same number on both sides.
// Channels are 1..512.

const SLOTS = 512;                 // DMX slots in one universe (E1.11)
const MAX_UNIVERSE = 32767;        // Art-Net 4 port-address ceiling (15 bit); the desk's own ceiling
const MAX_PIXELS = 8192;           // sanity ceiling per strip (48 universes of RGB); not a protocol limit
const NAME_MAX = 60;

const LAYOUT_DEFAULT = { x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 };

// Every default in one place. None of these is a fact about a rig.
const DEFAULTS = Object.freeze({
  name: 'Pixel strip',
  pixels: 60,
  // WLED reorders colours itself from its own LED settings, so what arrives over Art-Net/sACN
  // is RGB. Controllers that pass the data straight to the LEDs (GRB WS2812 etc.) need the
  // order the LEDs want: set it here.
  order: 'RGB',
  startUniverse: 0,
  startAddress: 1,
  pixelsPerUniverse: null,         // null = the ceiling for the order (170 RGB / 128 RGBW)
  layout: LAYOUT_DEFAULT,
  color: { r: 255, g: 255, b: 255, w: 0 },
  level: 255,
  on: true,
  autoWhite: false,                // RGBW: take the white out of r/g/b when w is not given
  test: '',                        // '' | walk | red | green | blue | white — to see order and ends on the real strip
  testRate: 20,                    // pixels per second for `walk`
  frameTtlMs: 2000,                // a live frame older than this is dropped and the colour takes over
  output: { driver: '', host: '' },  // '' = the desk's own output; artnet|sacn + host = its own route
});

const TESTS = ['', 'walk', 'red', 'green', 'blue', 'white'];

// The type as the one library describes a lamp: what it is, what it can be set to, what the
// defaults are and how the numbers are known. Served by GET /api/strips so a form is built
// from it, never from constants of its own.
const PIXEL_STRIP_TYPE = Object.freeze({
  id: 'pixel-strip',
  kind: 'parametric',
  category: 'pixel-strip',
  words: 'A line of pixels, patched as one lamp over as many universes as it needs.',
  settings: {
    pixels: { min: 1, max: MAX_PIXELS, default: DEFAULTS.pixels },
    order: { values: [...permutations('RGB'), ...permutations('RGBW')], default: DEFAULTS.order },
    startUniverse: { min: 0, max: MAX_UNIVERSE, default: DEFAULTS.startUniverse, note: 'desk number, U1 = 0' },
    startAddress: { min: 1, max: SLOTS, default: DEFAULTS.startAddress },
    pixelsPerUniverse: { min: 1, max: 'floor(512 / channels per pixel)', default: null, note: 'null = 170 RGB, 128 RGBW' },
    layout: { default: LAYOUT_DEFAULT, note: 'a line on the stage from (x1,y1) to (x2,y2), 0..1' },
    output: { drivers: ['', 'artnet', 'sacn'], default: DEFAULTS.output },
  },
  provenance: {
    basis: 'DATASHEET',
    note: 'universe cut and channel order follow the WLED docs (E1.31 / Art-Net realtime) and E1.31/E1.11; counts, order and address of the Hayfilm strip are NOT known yet (rig survey owed)',
    accessed: '2026-10-22',
  },
});

function permutations(s) {
  if (s.length <= 1) return [s];
  const out = [];
  for (let i = 0; i < s.length; i++) for (const p of permutations(s.slice(0, i) + s.slice(i + 1))) out.push(s[i] + p);
  return out;
}

const inUniverseLabel = (u) => u + 1;     // the desk shows universes from 1

// ---- the order ---------------------------------------------------------------

// 'grb' -> 'GRB'. Any arrangement of R,G,B (three channels) or R,G,B,W (four) is allowed.
function normalizeOrder(raw) {
  const o = String(raw == null || raw === '' ? DEFAULTS.order : raw).toUpperCase();
  const ok = (o.length === 3 && [...'RGB'].every((c) => o.includes(c)))
    || (o.length === 4 && [...'RGBW'].every((c) => o.includes(c)));
  if (!ok) return { ok: false, error: `colour order "${raw}" is not an arrangement of R, G, B (or R, G, B, W) — for example RGB, GRB, RGBW` };
  return { ok: true, order: o };
}

const channelsPerPixel = (order) => order.length;
const maxPixelsPerUniverse = (order) => Math.floor(SLOTS / order.length);

// ---- the plan ----------------------------------------------------------------

const int = (v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN);

// Settings in, the plan out — or the reason it was refused. Pure; nothing is stored.
//   plan.spans: one per universe used { universe, address, first, count, channels }
//     address = first channel of the span (1-based); first = index of its first pixel.
function planStrip(raw = {}) {
  const ord = normalizeOrder(raw.order);
  if (!ord.ok) return ord;
  const order = ord.order;
  const per = channelsPerPixel(order);
  const ceiling = maxPixelsPerUniverse(order);

  const pixels = int(raw.pixels == null ? DEFAULTS.pixels : raw.pixels);
  if (!Number.isInteger(pixels) || pixels < 1 || pixels > MAX_PIXELS) {
    return { ok: false, error: `a strip has 1 to ${MAX_PIXELS} pixels, not ${raw.pixels}` };
  }
  const startUniverse = int(raw.startUniverse == null ? DEFAULTS.startUniverse : raw.startUniverse);
  if (!Number.isInteger(startUniverse) || startUniverse < 0 || startUniverse > MAX_UNIVERSE) {
    return { ok: false, error: `start universe ${raw.startUniverse} is outside the desk's 1 to ${MAX_UNIVERSE + 1}` };
  }
  const startAddress = int(raw.startAddress == null ? DEFAULTS.startAddress : raw.startAddress);
  if (!Number.isInteger(startAddress) || startAddress < 1 || startAddress > SLOTS) {
    return { ok: false, error: `start address ${raw.startAddress} is outside 1 to ${SLOTS}` };
  }
  const room = Math.floor((SLOTS - startAddress + 1) / per);
  if (room < 1) {
    return {
      ok: false,
      error: `address ${startAddress} leaves ${SLOTS - startAddress + 1} channel${SLOTS - startAddress + 1 === 1 ? '' : 's'} in universe ${inUniverseLabel(startUniverse)}, and one ${order} pixel needs ${per} — start at ${SLOTS - per + 1} or lower, or in the next universe`,
    };
  }
  let ppu = raw.pixelsPerUniverse == null || raw.pixelsPerUniverse === '' ? ceiling : int(raw.pixelsPerUniverse);
  if (!Number.isInteger(ppu) || ppu < 1 || ppu > ceiling) {
    return { ok: false, error: `pixels per universe must be 1 to ${ceiling} for ${order} (${per} channels per pixel, a pixel is never split across universes), not ${raw.pixelsPerUniverse}` };
  }

  const spans = [];
  let left = pixels;
  let universe = startUniverse;
  let address = startAddress;
  let first = 0;
  while (left > 0) {
    const fit = Math.min(ppu, Math.floor((SLOTS - address + 1) / per));
    const count = Math.min(left, fit);
    spans.push({ universe, address, first, count, channels: count * per });
    left -= count;
    first += count;
    universe += 1;
    address = 1;
    if (left > 0 && universe > MAX_UNIVERSE) {
      const needed = startUniverse + Math.ceil((pixels - spans[0].count) / ppu) + 1;
      return {
        ok: false,
        error: `${pixels} ${order} pixels from universe ${inUniverseLabel(startUniverse)}, address ${startAddress} need universes ${inUniverseLabel(startUniverse)} to ${needed}, and the highest is ${MAX_UNIVERSE + 1} — start lower or use fewer pixels`,
      };
    }
  }
  const last = spans[spans.length - 1];
  return {
    ok: true,
    plan: {
      order, channelsPerPixel: per, pixelsPerUniverse: ppu, pixels,
      spans,
      universes: spans.map((s) => s.universe),
      end: { universe: last.universe, channel: last.address + last.channels - 1 },
    },
  };
}

// Where pixel i lives: { universe, channel } (channel is the 1-based first one of its colour channels).
function pixelAt(plan, i) {
  for (const s of plan.spans) {
    if (i >= s.first && i < s.first + s.count) return { universe: s.universe, channel: s.address + (i - s.first) * plan.channelsPerPixel };
  }
  return null;
}

// The channels the strip takes: { universe, from, to } per span, 1-based inclusive.
const claimedRanges = (plan) => plan.spans.map((s) => ({ universe: s.universe, from: s.address, to: s.address + s.channels - 1 }));

// What the strip would sit on: the first overlap with a fixture or another strip, or null.
//   `fixtures` as the desk holds them; `widthOf(fixture)` is its footprint; `strips` are stored strips.
function findConflict(plan, { fixtures = [], widthOf = () => 1, strips = [], ignoreId = null } = {}) {
  const mine = claimedRanges(plan);
  for (const f of fixtures) {
    const w = widthOf(f);
    for (const r of mine) {
      if (r.universe !== f.universe) continue;
      const from = Math.max(r.from, f.address);
      if (from <= Math.min(r.to, f.address + w - 1)) {
        return `channel ${from} of universe ${inUniverseLabel(r.universe)} is taken by ${f.index != null ? f.index + '.' : ''}${f.name || f.profile} — patch the strip somewhere else`;
      }
    }
  }
  for (const s of strips) {
    if (s.id === ignoreId) continue;
    const other = planStrip(s);
    if (!other.ok) continue;
    for (const r of mine) for (const q of claimedRanges(other.plan)) {
      if (r.universe !== q.universe) continue;
      const from = Math.max(r.from, q.from);
      if (from <= Math.min(r.to, q.to)) {
        return `channel ${from} of universe ${inUniverseLabel(r.universe)} is taken by the strip "${s.name}" — patch the strip somewhere else`;
      }
    }
  }
  return null;
}

// ---- settings in, stored strip out --------------------------------------------

let nextId = 1;
const clamp01 = (v, d) => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : d);
const byte = (v, d) => (Number.isFinite(+v) ? Math.min(255, Math.max(0, Math.round(+v))) : d);
const HOST_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

// A stored strip is the settings, normalised. It does not hold the plan (derived each time).
// Returns { ok, strip } or { ok:false, error } — a strip whose settings cannot be planned is refused here.
function makeStrip(raw = {}, base = null) {
  const src = { ...(base || DEFAULTS), ...raw };
  const p = planStrip(src);
  if (!p.ok) return p;
  const lay = src.layout && typeof src.layout === 'object' ? src.layout : LAYOUT_DEFAULT;
  const col = src.color && typeof src.color === 'object' ? src.color : DEFAULTS.color;
  const out = src.output && typeof src.output === 'object' ? src.output : DEFAULTS.output;
  const driver = ['artnet', 'sacn'].includes(out.driver) ? out.driver : '';
  const host = typeof out.host === 'string' ? out.host.trim() : '';
  if (driver && !HOST_RE.test(host)) return { ok: false, error: `the receiver's address "${out.host}" is not an IPv4 address like 192.168.4.20` };
  const test = TESTS.includes(src.test) ? src.test : '';
  const strip = {
    id: typeof src.id === 'string' && src.id ? src.id.slice(0, 40) : `st${Date.now().toString(36)}${(nextId++).toString(36)}`,
    name: String(src.name || DEFAULTS.name).slice(0, NAME_MAX),
    pixels: p.plan.pixels,
    order: p.plan.order,
    startUniverse: p.plan.spans[0].universe,
    startAddress: p.plan.spans[0].address,
    pixelsPerUniverse: src.pixelsPerUniverse == null || src.pixelsPerUniverse === '' ? null : p.plan.pixelsPerUniverse,
    layout: { x1: clamp01(lay.x1, LAYOUT_DEFAULT.x1), y1: clamp01(lay.y1, LAYOUT_DEFAULT.y1), x2: clamp01(lay.x2, LAYOUT_DEFAULT.x2), y2: clamp01(lay.y2, LAYOUT_DEFAULT.y2) },
    color: { r: byte(col.r, 255), g: byte(col.g, 255), b: byte(col.b, 255), w: byte(col.w, 0) },
    level: byte(src.level, 255),
    on: src.on !== false,
    autoWhite: src.autoWhite === true,
    test,
    testRate: Math.min(1000, Math.max(0.1, Number.isFinite(+src.testRate) ? +src.testRate : DEFAULTS.testRate)),
    frameTtlMs: Math.min(60000, Math.max(100, Number.isFinite(+src.frameTtlMs) ? +src.frameTtlMs : DEFAULTS.frameTtlMs)),
    output: { driver, host: driver ? host : '' },
  };
  return { ok: true, strip, plan: p.plan };
}

// A list from a show file: strips that cannot be planned are dropped (never invented), the rest kept as saved.
function sanitizeStrips(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of list.slice(0, 64)) {
    if (!raw || typeof raw !== 'object') continue;
    const m = makeStrip(raw, {});
    if (!m.ok || seen.has(m.strip.id)) continue;
    seen.add(m.strip.id);
    out.push(m.strip);
  }
  return out;
}

// What a page needs about a strip: the settings, the plan, nothing of the live frame.
function describe(strip) {
  const p = planStrip(strip);
  return { ...strip, plan: p.ok ? p.plan : null, error: p.ok ? null : p.error };
}

// ---- colour, order, bytes ------------------------------------------------------

// The colour pixel i should show, 0..255 each: a live frame if fresh, else a test, else the colour.
// `frame` is { data: Uint8Array of r,g,b,w per pixel, at } or null.
function pixelColor(strip, i, now, frame) {
  if (strip.test) {
    if (strip.test === 'walk') {
      const head = Math.floor((now / 1000) * strip.testRate) % strip.pixels;
      return i === head ? [255, 255, 255, 0] : [0, 0, 0, 0];
    }
    return { red: [255, 0, 0, 0], green: [0, 255, 0, 0], blue: [0, 0, 255, 0], white: [255, 255, 255, 0] }[strip.test];
  }
  if (frame && frame.data && now - frame.at <= strip.frameTtlMs) {
    const o = i * 4;
    return [frame.data[o], frame.data[o + 1], frame.data[o + 2], frame.data[o + 3]];
  }
  const c = strip.color;
  return [c.r, c.g, c.b, c.w];
}

// The channel values of one pixel in the strip's order. [r,g,b,w] in, `order.length` bytes out.
function encodePixel(order, rgbw, { autoWhite = false } = {}) {
  let [r, g, b, w] = rgbw;
  if (order.length === 4 && autoWhite && !w) {
    w = Math.min(r, g, b);
    r -= w; g -= w; b -= w;
  }
  const by = { R: r, G: g, B: b, W: w };
  const out = new Array(order.length);
  for (let k = 0; k < order.length; k++) out[k] = by[order[k]] || 0;
  return out;
}

// Write the strip into the universe buffers. `bufferFor(universe)` gives a 512-slot array.
// `scale` is master x level (0..1), blackout is a scale of 0 — zero wins, as for every lamp.
function renderStrip(strip, plan, bufferFor, { now = Date.now(), frame = null, scale = 1 } = {}) {
  const level = strip.on ? scale * (strip.level / 255) : 0;
  for (const s of plan.spans) {
    const buf = bufferFor(s.universe);
    for (let k = 0; k < s.count; k++) {
      const px = level > 0 ? pixelColor(strip, s.first + k, now, frame) : [0, 0, 0, 0];
      const bytes = encodePixel(plan.order, px, strip);
      const base = s.address - 1 + k * plan.channelsPerPixel;
      for (let c = 0; c < bytes.length; c++) buf[base + c] = Math.round(bytes[c] * level);
    }
  }
}

module.exports = {
  SLOTS, MAX_UNIVERSE, MAX_PIXELS, DEFAULTS, TESTS, PIXEL_STRIP_TYPE,
  normalizeOrder, channelsPerPixel, maxPixelsPerUniverse,
  planStrip, pixelAt, claimedRanges, findConflict,
  makeStrip, sanitizeStrips, describe,
  pixelColor, encodePixel, renderStrip,
};
