'use strict';
// THE CUE RUNNER — a project's cue list, played by the desk itself.
//
// A cue list used to be played by whichever browser tab pressed GO: the cards page
// kept a setTimeout per cue's hold, so a show stopped the moment that tab closed, and
// two open tabs each ran their own clock and fired every cue twice. The desk is the
// one process that is always there while the lights are (docs/architecture/
// LIGHTING_DESK.md "The cue runner"), so the clock lives here:
//   - ONE driver. There is one timer handle, cleared before every reschedule; any page
//     (the cards page, /light's own strip, a phone) only asks the desk to go, stop or
//     loop, and every page reads the same answer back.
//   - It keeps playing with no page open, and a desk restarted mid-show comes back on
//     the cue it was on (the list, where it was and whether it was running are saved
//     with the show).
// A cue fires a LOOK the desk already holds, on the cue layer, through the same path
// POST /api/looks/fire takes. A cue whose look is not on the desk is noted in `missing`
// and its hold still runs: one absent look must not stall a looping show.

const MAX_CUES = 200;
const STR = 60;
const str = (v, max = STR) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, lo, hi, dflt) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

function sanitizeCue(raw, i) {
  if (!raw || typeof raw !== 'object') return null;
  const lookId = str(raw.lookId, 40);
  if (!lookId) return null;
  return {
    id: str(raw.id) || `cue-${i + 1}`,
    name: str(raw.name) || lookId,
    lookId,
    // seconds; 0 = waits for GO
    hold: num(raw.hold, 0, 3600, 0),
    fade: num(raw.fade, 0, 60, 0),
  };
}

const EMPTY = () => ({ project: '', list: [], loop: false, autoplay: false, index: -1, running: false, nextAt: null, missing: [] });

function sanitizeCues(raw) {
  if (!raw || typeof raw !== 'object') return EMPTY();
  const list = (Array.isArray(raw.list) ? raw.list : []).slice(0, MAX_CUES).map(sanitizeCue).filter(Boolean);
  const index = Number.isInteger(raw.index) && raw.index >= 0 && raw.index < list.length ? raw.index : -1;
  return {
    project: str(raw.project, 64),
    list,
    loop: raw.loop === true,
    // "play in order": OFF unless somebody switched it on. A cue that was chosen holds.
    autoplay: raw.autoplay === true,
    index,
    running: raw.running === true && index >= 0,
    nextAt: Number.isFinite(raw.nextAt) ? raw.nextAt : null,
    missing: (Array.isArray(raw.missing) ? raw.missing : []).filter((m) => typeof m === 'string').slice(0, MAX_CUES).map((m) => m.slice(0, 40)),
  };
}

// `desk` gives the runner what it needs and nothing else:
//   cues()        the live state.cues (the object is replaced when a show loads)
//   setCues(c)    put a new cues object on the state
//   fire(cue)     put cue.lookId on the cue layer with cue.fade; false if no such look
//   save()        mark the show dirty
//   log(line)
function createCueRunner(desk) {
  let timer = null;
  const now = () => Date.now();
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };

  function schedule(ms) {
    clear();
    const c = desk.cues();
    c.nextAt = now() + ms;
    timer = setTimeout(advance, ms);
  }

  function fireAt(i) {
    const c = desk.cues();
    const cue = c.list[i];
    c.index = i;
    c.running = true;
    // When this cue went up, on this machine's clock: the show page (routes/showRoutes.js)
    // tells "chosen by a person" from "the list moved on by itself" by it.
    c.firedAt = now();
    const ok = desk.fire(cue);
    const missing = new Set(c.missing);
    if (ok) missing.delete(cue.lookId); else missing.add(cue.lookId);
    c.missing = [...missing];
    // A chosen scene HOLDS (owner, 2026-10-09: "you press, the scene changes, and auto play
    // stops"). The hold only counts down when "play in order" is on.
    if (c.autoplay && cue.hold > 0) schedule(cue.hold * 1000);
    else { clear(); c.nextAt = null; }
    desk.save();
    return cue;
  }

  function advance() {
    timer = null;
    const c = desk.cues();
    if (!c.running || !c.list.length) return;
    let i = c.index + 1;
    if (i >= c.list.length) {
      if (!c.loop) { c.running = false; c.nextAt = null; desk.save(); return; }
      i = 0;
    }
    fireAt(i);
  }

  function go(index) {
    const c = desk.cues();
    if (!c.list.length) return { error: 'no cue list on the desk' };
    let i;
    if (Number.isInteger(index)) {
      if (index < 0 || index >= c.list.length) return { error: 'no such cue' };
      i = index;
      // Any press of a named scene turns "play in order" off.
      c.autoplay = false;
    } else {
      i = c.index + 1;
      if (i >= c.list.length) {
        if (!c.loop) { stop(); return { ok: true, ended: true }; }
        i = 0;
      }
    }
    fireAt(i);
    return { ok: true };
  }

  function back() {
    const c = desk.cues();
    if (!c.list.length) return { error: 'no cue list on the desk' };
    fireAt(Math.max(0, c.index - 1));
    return { ok: true };
  }

  function stop() {
    clear();
    const c = desk.cues();
    c.running = false;
    c.nextAt = null;
    desk.save();
    return { ok: true };
  }

  function setLoop(loop) {
    desk.cues().loop = loop === true;
    desk.save();
    return { ok: true };
  }

  // The one plain switch: play the list in order, each cue for its hold. OFF by default.
  function setAutoplay(on) {
    const c = desk.cues();
    c.autoplay = on === true;
    clear();
    c.nextAt = null;
    if (c.autoplay && c.running && c.index >= 0 && c.list[c.index] && c.list[c.index].hold > 0) schedule(c.list[c.index].hold * 1000);
    desk.save();
    return { ok: true };
  }

  function load(body) {
    const prev = desk.cues();
    const next = sanitizeCues({ project: body.project, list: body.list, loop: body.loop, autoplay: body.autoplay });
    if (body.loop === undefined) next.loop = prev.loop;
    if (body.keepIndex === true && body.autoplay === undefined) next.autoplay = prev.autoplay === true;
    const keep = body.keepIndex === true && prev.running && prev.index >= 0 && next.project === prev.project && next.list.length > 0;
    if (!keep) {
      clear();
      desk.setCues(next);
      desk.save();
      return { ok: true };
    }
    next.index = Math.min(prev.index, next.list.length - 1);
    next.running = true;
    next.missing = prev.missing;
    desk.setCues(next);
    const cue = next.list[next.index];
    if (next.autoplay && cue.hold > 0) {
      const left = prev.nextAt != null ? prev.nextAt - now() : null;
      schedule(left != null && left > 0 && left <= cue.hold * 1000 ? left : cue.hold * 1000);
    } else { clear(); next.nextAt = null; }
    desk.save();
    return { ok: true, kept: true };
  }

  // A desk that starts (or loads a show) with a runner saved as running picks it up
  // where it was: the current cue's look again, and its hold anew.
  function resume() {
    clear();
    const c = desk.cues();
    if (!c.running || c.index < 0 || c.index >= c.list.length) { c.running = false; return; }
    desk.log(`  cue list resumed: ${c.project || 'a project'} cue ${c.index + 1}/${c.list.length} ${c.list[c.index].name}${c.loop ? ' (loop)' : ''}`);
    fireAt(c.index);
  }

  function brief() {
    const c = desk.cues();
    if (!c.list.length) return null;
    const cue = c.list[c.index] || null;
    return {
      project: c.project,
      index: c.index,
      n: c.list.length,
      name: cue ? cue.name : null,
      loop: c.loop,
      autoplay: c.autoplay === true,
      running: c.running,
      nextInMs: c.running && c.nextAt != null ? Math.max(0, c.nextAt - now()) : null,
      firedAt: Number.isFinite(c.firedAt) ? c.firedAt : null,
      missing: c.missing,
    };
  }

  function full() {
    const c = desk.cues();
    return { ...c, ...(brief() || { n: 0, name: null, nextInMs: null }) };
  }

  // for tests: how many timers this runner holds (0 or 1, by construction)
  const pending = () => (timer ? 1 : 0);

  return { go, back, stop, setLoop, setAutoplay, load, resume, brief, full, close: clear, pending };
}

module.exports = { createCueRunner, sanitizeCues, MAX_CUES };
