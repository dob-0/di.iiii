'use strict'

// The show desk's touch board (serverXR/src/touchBoard.js, 2026-10-31; the owner, 23:0x: "make colours like if someone is active,
// that is coloured around"). Who has the Show desk open, which of the six colours each browser has, and what each touched
// last: in memory only, never written to disk, never logged. Pure: no fs, no logger, no express; the clock is injected.
//
// It is fed from request headers the Show desk page already sends (showDesk/ui/presence.js):
//   X-Di-Client   the browser's id (letters, digits . _ : @ -, 1 to 40; the lighting desk's own owner tag alphabet)
//   X-Di-Label    its name, percent-encoded (12 characters at most once decoded)
//   X-Di-Control  on a write: the key of the control that was touched (lamp:f1, scene:warm, blackout …)
// seen(headers) puts a browser on the board; touch(headers) is seen() plus "this control was touched by that browser". The
// route layer (routes/showDeskRoutes.js) calls touch() only for a write the desk answered with a status below 400, so the board
// records what the desk took, never a browser's claim. Bad input is ignored and never thrown; nobody is anonymous.
// A name and an id are what a browser claims, not a login: cosmetic, never a guard. The caps bound memory.
//
// snapshot() carries ages in milliseconds, never wall-clock times, so a phone with a wrong clock still fades right:
//   { ok: true, clients: [{ id, label, slot, seenMs, touchMs|null }], touches: [{ control, id, slot, ageMs }] }

const SLOTS = 6 // six colours (--c0 … --c5 in showDesk/ui/show.css)
const MAX_CLIENTS = 12 // browsers kept (the longest unseen goes first)
const MAX_TOUCHES = 64 // controls kept (the oldest goes first)
const TOUCH_KEEP_MS = 6000 // a touch is kept this long (the page fades it out by 4 s)
const CLIENT_KEEP_MS = 8 * 60 * 60 * 1000 // a browser is kept this long after it was last seen, so its colour holds all night
const LABEL_MAX = 12
const ID = /^[A-Za-z0-9._:@-]{1,40}$/
const CONTROL = /^[a-z][a-z0-9-]{0,23}(:[A-Za-z0-9._@-]{1,40})?$/

// FNV-1a, 32 bit. showDesk/ui/presence.js carries the same function (showDesk/presence.test.js keeps both equal on 200 ids).
const fnv1a = (text) => {
  let h = 0x811c9dc5
  const s = String(text)
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}

// A header value into a name: percent-decoded (a bad escape gives no name, never a throw), NFC, no control, format (bidi) or
// line characters, one space between words, 12 code points at most.
const cleanLabel = (raw) => {
  let s
  try { s = decodeURIComponent(String(raw === undefined || raw === null ? '' : raw)) } catch { return '' }
  try { s = s.normalize('NFC') } catch { /* keep it as it came */ }
  s = s.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim()
  return Array.from(s).slice(0, LABEL_MAX).join('').trim()
}

const header = (headers, name) => {
  const v = headers && typeof headers === 'object' ? headers[name] : undefined
  return Array.isArray(v) ? v[0] : v
}

function createTouchBoard({ now = Date.now } = {}) {
  const clients = new Map() // id -> { id, label, slot, seenAt, touchAt }
  const touches = new Map() // control -> { control, id, at }; Map order is recency (a touch is re-inserted)

  const prune = (t) => {
    for (const [id, c] of clients) if (t - c.seenAt > CLIENT_KEEP_MS) clients.delete(id)
    for (const [control, x] of touches) if (t - x.at > TOUCH_KEEP_MS || !clients.has(x.id)) touches.delete(control)
  }
  // The first slot, from the browser's own hash upward, that no other browser of the roster holds. With all six held the
  // newcomer shares the slot whose most recently seen holder was seen the longest ago, so newcomers spread over browsers that
  // have gone quiet instead of piling onto one (names still tell them apart).
  const slotFor = (id) => {
    const held = new Set([...clients.values()].map((c) => c.slot))
    const start = fnv1a(id) % SLOTS
    for (let k = 0; k < SLOTS; k++) {
      const s = (start + k) % SLOTS
      if (!held.has(s)) return s
    }
    const latest = new Map()
    for (const c of clients.values()) latest.set(c.slot, Math.max(latest.get(c.slot) || 0, c.seenAt))
    let best = start
    for (let s = 0; s < SLOTS; s++) if (!latest.has(best) || (latest.has(s) && latest.get(s) < latest.get(best))) best = s
    return best
  }
  const seen = (headers) => {
    const id = header(headers, 'x-di-client')
    if (typeof id !== 'string' || !ID.test(id)) return null
    const t = now()
    prune(t)
    let c = clients.get(id)
    if (!c) {
      if (clients.size >= MAX_CLIENTS) {
        let oldest = null
        for (const x of clients.values()) if (!oldest || x.seenAt < oldest.seenAt) oldest = x
        if (oldest) clients.delete(oldest.id)
      }
      c = { id, label: '', slot: slotFor(id), seenAt: t, touchAt: null }
      clients.set(id, c)
    }
    c.seenAt = t
    const label = cleanLabel(header(headers, 'x-di-label'))
    if (label) c.label = label
    return c
  }
  const touch = (headers) => {
    const control = header(headers, 'x-di-control')
    if (typeof control !== 'string' || !CONTROL.test(control)) return false
    const c = seen(headers)
    if (!c) return false
    c.touchAt = c.seenAt
    touches.delete(control)
    if (touches.size >= MAX_TOUCHES) touches.delete(touches.keys().next().value)
    touches.set(control, { control, id: c.id, at: c.seenAt })
    return true
  }
  const snapshot = () => {
    const t = now()
    prune(t)
    const ms = (since) => Math.max(0, Math.round(t - since))
    return {
      ok: true,
      clients: [...clients.values()]
        .sort((a, b) => a.slot - b.slot || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((c) => ({ id: c.id, label: c.label, slot: c.slot, seenMs: ms(c.seenAt), touchMs: c.touchAt === null ? null : ms(c.touchAt) })),
      touches: [...touches.values()].map((x) => ({ control: x.control, id: x.id, slot: clients.get(x.id).slot, ageMs: ms(x.at) }))
    }
  }
  return { seen, touch, snapshot }
}

module.exports = { createTouchBoard, fnv1a, cleanLabel, SLOTS, MAX_CLIENTS, MAX_TOUCHES, TOUCH_KEEP_MS, CLIENT_KEEP_MS }
