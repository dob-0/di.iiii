'use strict';
// FAN — one gesture, N related values.
//
// The most-loved tool on every desk in the audit, and the cheapest thing on the list to
// build. A rig where every fixture holds the same number reads as a machine; a rig whose
// values walk reads as design. Fan is to lighting what a gradient tool is to graphics,
// and — the part that matters for the data model — its output is plain static values,
// recordable into a look like anything else. Nothing here is a live effect.
//
// It reads the SELECTION ORDER, which is why order is data and a group is a list. The
// styles are Eos's, because that vocabulary is thirty years old and nobody has improved
// on it.

const STYLES = ['line', 'reverse', 'centre', 'mirror', 'repeat', 'cluster', 'random'];

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
const lerp = (a, b, t) => a + (b - a) * t;

// A seeded shuffle, so "random" is reproducible: the same seed gives the same rig, which
// is what lets an operator keep a random-looking fan they liked. grandMA3 does the same
// and for the same reason.
function seededOrder(n, seed) {
  const idx = [...Array(n)].map((_, i) => i);
  let s = (seed >>> 0) || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  return idx;
}

// The values a fan lays across `count` fixtures, in selection order.
function fanValues(count, from, to, { style = 'line', groups = 2, seed = 1 } = {}) {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  if (n === 1) return [clamp8(from)];
  const last = n - 1;
  const line = [...Array(n)].map((_, i) => lerp(from, to, i / last));

  switch (style) {
    case 'reverse':
      return line.reverse().map(clamp8);
    // The ends hold `from` and the middle reaches `to`: a bump across the rig.
    case 'centre': {
      const mid = last / 2;
      return line.map((_, i) => clamp8(lerp(from, to, 1 - Math.abs(i - mid) / mid)));
    }
    // Fans out from the middle to both ends — (1,8)(2,7)(3,6)(4,5) hold the same value.
    // The shape you want when the rig is symmetrical about the centre of the room.
    case 'mirror': {
      const mid = last / 2;
      return line.map((_, i) => clamp8(lerp(from, to, Math.abs(i - mid) / mid)));
    }
    // The same short fan again and again — a pattern rather than a single sweep.
    case 'repeat': {
      const g = Math.max(2, Math.floor(groups));
      return line.map((_, i) => clamp8(lerp(from, to, (i % g) / (g - 1))));
    }
    // Blocks of equal value: the rig in bands, which is how a wash reads from far away.
    case 'cluster': {
      const g = Math.max(2, Math.floor(groups));
      const size = Math.ceil(n / g);
      return line.map((_, i) => clamp8(lerp(from, to, Math.min(g - 1, Math.floor(i / size)) / (g - 1))));
    }
    case 'random': {
      const order = seededOrder(n, seed);
      return order.map((pick) => clamp8(line[pick]));
    }
    default:
      return line.map(clamp8);
  }
}

module.exports = { STYLES, fanValues, seededOrder };
