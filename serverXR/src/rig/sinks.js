'use strict'

// Lane D · sinks. Local blackout state, the cue registry/dispatcher, and a defensive
// bridge to the lighting desk. See docs/architecture/rig/PROTOCOL-1.md §2.3 (cues,
// including the built-ins registered by registerBuiltinCues below), §2.4 (blackout) and
// §7's lane D interface block.

const { EventEmitter } = require('events')
const fs = require('fs')
const path = require('path')

// A cue id is only checked for 60s (PROTOCOL-1.md §2.3: "The same id seen within 60s
// gets duplicate").
const DUPLICATE_WINDOW_MS = 60000

// runCue's accept/reject rule for a registered handler. PROTOCOL-1.md §2.3 names four
// reasons a cue can come back not-accepted but only defines "unknown-cue" (no such name)
// and "duplicate" (id reseen) precisely; "bad-args" vs "not-allowed" is left to the
// handler. The rule this file uses, spelled out because nothing else pins it down:
//   - a handler that wants to say "the args were wrong" throws an Error with
//     `.badArgs = true` (or `.code === 'BAD_ARGS'`) -> { accepted: false, reason: 'bad-args' }.
//     This is an ordinary, expected refusal (a client sent a malformed cue) and is never
//     logged as a fault.
//   - a handler that throws anything else is refusing the cue for its own reasons (mode,
//     capability, whatever) -> logged once via `logger.warn`, answered
//     { accepted: false, reason: 'not-allowed' }. Either way runCue never throws and never
//     produces a 500: PROTOCOL-1.md §2.3 says a refused cue is HTTP 200, accepted: false.
function isBadArgsError(err) {
  return !!(err && (err.badArgs === true || err.code === 'BAD_ARGS'))
}

function createSinks({ logger = console } = {}) {
  const events = new EventEmitter()
  const registry = new Map() // name -> { handler, describe }
  const seenCueIds = new Map() // id -> expiry (ms since epoch)
  let blackoutOn = false
  let blackoutFrom = null

  function pruneSeen(now) {
    for (const [id, expiry] of seenCueIds) {
      if (expiry <= now) seenCueIds.delete(id)
    }
  }

  // Always accepted, from any member, in any mode (PROTOCOL-1.md §2.4). A no-op when the
  // state does not actually change, so a redundant blackout POST never re-broadcasts an
  // 'blackout' event to every connected output for nothing.
  function setBlackout(on, from = null) {
    const next = !!on
    if (next === blackoutOn) return
    blackoutOn = next
    blackoutFrom = from || null
    events.emit('blackout', { on: blackoutOn, from: blackoutFrom })
  }

  function isBlackout() {
    return blackoutOn
  }

  function onBlackout(fn) {
    events.on('blackout', fn)
    return () => events.off('blackout', fn)
  }

  function registerCue(name, handler, { describe } = {}) {
    if (typeof name !== 'string' || !name) throw new TypeError('registerCue: name must be a non-empty string')
    if (typeof handler !== 'function') throw new TypeError('registerCue: handler must be a function')
    registry.set(name, { handler, describe: describe || '' })
  }

  function cues() {
    return [...registry.entries()].map(([name, { describe }]) => ({ name, describe }))
  }

  async function runCue(cue) {
    const name = cue && cue.name
    const id = cue && typeof cue.id === 'string' ? cue.id : null
    const now = Date.now()
    pruneSeen(now)
    if (id && seenCueIds.has(id)) {
      return { accepted: false, reason: 'duplicate' }
    }
    const entry = registry.get(name)
    if (!entry) {
      return { accepted: false, reason: 'unknown-cue' }
    }
    // Recorded before the handler runs: a handler that never resolves must not open a
    // 60s window where the same id could be replayed and accepted twice.
    if (id) seenCueIds.set(id, now + DUPLICATE_WINDOW_MS)
    try {
      const result = await entry.handler(cue && cue.args, cue)
      return { accepted: true, result }
    } catch (err) {
      if (isBadArgsError(err)) return { accepted: false, reason: 'bad-args' }
      logger?.warn?.(`[rig/sinks] cue "${name}" refused: ${(err && err.message) || err}`)
      return { accepted: false, reason: 'not-allowed' }
    }
  }

  return { setBlackout, isBlackout, onBlackout, registerCue, runCue, cues, events }
}

// A URL a browser output may be sent to without leaving this origin. PROTOCOL-1.md §2.3:
// "args.url, which must be same-origin or a path". Rejected: an absolute URL with a
// scheme (http:, javascript:, ...), a protocol-relative '//host/path', and — not spelled
// out in the protocol doc but a real same-origin bypass in a browser — a leading
// backslash, which a browser silently folds into '/', letting "/\evil.com" or
// "\\evil.com" masquerade as a path while resolving as protocol-relative.
function isSafeShowPageUrl(url) {
  if (typeof url !== 'string' || !url) return false
  if (url.startsWith('//')) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false
  // No backslash anywhere, not just a leading one: a browser folds \ to / while
  // resolving a URL, so "/\evil.example" (a path by this check otherwise) and
  // "a/\evil.example" (a relative path otherwise) both resolve as protocol-relative.
  if (url.includes('\\')) return false
  // What is left is either an absolute path ('/…') or a same-origin-safe relative one
  // ('atlas/index.html') — both resolve against this origin, never another one.
  return true
}

// The three built-in cues every rig member answers (PROTOCOL-1.md §2.3).
function registerBuiltinCues(sinks) {
  sinks.registerCue('ping', () => ({ at: Date.now() }), {
    describe: 'answers { at: Date.now() }'
  })

  sinks.registerCue('reload', (args, cue) => {
    sinks.events.emit('cue', { name: 'reload', args: args || {}, from: (cue && cue.from) || null })
    return {}
  }, { describe: 'browser outputs on this member reload' })

  sinks.registerCue('show-page', (args, cue) => {
    const url = args && args.url
    if (!isSafeShowPageUrl(url)) {
      const err = new Error('show-page requires args.url to be a same-origin path')
      err.badArgs = true
      throw err
    }
    sinks.events.emit('cue', { name: 'show-page', args: { url }, from: (cue && cue.from) || null })
    return {}
  }, { describe: 'browser outputs navigate to args.url' })
}

// Best-effort: where the lighting desk would keep its show, without asking
// lightingRoutes.js or desk.js (neither is this lane's to edit). serverXR/src/index.js
// passes the SAME config.directories.dataDir to registerLightingRoutes as `dataDir`
// (routes/lightingRoutes.js joins it with 'lighting'), and desk.js joins THAT with
// 'show.json' (SHOW = path.join(DATA, 'show.json')). Reading serverXR/src/config.js
// directly — a shared module no rig lane owns — is the only way to reconstruct that
// path from outside those two files.
function defaultDataDir() {
  try {
    const config = require('../config')
    return (config && config.directories && config.directories.dataDir) || null
  } catch {
    return null
  }
}

function savedShowExists(dataDir) {
  if (!dataDir) return false
  try {
    return fs.existsSync(path.join(dataDir, 'lighting', 'show.json'))
  } catch {
    return false
  }
}

// wireLighting(sinks, lighting) — PROTOCOL-1.md §7: "never instantiate the desk only to
// black it out unless a saved show exists on disk". `lighting` is
// registerLightingRoutes()'s return value, `{ getDesk, close }` (routes/lightingRoutes.js).
//
// KNOWN GAP, reported rather than worked around by editing lightingRoutes.js/desk.js:
// that return value has no side-effect-free way to ask "does a desk already exist?" —
// `getDesk()` itself is what creates one (and starts its 40Hz output loop) on first call,
// and the object it hands back exposes no `hasDesk()`/dataDir of its own. So "the desk
// was already created" can only be detected here for creations THIS wiring itself causes
// (tracked below); a desk created by, say, a browser opening /light before any show was
// ever saved is invisible to us until that show is written. The accepted failure mode is
// an un-mirrored blackout in that one narrow window, never an accidental desk/loop.
//
// The optional third argument is a test seam only (not part of the frozen 2-arg call
// PROTOCOL-1.md documents at the rig/index.js call site) — omit it in production and it
// defaults to the real data dir.
function wireLighting(sinks, lighting, { dataDir } = {}) {
  if (!lighting || typeof lighting.getDesk !== 'function') return () => {}
  const resolvedDataDir = dataDir !== undefined ? dataDir : defaultDataDir()
  let weCreatedDesk = false

  const applyToDesk = (on) => {
    if (!weCreatedDesk && !savedShowExists(resolvedDataDir)) return
    let desk
    try {
      desk = lighting.getDesk()
    } catch {
      return
    }
    weCreatedDesk = true
    if (!desk || !desk.state) return
    // The desk's own internal API (its live `state`, and the two safe public methods it
    // hands back — see createDesk's `return { handle, close, state, engine, writeShow,
    // summary, showFile }` in lighting/desk.js), not a faked HTTP request through
    // `desk.handle(req, res, path)`: POST /api/master's own blackout branch just flips
    // `state.blackout`, and the desk's already-running 40Hz loop (`startLoop()`, called
    // unconditionally in createDesk) picks the new value up on its own within one tick —
    // no manual frame push needed. `engine.cancelFade()` is called the same way that route
    // calls it, on every change. The one piece of that route's behaviour NOT reproduced
    // here is its private `cancelPending()` (per-fixture pending-value timers, not exported
    // outside the closure) — a strobe with under ~25ms left to land could still show one
    // extra frame before blackout catches it on the next tick.
    desk.state.blackout = !!on
    try { if (desk.engine && typeof desk.engine.cancelFade === 'function') desk.engine.cancelFade() } catch { /* best effort */ }
    try { if (typeof desk.writeShow === 'function') desk.writeShow() } catch { /* best effort */ }
  }

  return sinks.onBlackout(({ on }) => applyToDesk(on))
}

module.exports = { createSinks, registerBuiltinCues, wireLighting, isSafeShowPageUrl }
