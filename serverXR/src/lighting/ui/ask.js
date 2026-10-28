'use strict';
// The one way the desk asks before something is lost.
//
// The desk used to ask three ways: a native confirm() box, a two-step "Sure? Delete" button, or
// nothing at all. A native box freezes the page (the poll, the stage repaint and the panic key
// stop until someone finds the dialog); the two-step button only works where there is a button.
// Everything now goes through ask(): a bar at the foot of the page that never blocks anything,
// answers a Promise, and stands down by itself.
//
//   if (!(await deskAsk.ask('Unpatch 12 fixtures? This cannot be undone.', 'Unpatch'))) return;
//
// Cancel has the focus and Esc says no, so a stray Enter or tap loses nothing. An OK pressed in
// the first 350 ms is ignored (a double-tap or a bouncing touch that opened the bar must not
// also confirm it), and ten seconds of nothing counts as no. Asking again replaces the bar and
// answers the first question no.
//
// Plain script, like from.js: the page loads it; src/map/deskAsk.test.js holds the behaviour.
(function (root) {
  const GUARD_MS = 350;
  const STAND_DOWN_MS = 10000;

  function createAsk(doc, timers) {
    // arrows, not bare references: a browser's setTimeout throws 'Illegal invocation' when called as t.set()
    const t = timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h), now: () => Date.now() };
    let open = null;                       // { bar, done, timer, onKey, back }

    function close(answer) {
      if (!open) return;
      const { bar, done, timer, onKey, back } = open;
      open = null;
      t.clear(timer);
      doc.removeEventListener('keydown', onKey, true);
      if (bar.parentNode) bar.parentNode.removeChild(bar);
      // a keyboard user goes back to the button they pressed; a mouse press stays blurred, as the desk wants
      if (back && back.isConnected && typeof back.focus === 'function') back.focus();
      done(answer);
    }

    function ask(message, okLabel) {
      if (open) close(false);
      return new Promise((done) => {
        const bar = doc.createElement('div');
        bar.id = 'deskAsk';
        bar.className = 'deskask';
        bar.setAttribute('role', 'alertdialog');
        bar.setAttribute('aria-live', 'assertive');
        bar.setAttribute('aria-labelledby', 'deskAskText');   // a screen reader says the question, not "dialog"
        const text = doc.createElement('span');
        text.id = 'deskAskText';
        text.className = 'deskask-text';
        text.textContent = message;
        const no = doc.createElement('button');
        no.type = 'button'; no.className = 'deskask-no'; no.textContent = 'Cancel';
        const yes = doc.createElement('button');
        yes.type = 'button'; yes.className = 'deskask-yes'; yes.textContent = okLabel || 'OK';
        bar.append(text, no, yes);
        const openedAt = t.now();
        let back = null;
        try { const a = doc.activeElement; if (a && a !== doc.body && a.matches(':focus-visible')) back = a; } catch (_) { back = null; }
        no.addEventListener('click', () => close(false));
        yes.addEventListener('click', () => { if (t.now() - openedAt >= GUARD_MS) close(true); });
        // Esc answers the bar and goes no further: without the stop it also reached the desk's own Esc
        // (clear the selection, close the builder), so cancelling "Unpatch 12?" dropped the 12 selected.
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); } };
        doc.addEventListener('keydown', onKey, true);
        const timer = t.set(() => close(false), STAND_DOWN_MS);
        open = { bar, done, timer, onKey, back };
        doc.body.appendChild(bar);
        no.focus();
      });
    }

    return { ask, isOpen: () => !!open, GUARD_MS, STAND_DOWN_MS };
  }

  const api = { createAsk };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else {
    root.deskAskApi = api;
    root.deskAsk = createAsk(root.document);
  }
})(typeof window !== 'undefined' ? window : this);
