'use strict';
// What the output form posts. The server keeps every key a POST leaves out, so the page
// sends ONLY what the person just changed — never the whole form. Posting the whole form
// carried whatever the page had loaded (a stale driver) over the live output, and the USB
// output died with no one touching the driver (show Mac, 2026-10-30).
//
// Plain script, no DOM: app.js reads the controls and calls this; lighting.test.js holds it.

(function (root) {
  const KEYS = ['driver', 'serialPort', 'mode', 'targets', 'enabled', 'refreshHz', 'priority'];

  // (shown, live, changedKey, newValue) -> patch. Only the keys the person touched travel,
  // and they always do, even when equal to what the page shows: `shown`/`live` come from the
  // last poll and may be stale, so comparing against them can swallow a real click (the
  // server's equal-POST is a no-op). Several touched keys at once: pass an object.
  function outputPatch(shown, live, changedKey, newValue) {
    const changes = changedKey && typeof changedKey === 'object' ? changedKey : { [changedKey]: newValue };
    const patch = {};
    for (const k of Object.keys(changes)) if (KEYS.includes(k)) patch[k] = changes[k];
    return patch;
  }

  // True while the output form must not follow the live state: a value was changed and not
  // yet applied (`dirty`), or focus sits in one of its controls. The driver radios are
  // excluded: they commit at once and stay focused after a click.
  function outputFormEditing(el, dirty) {
    if (dirty) return true;
    if (!el || !el.closest || !el.closest('.outbox')) return false;
    if (el.name === 'driver') return false;
    return !!(el.matches && el.matches('input, select, textarea'));
  }

  const api = { KEYS, outputPatch, outputFormEditing };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskOutputPatch = api;
})(typeof window !== 'undefined' ? window : this);
