'use strict';
// Stage labels (studio, 2026-09-24). A label is a NAME on the stage view — "DJ", "Stage
// edge", "Door" — with no DMX address, no colour and no level. It exists because a place
// she wanted marked (where the DJ stands) had been patched as a 1-channel Dimmer fixture:
// it counted as a light, "All" selected it, it was drawn as the brightest lamp on every
// stage and it sent 255 on DMX 1 all night. A label is none of those things by construction
// — it is not in state.fixtures, so nothing that reads the rig ever sees it.
//
// Replaced whole by POST /api/markers, like the objects list; saved in show.json; not part
// of scenes (where the DJ stands does not change with the look).

// Where a label may stand: anywhere a fixture may (desk.js WORLD).
const WORLD = 1000;
const MAX_MARKERS = 16;
const MARKER_KINDS = ['label'];
const MAX_TEXT = 40;

const num = (v, lo, hi, dflt) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : dflt);

// The one validator — the route and the show-file load both come through here. Returns null
// for "not a list" so the route can refuse it by name. Blank text becomes "Label": a label
// with no name would be an invisible thing she could still select and drag.
function sanitizeMarkers(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  const seen = new Set();
  for (const m of list) {
    if (out.length >= MAX_MARKERS) break;
    if (!m || typeof m !== 'object') continue;
    let id = typeof m.id === 'string' && m.id ? m.id.slice(0, 40)
      : 'mk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    while (seen.has(id)) id = id.slice(0, 34) + Math.random().toString(36).slice(2, 6);
    seen.add(id);
    const text = String(m.text == null ? '' : m.text).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT) || 'Label';
    out.push({
      id,
      kind: MARKER_KINDS.includes(m.kind) ? m.kind : 'label',
      text,
      x: num(m.x, -WORLD, WORLD, 0.5),
      y: num(m.y, -WORLD, WORLD, 0.5),
    });
  }
  return out;
}

module.exports = { MAX_MARKERS, MARKER_KINDS, MAX_TEXT, sanitizeMarkers };
