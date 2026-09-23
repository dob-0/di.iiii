'use strict';
// Which show this page is for, and the one sentence to say about the show the desk runs.
//
// The desk runs one show at a time, the way a console loads one show file. Inside di.iiii
// a space owns its own show (it lives beside the space's scene and travels in its .diiii
// file); this machine keeps its own show too, where it always was.
//
// A page opened for a space lives at space/<id>/ — the server sends /light/?space=<id>
// there — so every relative address the page uses (api/state, app.js) names that show,
// through a reload, a bookmark and every one of the five page tabs, without any call
// adding it. A bare /light/ is the desk as it is: it runs whatever show is loaded, which
// is what a phone scanning the Phone box's QR wants from a remote.
//
// Plain script, no DOM here: app.js paints what `note` returns, and
// serverXR/src/lighting/tests/test.js requires this file to hold the sentences to account.

(function (root) {
  // A space's id as di.iiii makes them (spaceStore's SLUG_REGEX).
  const SPACE_ID = /^[a-z0-9-]{3,48}$/;

  // The space this page was opened for, or null for the bare desk.
  function keyFromPath(pathname) {
    const m = /\/space\/([^/]+)\/[^/]*$/.exec(String(pathname || ''));
    return m && SPACE_ID.test(m[1]) ? m[1] : null;
  }

  // The desk's own root: /light/space/lab/ → /light/. The phone gets this one — its QR
  // holds 42 bytes, and a remote should follow whatever show the desk is running.
  function rootPath(pathname) {
    return String(pathname || '/').replace(/[^/]*$/, '').replace(/space\/[^/]+\/$/, '');
  }

  const nameOf = (show) => (show && show.space ? (show.label || show.space) : null);
  const whose = (show) => (show && show.space ? nameOf(show) + "'s show" : "this machine's own show");
  const count = (n, one) => n + ' ' + one + (n === 1 ? '' : 's');

  // One sentence and at most one button, or null when there is nothing to say.
  //   show  what the desk reports (GET api/show, or `show` in api/state)
  //   key   the space this page was opened for; null on the bare desk
  function note(show, key) {
    if (!show) return null;
    // Opened for one space while the desk runs another show. Loading it is one press;
    // with output on, the press is the operator deciding the room may change.
    if (key && show.space !== key) {
      return {
        text: 'This desk is running ' + whose(show) + '.'
          + (show.live ? ' Output is on: loading ' + key + "'s show changes the lights in the room." : ''),
        button: 'Load ' + key + "'s show here",
        action: 'open',
      };
    }
    // The bare desk, running a space's show. Named, so a remote knows what it drives.
    // The way back to this machine's own show is offered only while nothing is on the
    // wire: a thumb on a phone at the back of the room must not swap the show mid-set.
    if (!key && show.space) {
      return show.live
        ? { text: 'This desk is running ' + whose(show) + '.', button: null, action: null }
        : { text: 'This desk is running ' + whose(show) + '.', button: "Load this machine's own show", action: 'open-machine' };
    }
    // The one migration: a space whose show was never saved, on a machine whose own show
    // has something in it. It is a copy, and the sentence says so before the press.
    if (key && show.machine) {
      const m = show.machine;
      const has = [count(m.fixtures, 'fixture'), count(m.scenes, 'scene')]
        .concat(m.looks ? [count(m.looks, 'look')] : []).join(', ');
      return {
        text: nameOf(show) + ' has no light show yet. This machine has one (' + has + '). '
          + "Using it copies it; this machine's show stays as it is.",
        button: "Use this machine's show for " + nameOf(show),
        action: 'copy',
      };
    }
    return null;
  }

  // What the page says after the copy, once it has reloaded onto the space's new show.
  function copied(show) {
    return 'Copied. ' + nameOf(show) + " has its own show now; this machine's show is unchanged.";
  }

  const api = { SPACE_ID, keyFromPath, rootPath, whose, note, copied };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskShow = api;
})(typeof window !== 'undefined' ? window : this);
