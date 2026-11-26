'use strict';
// The desk's own right-click menu. The browser's menu has nothing a lighting desk can do, so
// everywhere on the page the right button opens THIS menu instead — except in a text field,
// where the browser's copy / paste menu stays because it is the useful one there.
//
//   deskMenu.register('.fx-node', (target, ev) => [{ label: 'Identify', hint: 'I', action: () => {} }, { sep: true }, ...]);
//
// The provider returns the items for what was clicked (or null / [] for "nothing here"; the
// default menu then shows). An item: { label, hint?, disabled?, danger?, action } or { sep: true }.
// Keys: Up / Down / Home / End move, Enter or Space picks, Esc closes, Tab closes. The menu also
// closes on an outside press, a scroll, a resize and a lost focus. It never leaves the window.
//
// Plain script, like ask.js: the page loads it; the desk's tests read this file.
(function (root) {
  const providers = [];        // { selector, fn }, the first match wins (register the narrowest first)
  let menu = null;             // { el, items, active, onKey, close }

  function register(selector, fn) { providers.push({ selector, fn }); }

  function isTextTarget(t) {
    if (!t || !t.closest) return false;
    if (t.closest('input, textarea, [contenteditable=""], [contenteditable="true"]')) {
      const i = t.closest('input');
      // buttons, ranges and checkboxes have no text to copy: they get the di menu
      return !i || !/^(button|checkbox|radio|range|color|file|submit|reset|image)$/.test(i.type);
    }
    return false;
  }

  function close() {
    if (!menu) return;
    const m = menu; menu = null;
    m.el.remove();
    document.removeEventListener('keydown', m.onKey, true);
    for (const [ev, fn, opt] of m.off) root.removeEventListener(ev, fn, opt);
    if (m.back && m.back.focus && document.contains(m.back)) { try { m.back.focus({ preventScroll: true }); } catch (_) { /* gone */ } }
  }

  function open(items, x, y) {
    close();
    const list = items.filter((it, i, a) => !(it.sep && (i === 0 || i === a.length - 1 || a[i - 1].sep || a[i - 1].head)));
    const el = document.createElement('div');
    el.className = 'dmenu';
    el.setAttribute('role', 'menu');
    el.style.left = '0px'; el.style.top = '0px'; el.style.visibility = 'hidden';
    const rows = [];
    for (const it of list) {
      if (it.head) { const d = document.createElement('div'); d.className = 'dmhead'; d.textContent = it.label; d.title = it.label; el.appendChild(d); continue; }
      if (it.sep) { const s = document.createElement('div'); s.className = 'dmsep'; s.setAttribute('role', 'separator'); el.appendChild(s); continue; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dmitem' + (it.danger ? ' danger' : '');
      b.setAttribute('role', 'menuitem');
      b.disabled = !!it.disabled;
      const l = document.createElement('span'); l.className = 'dml'; l.textContent = it.label;
      b.appendChild(l);
      if (it.hint) { const h = document.createElement('span'); h.className = 'dmh'; h.textContent = it.hint; b.appendChild(h); }
      b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (it.disabled) return;
        close();
        if (it.action) it.action();
      });
      b.addEventListener('mousemove', () => { if (!it.disabled) b.focus({ preventScroll: true }); });
      el.appendChild(b);
      rows.push(b);
    }
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.appendChild(el);
    // stay inside the window: measured after it is in the page, then moved
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    el.style.maxHeight = (vh - 16) + 'px';
    const h = Math.min(r.height, vh - 16);
    el.style.left = Math.max(8, Math.min(x, vw - r.width - 8)) + 'px';
    el.style.top = Math.max(8, Math.min(y, vh - h - 8)) + 'px';
    el.style.visibility = '';
    const enabled = () => rows.filter((b) => !b.disabled);
    const onKey = (e) => {
      const en = enabled();
      const at = en.indexOf(document.activeElement);
      let handled = true;
      if (e.key === 'ArrowDown') en[(at + 1) % en.length].focus();
      else if (e.key === 'ArrowUp') en[(at - 1 + en.length) % en.length].focus();
      else if (e.key === 'Home') en[0].focus();
      else if (e.key === 'End') en[en.length - 1].focus();
      else if (e.key === 'Escape' || e.key === 'Tab') close();
      else if ((e.key === 'Enter' || e.key === ' ') && at >= 0) en[at].click();
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('keydown', onKey, true);
    const outside = (e) => { if (!el.contains(e.target)) close(); };
    const off = [
      ['pointerdown', outside, true], ['wheel', close, { passive: true, capture: true }],
      ['scroll', close, true], ['resize', close, false], ['blur', close, false],
    ];
    for (const [ev, fn, opt] of off) root.addEventListener(ev, fn, opt);
    menu = { el, onKey, off, back: document.activeElement };
    const first = enabled()[0];
    if (first) first.focus({ preventScroll: true });
    return el;
  }

  function defaultItems() {
    const sel = String(root.getSelection ? root.getSelection() : '').trim();
    return [
      { label: 'Copy selected text', disabled: !sel, action: () => { try { navigator.clipboard.writeText(sel); } catch (_) { document.execCommand('copy'); } } },
      { sep: true },
      { label: 'Reload page', action: () => root.location.reload() },
    ];
  }

  function onContext(e) {
    if (e.defaultPrevented && !(menu && menu.el.contains(e.target))) return;
    if (isTextTarget(e.target)) return;          // the browser's copy / paste menu stays in a field
    e.preventDefault();
    let items = null;
    for (const p of providers) {
      const hit = e.target.closest && e.target.closest(p.selector);
      if (!hit) continue;
      items = p.fn(hit, e);
      if (items && items.length) break;
    }
    open(items && items.length ? items : defaultItems(), e.clientX, e.clientY);
  }

  if (typeof document !== 'undefined') document.addEventListener('contextmenu', onContext);
  root.deskMenu = { register, open, close, isOpen: () => !!menu, isTextTarget };
})(typeof window !== 'undefined' ? window : globalThis);
