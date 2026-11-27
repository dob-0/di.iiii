'use strict';
// PAD ORDER — which look sits on which APC40 pad (owner N7302/N7303, 2026-11-27: "the left pad
// column holds the darkest scenes, the right column the brightest, on every row and both pages").
//
// `state.padOrder` is a list of look ids (null entries are empty slots) or null. Null = the pads
// play `looks` in desk order as before. `state.looks` itself is never reordered: cues and ids
// stay. The grid pad k on page p plays padOrder[40 * p + k]; the page's mapping function is
// padLooks() in ui/midiCues.js, the one place that turns (looks, padOrder) into slots.
//
// Brightness = the mean light a look emits over all its steps and fixtures. Per cell (one
// fixture's values in one step): dimmer/255 * (r + g + b + 1.5 w) / 255 (a pixel bar r1..w1, r2.. has one cell per number). A 16-bit dimmer is
// dimmer + dimmer_fine/256. A cell with no dimmer role is at full dimmer. A pointer value
// ({ref}) is not a number and counts 0. No literature behind it: the owner's own metric, the
// weights are the desk's (white carries about 1.5 of one colour channel).

const COLUMNS = 8;
const ROWS_PER_PAGE = 5;
const PAD_SLOTS = COLUMNS * ROWS_PER_PAGE;
const MAX_PAD_SLOTS = 2000;

const level = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// A fixture's emitters are r/g/b/w (one cell) or r1 g1 b1 w1, r2 ... (a pixel bar: one cell per
// number). The dimmer belongs to the whole fixture. Returns the light of each cell, 0..4.5.
function cellLights(values) {
  if (!values || typeof values !== 'object') return [];
  const hasDimmer = typeof values.dimmer === 'number';
  const dim = hasDimmer ? (level(values.dimmer) + level(values.dimmer_fine) / 256) / 255 : 1;
  const cells = new Map();
  for (const role of Object.keys(values)) {
    const m = /^([rgbw])(\d*)$/.exec(role);
    if (!m) continue;
    const c = cells.get(m[2]) || { r: 0, g: 0, b: 0, w: 0 };
    c[m[1]] = level(values[role]);
    cells.set(m[2], c);
  }
  return [...cells.values()].map((c) => dim * (c.r + c.g + c.b + 1.5 * c.w) / 255);
}

// One number per look, 0 = dark, about 1 = one colour channel full. Mean over every cell of
// every fixture of every step.
function lookBrightness(look) {
  let sum = 0, n = 0;
  for (const step of (look && Array.isArray(look.steps)) ? look.steps : []) {
    const values = step && step.values;
    if (!values || typeof values !== 'object') continue;
    for (const id of Object.keys(values)) for (const x of cellLights(values[id])) { sum += x; n++; }
  }
  return n ? sum / n : 0;
}

// Eight bands of the looks sorted dark to bright (ties keep desk order); band c is column c.
// Within a column the looks keep desk order. Row r of column c is slot 8r + c, so five rows
// make a page. A short band leaves a null (empty slot) at the foot of its column.
function brightnessOrder(looks, scores) {
  const list = Array.isArray(looks) ? looks : [];
  const n = list.length;
  const idx = list.map((_, i) => i).sort((a, b) => (scores[a] - scores[b]) || (a - b));
  const bands = [];
  const base = Math.floor(n / COLUMNS), extra = n % COLUMNS;
  let at = 0;
  for (let c = 0; c < COLUMNS; c++) {
    const size = base + (c < extra ? 1 : 0);
    bands.push(idx.slice(at, at + size).sort((a, b) => a - b));
    at += size;
  }
  const rows = Math.max(0, ...bands.map((b) => b.length));
  const out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < COLUMNS; c++) {
    const i = bands[c][r];
    out.push(i == null ? null : list[i].id);
  }
  return out;
}

// A saved or posted order: ids of looks that exist (the same id twice is fine), null = empty
// slot; an id no look has becomes an EMPTY slot (so a deleted look never moves the other pads),
// other junk is dropped; trailing empties cut. Nothing left -> null.
function sanitizePadOrder(order, looks) {
  if (!Array.isArray(order)) return null;
  const known = new Set((Array.isArray(looks) ? looks : []).map((l) => l.id));
  const out = [];
  for (const v of order.slice(0, MAX_PAD_SLOTS)) {
    if (v === null) out.push(null);
    else if (typeof v === 'string') out.push(known.has(v) ? v : null);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out.length ? out : null;
}

// A look made while an order is set goes into the first empty slot of the column its brightness
// band names (rank among all looks, 8 bands), or after the last slot if that column has none.
// Nothing else moves. Returns the new order.
function placeLook(order, looks, look, scores) {
  const list = Array.isArray(looks) ? looks : [];
  if (!Array.isArray(order) || !order.length || !look) return order || null;
  if (order.includes(look.id)) return order;
  const me = list.findIndex((l) => l.id === look.id);
  const sc = scores || list.map(lookBrightness);
  const mine = me >= 0 ? sc[me] : lookBrightness(look);
  const rank = sc.filter((s, j) => s < mine || (s === mine && j < me)).length;
  const col = Math.min(COLUMNS - 1, Math.floor(rank * COLUMNS / Math.max(1, list.length)));
  const out = order.slice();
  let at = out.findIndex((v, i) => v === null && i % COLUMNS === col);
  if (at < 0) {
    at = Math.ceil(out.length / COLUMNS) * COLUMNS + col;
    while (out.length < at) out.push(null);
  }
  out[at] = look.id;
  return out;
}

// What GET returns: each pad (flat slot number) with its look and brightness x 100.
function describePadOrder(looks, padOrder) {
  const list = Array.isArray(looks) ? looks : [];
  const byId = new Map(list.map((l) => [l.id, l]));
  const src = Array.isArray(padOrder) ? padOrder : list.map((l) => l.id);
  return src.map((id, slot) => {
    const l = id == null ? null : byId.get(id);
    return {
      slot, page: Math.floor(slot / PAD_SLOTS), pad: slot % PAD_SLOTS,
      row: Math.floor((slot % PAD_SLOTS) / COLUMNS), column: slot % COLUMNS,
      id: l ? l.id : null, name: l ? l.name : null,
      brightness: l ? Math.round(lookBrightness(l) * 1000) / 10 : null,
    };
  });
}

module.exports = { COLUMNS, ROWS_PER_PAGE, PAD_SLOTS, cellLights, lookBrightness, brightnessOrder, sanitizePadOrder, placeLook, describePadOrder };
