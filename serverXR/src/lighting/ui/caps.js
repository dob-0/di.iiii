'use strict';
// What this page may offer, and what it says when it cannot draw what the desk sent.
//
// A desk is not always the whole desk: the state it sends may carry `caps`, an object that
// names what this one cannot do ({ midi: false, audio: false, ... }). No `caps` at all is the
// full desk, so nothing changes for the desk on a machine. Mic and MIDI also need a secure
// page (localhost or https); on a plain http address the browser refuses both outright.
//
// Plain script, no DOM here: app.js paints what these return, and
// serverXR/src/lighting/tests/test.js holds the rules to account.

(function (root) {
  // The state keys renderAll reads without a guard. When one is missing the page cannot draw,
  // and the name of the key is the useful thing to say.
  const DRAWN = ['status', 'output', 'fx', 'chase', 'fixtures', 'scenes', 'groups', 'lfos', 'layers'];

  // The controls that need the browser's own mic or MIDI, by the cap that gates them.
  const NEEDS_SECURE = { midi: true, audio: true };

  // Is `name` on? A missing caps object is the full desk; only an explicit false turns one off.
  function cap(caps, name, secure) {
    if (caps && typeof caps === 'object' && caps[name] === false) return false;
    if (NEEDS_SECURE[name] && secure === false) return false;
    return true;
  }

  // The poll's failure counter. Only a reply that never arrived counts against the desk;
  // a reply that arrived and could not be drawn is the page's trouble, not the network's,
  // and must neither raise the counter nor reset it.
  //   outcome  'network' (no usable reply) | 'drawn' (replied and drew) | 'render' (replied, draw threw)
  function nextFails(fails, outcome) {
    if (outcome === 'network') return fails + 1;
    if (outcome === 'drawn') return 0;
    return fails;
  }

  // Which key the page could not draw: a missing key it reads without a guard, else the
  // property the engine named, else the message itself.
  function culprit(err, state) {
    if (state && typeof state === 'object') {
      for (const k of DRAWN) if (state[k] === undefined || state[k] === null) return k;
    }
    const m = /reading '([^']+)'/.exec(String(err && err.message ? err.message : err));
    if (m) return m[1];
    return String(err && err.message ? err.message : err).slice(0, 80) || 'unknown';
  }

  const unreadable = (err, state) => 'the desk sent a state this page cannot draw: ' + culprit(err, state);

  const api = { DRAWN, cap, nextFails, culprit, unreadable };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskCaps = api;
})(typeof window !== 'undefined' ? window : this);
