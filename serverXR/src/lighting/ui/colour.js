'use strict';
// Colours for the Touch page: what a lamp shows, a colour strip for a look tile, and the dots of the
// live stage. VIEW ONLY: nothing here writes to the desk; it reads the output frame (the DMX buffers
// the page already holds) and a look's stored values.
//
// Plain script, no DOM here: app.js paints what these return, and
// serverXR/src/lighting/tests/test-touch-colours.js holds the rules to account.

(function (root) {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const DARK = 0.03;          // below this a lamp reads as off (same bar the Control stage uses)
  const MAX_SEGMENTS = 8;     // a tile is ~150 px wide: more bands than this is noise

  // What a lamp emits for channel values `v` ({role: 0..255}) on a profile with channels `chans`.
  // `emitters` lists the secondary emitter roles; `mixOf(role)` gives each one's [r,g,b] 0..1.
  function colourOfValues(chans, v, emitters, mixOf) {
    let r = 0, g = 0, b = 0;
    if (chans.includes('r')) { r = v.r || 0; g = v.g || 0; b = v.b || 0; }
    else if (chans.includes('warm')) {
      const w = (v.warm || 0) / 255, c = (v.cool || 0) / 255;
      r = 255 * (w + c * 0.78); g = 255 * (w * 0.80 + c * 0.90); b = 255 * (w * 0.52 + c);
    } else { r = g = b = 255; }
    for (const role of emitters) {
      if (role === 'r' || role === 'g' || role === 'b' || role === 'warm' || role === 'cool') continue;
      const lvl = v[role] || 0;
      if (!lvl) continue;
      const mix = mixOf(role);
      r += lvl * mix[0]; g += lvl * mix[1]; b += lvl * mix[2];
    }
    r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
    const dim = chans.includes('dimmer') ? (v.dimmer || 0) / 255 : 1;
    const level = Math.max(r, g, b) / 255 * dim;
    return { r: r * dim, g: g * dim, b: b * dim, level };
  }

  // The values a lamp has in the output frame: dmx[universe][address-1 + channel index].
  function frameValues(f, chans, dmx) {
    const buf = (dmx && dmx[f.universe]) || [];
    const v = {};
    chans.forEach((role, i) => { v[role] = buf[f.address - 1 + i] || 0; });
    return v;
  }

  const rgbCss = (c) => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;

  // The colours a look would show, one per lit lamp it holds, in rig order. A lamp the look names that
  // is not patched here is skipped, as is one the look leaves dark. `dmx` given (the look is the one
  // playing) reads the output frame instead of the look's stored values, so the strip is what the rig does.
  function lookColours(look, fixtures, profiles, colourOf, dmx) {
    const vals = (look && look.steps && look.steps[0] && look.steps[0].values) || {};
    const out = [];
    for (const f of fixtures) {
      if (!dmx && !vals[f.id]) continue;
      const chans = (profiles[f.profile] || {}).channels || [];
      const c = colourOf(chans, dmx ? frameValues(f, chans, dmx) : vals[f.id]);
      if (c.level >= DARK) out.push(c);
    }
    // Neighbours that read as one colour are one band.
    const bands = [];
    for (const c of out) {
      const last = bands[bands.length - 1];
      if (last && Math.abs(last.r - c.r) + Math.abs(last.g - c.g) + Math.abs(last.b - c.b) < 24) continue;
      bands.push(c);
    }
    if (bands.length <= MAX_SEGMENTS) return bands;
    const step = bands.length / MAX_SEGMENTS;   // spread the cut evenly instead of dropping the tail
    return Array.from({ length: MAX_SEGMENTS }, (_, i) => bands[Math.floor(i * step)]);
  }

  // Hard-edged bands, equal width: "rgb(..) 0 25%, rgb(..) 25% 50%, …". Empty list → '' (no strip).
  function stripCss(colours) {
    if (!colours.length) return '';
    const n = colours.length;
    return `linear-gradient(90deg, ${colours.map((c, i) => `${rgbCss(c)} ${(i * 100 / n).toFixed(2)}% ${((i + 1) * 100 / n).toFixed(2)}%`).join(', ')})`;
  }

  // The live stage: one dot per lamp, coloured from the output frame. Places are the lamps' stage places
  // (x, y as the Control stage holds them) fitted to the box, so a rig that sits far from the origin or is
  // dragged off the Control view still shows whole; a single lamp sits in the middle.
  const PAD = 0.06;   // margin kept free round the stage box
  function fit(vals) {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return (v) => (hi - lo < 1e-9 ? 0.5 : PAD + (1 - 2 * PAD) * (v - lo) / (hi - lo));
  }
  function stageDots(fixtures, profiles, colourOf, dmx) {
    const fx = fit(fixtures.map((f) => +f.x || 0)), fy = fit(fixtures.map((f) => +f.y || 0));
    return fixtures.map((f) => {
      const chans = (profiles[f.profile] || {}).channels || [];
      const c = colourOf(chans, frameValues(f, chans, dmx));
      const lit = c.level >= DARK;
      return { id: f.id, name: f.name, x: fx(+f.x || 0), y: fy(+f.y || 0), lit, css: lit ? rgbCss(c) : '', level: c.level };
    });
  }

  // The extra emitters' mix for colourOfValues (white, amber, yellow, UV, lime): the same table as app.js's EMITTER_MIX,
  // kept equal by serverXR/src/showDesk/showDesk.test.js, so a lamp is the same colour on the show desk as on this desk. r, g, b, warm
  // and cool never reach it (colourOfValues mixes those itself); an emitter it does not name is a dim white, as in app.js.
  const EMITTER_MIX = {
    w: [0.92, 0.92, 0.92], a: [0.95, 0.62, 0.10], y: [0.85, 0.85, 0.00],
    uv: [0.42, 0.00, 0.86], lime: [0.72, 1.00, 0.24],
  };
  const mixOf = (role) => EMITTER_MIX[role] || [0.8, 0.8, 0.8];

  const api = { colourOfValues, frameValues, lookColours, stripCss, stageDots, rgbCss, DARK, MAX_SEGMENTS, PAD, EMITTER_MIX, mixOf };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskColour = api;
})(typeof window !== 'undefined' ? window : this);
