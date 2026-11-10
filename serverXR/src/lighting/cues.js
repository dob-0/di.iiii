'use strict';
// Follow times — scenes that run on by themselves (studio, 2026-09-24). Her ask, twice:
// "a scene that turns 2 lights on, then the others 3s later". Daslight calls these steps.
//
// A scene may carry:
//   followMs   how long to WAIT after its own fade has finished, then go on (0 = straight on)
//   followId   the scene to go on to. Absent = the next scene in the same container; a
//              scene that is last in its container (or in none) then ends the sequence.
// A scene without followMs does exactly what it always did — every scene built before this
// feature, and every scene tools/scenes-studio.js makes, is untouched.
//
// Server-authoritative: the engine ticks the runner at 40Hz, so a sequence keeps going with
// every browser closed. A MANUAL recall of a scene that has a follow starts a sequence from
// it; a manual recall of any other scene ends the running one; Stop ends it; Go jumps to
// the next step now. The chase and the runner never share the rig: starting the chase
// ends the sequence, and the runner's own steps never pause the chase or start another.

const { followNextId } = require('./ui/cuecore');   // shared with the page (cueui.js)

const MAX_FOLLOW_MS = 10 * 60 * 1000;
const MAX_CHAIN = 200;
// A step never comes sooner than this after the last one. Two scenes that follow each other
// with no wait and no fade would otherwise flip the whole rig on every 25 ms frame.
const MIN_STEP_MS = 100;
// The longest fade the engine runs: engine.js startFade clamps to the same 60 s, so a follow
// never waits out a fade that is not happening.
const MAX_FADE_MS = 60000;

// The follow fields of a scene as the library stores them: both or neither.
function sanitizeFollow(s) {
  if (!s || s.followMs == null || s.followMs === '') return {};
  const ms = Math.round(+s.followMs);
  if (!Number.isFinite(ms)) return {};
  const out = { followMs: Math.max(0, Math.min(MAX_FOLLOW_MS, ms)) };
  if (typeof s.followId === 'string' && s.followId) out.followId = s.followId.slice(0, 40);
  return out;
}

class CueRunner {
  constructor(engine) {
    this.engine = engine;
    this.run = null;      // {startId, currentId, step, chain, loops, stepAt, nextAt}
    this.last = null;     // {reason, at} — why the last sequence ended, for the page
  }

  get state() { return this.engine.state; }
  scene(id) { return this.state.scenes.find((s) => s.id === id) || null; }
  hasFollow(sc) { return !!sc && sc.followMs != null && Number.isFinite(+sc.followMs); }

  // Where a scene goes on to: its own followId, else the next live scene in its container
  // — or, on a desk that has no containers at all (di.iiii's), the next in the library.
  // null = the sequence ends here. ui/cuecore.js holds the rule, so the page's badges and
  // Follow… editor give the answer this runner steps by.
  nextOf(sc) {
    if (!this.hasFollow(sc)) return null;
    return followNextId(this.state.scenes, this.state.banks, sc);
  }

  // The whole sequence from a scene, for "Step 2 of 3": follow the links until one ends
  // it or comes back round (a loop).
  chainFrom(id) {
    const chain = [];
    const seen = new Set();
    let cur = id;
    while (cur && !seen.has(cur) && chain.length < MAX_CHAIN) {
      seen.add(cur); chain.push(cur);
      cur = this.nextOf(this.scene(cur));
    }
    return { chain, loops: !!cur && seen.has(cur), loopTo: cur && seen.has(cur) ? chain.indexOf(cur) : -1 };
  }

  // When a step is due: after the scene's fade, plus its wait. The fade is read the way
  // startFade reads it — not a number or not above 0 is no fade, and never more than 60 s.
  dueAfter(sc, fadeMs, now) {
    const raw = fadeMs != null ? +fadeMs : +sc.fadeMs;
    const fade = Number.isFinite(raw) && raw > 0 ? Math.min(MAX_FADE_MS, raw) : 0;
    return now + Math.max(MIN_STEP_MS, fade + Math.max(0, +sc.followMs || 0));
  }

  // A person recalled a scene (the /api/scenes/recall route). Returns what happened, for
  // the reply: 'started', 'ended' or null.
  onManualRecall(sc, fadeMs, now = Date.now()) {
    if (sc && this.hasFollow(sc) && this.nextOf(sc)) {
      const { chain, loops, loopTo } = this.chainFrom(sc.id);
      this.run = { startId: sc.id, currentId: sc.id, step: 0, chain, loops, loopTo, stepAt: now, nextAt: this.dueAfter(sc, fadeMs, now) };
      this.last = null;
      return 'started';
    }
    if (this.run) { this.stop('another scene was picked', now); return 'ended'; }
    return null;
  }

  stop(reason = 'stopped', now = Date.now()) {
    if (!this.run) return false;
    this.run = null;
    this.last = { reason, at: now };
    return true;
  }

  // Jump to the next step now (Go). False when nothing is running.
  go() {
    if (!this.run) return false;
    this.run.nextAt = 0;
    this.tick(Date.now());
    return true;
  }

  tick(now = Date.now()) {
    const r = this.run;
    if (!r) return;
    // The chase owns the rig while it runs.
    if (this.state.chase && this.state.chase.enabled) { this.stop('the chase started', now); return; }
    if (now < r.nextAt) return;
    const cur = this.scene(r.currentId);
    const nextId = cur ? this.nextOf(cur) : null;
    const next = nextId ? this.scene(nextId) : null;
    if (!next) { this.stop(cur ? 'finished' : 'its scene was deleted', now); return; }
    this.engine.recallScene(next);
    r.currentId = next.id;
    const at = r.chain.indexOf(next.id);
    r.step = at >= 0 ? at : r.step + 1;
    r.stepAt = now;
    if (this.hasFollow(next) && this.nextOf(next)) r.nextAt = this.dueAfter(next, null, now);
    else this.stop('finished', now);   // the last step stays on — the look holds
  }

  status(now = Date.now()) {
    const r = this.run;
    if (!r) return { running: false, last: this.last };
    return {
      running: true,
      sceneId: r.currentId,
      startId: r.startId,
      step: r.step + 1,
      total: r.chain.length,
      loops: r.loops,
      chain: r.chain,
      nextAt: r.nextAt,
      msLeft: Math.max(0, r.nextAt - now),
      nextId: this.nextOf(this.scene(r.currentId)),
    };
  }
}

// Routes, handed the server's own helpers (the same pattern as pixelmap.js):
//   'POST /api/scenes/follow'  {id, followMs|null, followId|null} — set or clear a follow
//   'POST /api/cue'            {action: 'go'|'stop'}
// The studio desk mounts these. di.iiii's desk.js does NOT: it replaces `state` whole when
// a space's show is loaded, and a route holding the object it was handed would go on
// editing the show that was left. Its routes are inline in desk.js and must match these.
function cueRoutes({ state, engine, save, pushFrame, json }) {
  return {
    'POST /api/scenes/follow': (req, res, body) => {
      const sc = state.scenes.find((s) => s.id === (body && body.id));
      if (!sc) return json(res, { error: 'no such scene' }, 404);
      // Refuse first: a request that is turned down leaves the stored follow as it was.
      if (body.followMs != null) {
        if (body.followId && !state.scenes.some((s) => s.id === body.followId)) {
          return json(res, { error: 'the scene to follow on to does not exist' }, 400);
        }
        if (body.followId === sc.id && !(+body.followMs > 0)) {
          return json(res, { error: 'a scene that follows on to itself needs a wait above 0' }, 400);
        }
      }
      delete sc.followMs; delete sc.followId;
      if (body.followMs != null) Object.assign(sc, sanitizeFollow({ followMs: body.followMs, followId: body.followId }));
      save();
      json(res, { ok: true, scene: sc, next: engine.cues.nextOf(sc), chain: sc.followMs != null ? engine.cues.chainFrom(sc.id) : null });
    },
    'POST /api/cue': (req, res, body) => {
      const action = body && body.action;
      if (action === 'go') {
        const ok = engine.cues.go();
        pushFrame();
        return json(res, { ok, cue: engine.cues.status() });
      }
      if (action === 'stop') {
        const ok = engine.cues.stop('stopped');
        return json(res, { ok, cue: engine.cues.status() });
      }
      json(res, { error: 'action must be go or stop' }, 400);
    },
  };
}

module.exports = { CueRunner, sanitizeFollow, cueRoutes, MAX_FOLLOW_MS, MIN_STEP_MS, MAX_FADE_MS };
