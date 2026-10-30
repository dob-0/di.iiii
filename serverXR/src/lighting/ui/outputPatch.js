'use strict';
// What the output form posts. The server keeps every key a POST leaves out, so the page
// sends ONLY what the person just changed — never the whole form. Posting the whole form
// carried whatever the page had loaded (a stale driver) over the live output, and the USB
// output died with no one touching the driver (show Mac, 2026-10-30).
//
// Plain script, no DOM: app.js reads the controls and calls this; lighting.test.js holds it.

(function (root) {
  const KEYS = ['driver', 'serialPort', 'mode', 'targets', 'enabled', 'refreshHz', 'priority'];

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // (shown, live, changedKey, newValue) -> patch. `shown` is what the form displays and
  // `live` what the desk reported last; both are accepted so a caller cannot send a stale
  // `shown` value by accident, but only the changed key travels, and only when it differs
  // from what is live. Several changed keys at once: pass an object as changedKey.
  function outputPatch(shown, live, changedKey, newValue) {
    const changes = changedKey && typeof changedKey === 'object' ? changedKey : { [changedKey]: newValue };
    const patch = {};
    for (const k of Object.keys(changes)) {
      if (!KEYS.includes(k)) continue;
      if (live && same(live[k], changes[k])) continue;
      patch[k] = changes[k];
    }
    return patch;
  }

  const api = { KEYS, outputPatch };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskOutputPatch = api;
})(typeof window !== 'undefined' ? window : this);
