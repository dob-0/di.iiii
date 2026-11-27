'use strict';
// The cue list on MIDI pads, and the Akai APC40 mkII layout. Plain script, no DOM:
// app.js builds its MIDI targets and its APC40 preset from these, midiCues.test.js holds them.
//
// Why: a show runs from the cue list (looks + cues), and the MIDI page could only reach the
// old 16 scene pads. The Reika night (Hayfilm, 2026-11-27) plays from an APC40 mkII next to the
// desk: the 5 x 8 grid plays the desk's LOOKS, 40 a page (lookAt below); the cue transport is one
// button each, and the cue:<i> pads stay learnable targets.
//
// The APC40 mkII numbers come from Akai's "APC40 Mk2 Communication Protocol" v1.2
// (2015-01-19), the inbound tables: the unit starts in Generic Mode (Mode 0); CLIP LAUNCH
// 1-40 are notes 0x00-0x27 and ignore the MIDI channel; STOP ALL CLIPS 0x51; SCENE LAUNCH
// 1-5 are 0x52-0x56; PLAY 0x5B; the MASTER fader is CC 0x0E. The protocol does not say
// where CLIP LAUNCH 1 sits on the panel; the owner's hardware check on the real unit
// (2026-11-27 00:53) settled it: note 32 (0x20) at velocity 5 lit the top-left pad red, note 0
// at velocity 9 lit the bottom-left pad orange. So the bottom row is notes 0-7 and the top-left
// pad is 0x20. The page's learn row still moves any pad that is wrong.

(function (root) {
  const MAX_CUE_PADS = 40;   // the APC40's 5 x 8 grid; the page lists no more than that

  // One pad target per cue, in list order. Each says the route and body it posts; the page
  // sends it through its ARM gate like every other pad.
  function cuePadTargets(cues) {
    const list = (cues && Array.isArray(cues.list)) ? cues.list : [];
    return list.slice(0, MAX_CUE_PADS).map((c, i) => ({
      key: 'cue:' + i,
      label: `Cue ${i + 1}  ${String((c && c.name) || '').slice(0, 40)}`.trim(),
      route: 'api/cues/go',
      body: { index: i },
    }));
  }

  // The transport pads. "Play in order" and "loop" flip from the desk's own last word,
  // never from a mirror kept on the page, so two surfaces never fight over the switch.
  function cueTransport(cues) {
    const c = cues || {};
    return [
      { key: 'cuego', label: 'Cue GO  (next)', route: 'api/cues/go', body: {} },
      { key: 'cueback', label: 'Cue back', route: 'api/cues/back', body: {} },
      { key: 'cuestop', label: 'Cue stop', route: 'api/cues/stop', body: {} },
      { key: 'cueauto', label: `Play in order  on / off  (now ${c.autoplay ? 'on' : 'off'})`, route: 'api/cues/autoplay', body: { autoplay: !c.autoplay } },
      { key: 'cueloop', label: `Loop  on / off  (now ${c.loop ? 'on' : 'off'})`, route: 'api/cues/loop', body: { loop: !c.loop } },
    ];
  }

  // The cue state a switch pad reads. The page's copy of the cue list comes from a 1 s poll,
  // and a poll that left before a press landed brings back the old value: pressed twice, the
  // switch would send "on" twice. What this page sent in the last SENT_WINS_MS wins.
  const SENT_WINS_MS = 2500;
  function noteSent(sent, body, now) {
    for (const k of ['autoplay', 'loop']) if (body && k in body) sent[k] = { v: body[k] === true, at: now };
  }
  function cueView(cues, sent, now) {
    const view = Object.assign({}, cues || {});
    for (const k of ['autoplay', 'loop']) {
      const s = sent && sent[k];
      if (s && now - s.at < SENT_WINS_MS) view[k] = s.v;
    }
    return view;
  }

  // The looks on the grid (owner 2026-11-27: the pads play the desk's LOOKS in desk order, the
  // order of `looks` in the desk's state, 40 to a page). Slot k of page p is looks[40 * p + k];
  // a slot past the last look is empty and does nothing. Slots are numbered like apc40PadNote:
  // 0 = top-left, rows left to right.
  const LOOK_PADS = 40;
  function lookPageCount(n) { return Math.max(1, Math.ceil((Number.isInteger(n) ? n : 0) / LOOK_PADS)); }
  function clampLookPage(page, n) {
    const p = Number.isInteger(page) ? page : 0;
    return Math.min(Math.max(p, 0), lookPageCount(n) - 1);
  }
  function lookAt(looks, page, k) {
    const list = Array.isArray(looks) ? looks : [];
    if (!Number.isInteger(k) || k < 0 || k >= LOOK_PADS) return null;
    return list[clampLookPage(page, list.length) * LOOK_PADS + k] || null;
  }
  // The ONE mapping from the desk's looks to the pad slots (state.padOrder, padOrder.js): with an order set,
  // slot i is the look padOrder[i] (null = empty, an id no look has = empty, the same look may sit twice);
  // without one, slot i is looks[i]. Everything on the grid (the real pads, their LEDs, the drawn APC40,
  // the page buttons and the page count) reads this list and never `looks` directly.
  function padLooks(looks, padOrder) {
    const list = Array.isArray(looks) ? looks : [];
    if (!Array.isArray(padOrder) || !padOrder.length) return list;
    const byId = new Map(list.map((l) => [l.id, l]));
    return padOrder.map((id) => (id == null ? null : byId.get(id) || null));
  }
  // What a look pad press sends: the call a tap on that look's tile makes (api/looks/fire {id}),
  // no layer, no quantize (the desk falls back to its cue layer). null for an empty slot.
  function lookPadFire(looks, page, k) {
    const l = lookAt(looks, page, k);
    return l ? { route: 'api/looks/fire', body: { id: l.id } } : null;
  }
  // The page's pad targets: 'lookpad:<k>' for k 0-39, and the two page buttons.
  function lookPadTargets() {
    const out = [];
    for (let k = 0; k < LOOK_PADS; k++) out.push({ key: 'lookpad:' + k, label: `Look pad ${k + 1}  (top-left first, this page)` });
    return out;
  }
  const LOOK_PAGE_KEYS = { prev: 'lookpage:prev', next: 'lookpage:next' };

  // Cue n (0-based) reads like a page: top row left to right first. Rows are 8 wide, 5 deep;
  // the bottom row carries notes 0-7.
  function apc40PadNote(i) {
    if (!Number.isInteger(i) || i < 0 || i >= MAX_CUE_PADS) return null;
    const row = Math.floor(i / 8);   // 0 = top
    return (4 - row) * 8 + (i % 8);
  }

  // The APC40 mkII preset, as the page's map rows. The master fader is the desk master; the
  // grid is the cue list; PLAY is GO; STOP ALL CLIPS stops the list; SCENE LAUNCH 1-3 are
  // back, play-in-order and loop; SCENE LAUNCH 5, the lowest, is blackout (one-way: the
  // release is the desk's own button, panicKeys.js). Only keys the page offers are mapped.
  function apc40Preset(offeredKeys) {
    const has = new Set(offeredKeys || []);
    const out = [];
    const cc = (num, key) => { if (has.has(key)) out.push({ key, type: 'cc', ch: 1, num }); };
    const note = (num, key) => { if (has.has(key)) out.push({ key, type: 'note', ch: 1, num }); };
    cc(0x0e, 'master');
    note(0x5b, 'cuego');
    note(0x51, 'cuestop');
    note(0x52, 'cueback');
    note(0x53, 'cueauto');
    note(0x54, 'cueloop');
    note(0x56, 'blackout');
    // Page buttons. Akai's inbound table (Communication Protocol v1.2, pp. 32-33, note numbers):
    //   "RIGHT  0x60 (C_7)"   "LEFT  0x61 (C#7)"   ("UP 0x5E (A#6)", "DOWN 0x5F (B_6)" are the other two
    //   arrows of the same cluster, not mapped: one control drives one target.)
    // RIGHT = next page, LEFT = previous page. The 'cue:<i>' pads stay learnable targets, off the grid.
    note(0x60, LOOK_PAGE_KEYS.next);
    note(0x61, LOOK_PAGE_KEYS.prev);
    for (let k = 0; k < LOOK_PADS; k++) note(apc40PadNote(k), 'lookpad:' + k);
    return out;
  }

  // Pad lights. Akai protocol v1.2, "Outbound Message Type 1: LEDs": a note-on to the pad's
  // note, MIDI channel = LED type (0 = primary colour, solid), velocity = colour from the RGB
  // table. Warm palette for a dark room: the running cue red, the next one orange, every other
  // cue in the list a dim ember, a pad with no cue dark.
  const APC40_COLOUR = { off: 0, running: 5, next: 9, cue: 10, dim: 6, white: 3 };
  //  5 #FF0000 · 9 #FF5400 · 10 #591D00 · 6 #590000 · 3 #FFFFFF (Akai RGB table)

  // What the cue runner fires on the next GO, as cuerun.js does it (nextCueIndex): after the
  // last cue only a looping list starts again.
  function nextIndex(index, n, loop) {
    if (!n) return -1;
    if (!Number.isInteger(index) || index < 0) return 0;
    if (index + 1 < n) return index + 1;
    return loop ? 0 : -1;
  }

  // midi map rows (the page's {key: {type, ch, num}}) + cue state -> [{note, vel}], one per
  // mapped pad on channel 1. Only pads this preset lights: cue pads, GO, back, play in order,
  // loop, blackout. PLAY is a plain LED (0 off, 1 on); the others are RGB.
  function apc40Lights(map, cues, state, looksView) {
    const c = cues || {};
    const n = Array.isArray(c.list) ? Math.min(c.list.length, MAX_CUE_PADS) : 0;
    const running = c.running === true && Number.isInteger(c.index) ? c.index : -1;
    const next = nextIndex(c.index, n, c.loop === true);
    const out = [];
    const put = (key, vel) => {
      const b = map && map[key];
      if (b && b.type === 'note' && b.ch === 1 && Number.isInteger(b.num)) out.push({ note: b.num, vel });
    };
    for (let i = 0; i < MAX_CUE_PADS; i++) {
      const vel = i >= n ? APC40_COLOUR.off
        : i === running ? APC40_COLOUR.running
          : i === next ? APC40_COLOUR.next
            : APC40_COLOUR.cue;
      put('cue:' + i, vel);
    }
    // The look pads: the look on air red, the others on this page ember, an empty slot dark.
    // looksView = { looks, page, activeId }.
    if (looksView) {
      for (let k = 0; k < LOOK_PADS; k++) {
        const l = lookAt(looksView.looks, looksView.page, k);
        put('lookpad:' + k, !l ? APC40_COLOUR.off : (looksView.activeId && l.id === looksView.activeId) ? APC40_COLOUR.running : APC40_COLOUR.cue);
      }
    }
    put('cuego', running >= 0 ? 1 : 0);
    put('cueback', n ? APC40_COLOUR.cue : APC40_COLOUR.off);
    put('cueauto', c.autoplay ? APC40_COLOUR.next : APC40_COLOUR.cue);
    put('cueloop', c.loop ? APC40_COLOUR.next : APC40_COLOUR.cue);
    put('blackout', state && state.blackout ? APC40_COLOUR.running : APC40_COLOUR.dim);
    return out;
  }

  // Only what changed goes on the wire; a pad the hardware lit by itself (it lights while held
  // in Generic Mode, dark on release) is forgotten on release so the next paint restores it.
  function lightDiff(lights, sent) {
    const send = [];
    for (const l of lights) if (sent.get(l.note) !== l.vel) { send.push(l); sent.set(l.note, l.vel); }
    return send;
  }

  // The pad lights, one painter per page. The pressed look goes red at once (optimistic), the
  // old one back to ember in the same paint; the desk's answer corrects it (answer(id, false)
  // drops it). The guess ends by REQUEST TIME, not by age: once the desk has answered the fire
  // (answer(id, true)), the first on-air reading that was ASKED FOR at or after that moment
  // knows the press, so it rules at once, whatever it says (another source may have moved on);
  // a reading asked for earlier cannot know it and never undoes the guess. OPT_LOOK_MS is only a
  // backstop for a fire that is never answered. Only the armed page lights (Safe: nothing is painted).
  // deps: out() port|null, armed(), map(), cues(), state(), looks(), page(), setPage(p),
  // polledId(), polledAt() (when the request behind polledId was sent; optional), now().
  const OPT_LOOK_MS = 10000;
  function createLedPainter(deps) {
    const sent = deps.sent || new Map();
    let opt = null;   // { id, at, answeredAt|null }
    function lookId() {
      const polled = deps.polledId() || '';
      if (opt) {
        const askedAt = deps.polledAt ? deps.polledAt() : 0;
        if (polled === opt.id || deps.now() - opt.at > OPT_LOOK_MS
          || (opt.answeredAt != null && askedAt >= opt.answeredAt)) opt = null;
        else return opt.id;
      }
      return polled;
    }
    function paint() {
      const out = deps.out();
      if (!out || !deps.armed()) return;
      try {
        const looks = deps.looks();
        deps.setPage(clampLookPage(deps.page(), looks.length));
        const lights = apc40Lights(deps.map(), deps.cues(), deps.state(), { looks, page: deps.page(), activeId: lookId() });
        for (const l of lightDiff(lights, sent)) out.send([0x90, l.note, l.vel]);
      } catch (e) { sent.clear(); }   // port gone: repaint everything when it is back
    }
    return {
      paint,
      pressLook(id) { if (!deps.armed()) return; opt = { id, at: deps.now(), answeredAt: null }; paint(); },
      answer(id, ok) {
        if (!opt || opt.id !== id) return;
        if (!ok) { opt = null; paint(); } else if (opt.answeredAt == null) opt.answeredAt = deps.now();
      },
      forget(note) { sent.delete(note); },
      reset() { sent.clear(); opt = null; },
      sent,
    };
  }

  const api = { createLedPainter, OPT_LOOK_MS, LOOK_PADS, LOOK_PAGE_KEYS, lookPageCount, clampLookPage, padLooks, lookAt, lookPadFire, lookPadTargets, MAX_CUE_PADS, SENT_WINS_MS, APC40_COLOUR, cuePadTargets, cueTransport, cueView, noteSent, apc40PadNote, apc40Preset, nextIndex, apc40Lights, lightDiff };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.deskMidiCues = api;
})(typeof window !== 'undefined' ? window : this);
