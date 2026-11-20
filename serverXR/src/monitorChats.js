// The Chats block of the owner's overview (GET /api/monitor -> chats): every chat of every
// reporting machine as one plain row, so the owner sees from one page which chats ask him,
// which work and which are idle. Pure functions only; monitorHub.js feeds them.
//
// The source is a machine's chat list (what `di monitor report` sends in panels.chats).
// Only what the page shows is kept: title, group, state, the chat's own last line, its
// open asks and its idle minutes. The owner's own message text and the session paths are
// dropped here, before anything is stored or sent to a page.

const CHATS_STALE_MS = 120 * 1000
const CHATS_MAX = 60
const SAYS_MAX = 240
const ASKS_PER_CHAT = 3
const STEPS_OPEN_MAX = 5
const LEFT_BEHIND_MIN = 24 * 60 // unfinished steps and no word for a day
const GROUPS = ['ask', 'working', 'idle']
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g
const clean = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').trim().slice(0, max)
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

// the chat's own step list: counts and up to five unfinished titles; nothing else of a step is kept
function cleanSteps(s) {
  if (!isObj(s)) return null
  const total = Math.round(Number(s.total))
  const done = Math.round(Number(s.done))
  if (!Number.isFinite(total) || !Number.isFinite(done) || total < 1 || total > 500 || done < 0) return null
  return {
    done: Math.min(done, total),
    total,
    open: (Array.isArray(s.open) ? s.open : []).slice(0, STEPS_OPEN_MAX).map((x) => clean(x, 60)).filter(Boolean)
  }
}

function groupOf(chat) {
  if (GROUPS.includes(chat.group)) return chat.group
  if (Array.isArray(chat.asks) && chat.asks.length) return 'ask'
  return chat.status === 'busy' ? 'working' : 'idle'
}

/** One chat in the page's shape, or null when it has nothing to identify it. */
function cleanChat(c, host) {
  if (!isObj(c)) return null
  const id = clean(c.id || c.sessionId || c.name || c.title, 80)
  if (!id) return null
  const idle = c.idleMinutes === null || c.idleMinutes === undefined ? NaN : Number(c.idleMinutes)
  const group = groupOf(c)
  const steps = cleanSteps(c.steps)
  const idleMin = Number.isFinite(idle) && idle >= 0 ? Math.round(idle) : null
  return {
    id,
    title: clean(c.title || c.name || id, 80),
    group,
    steps,
    // work left behind: steps still open, the chat is not working, and it has been quiet for a day
    leftBehind: Boolean(steps && steps.done < steps.total && group !== 'working' && idleMin !== null && idleMin >= LEFT_BEHIND_MIN),
    status: clean(c.status, 20) || 'idle',
    // a raw chat has says.first; one already cleaned has says as text (cleaning twice must keep it)
    says: clean(isObj(c.says) ? c.says.first : c.says, SAYS_MAX),
    asks: (Array.isArray(c.asks) ? c.asks : []).slice(0, ASKS_PER_CHAT).map((a) => clean(a, SAYS_MAX)).filter(Boolean),
    idleMinutes: Number.isFinite(idle) && idle >= 0 ? Math.round(idle) : null,
    failed: Boolean(c.error || c.failed),
    host
  }
}

/**
 * What a machine may keep of a chat list: { generatedAt (epoch seconds), chats[] } with the
 * owner's text and paths gone. Anything that is not a list gives null.
 */
function sanitizeChats(raw, host = '') {
  if (!isObj(raw) || !Array.isArray(raw.chats)) return null
  const at = Number(raw.generatedAt)
  return {
    generatedAt: Number.isFinite(at) && at > 0 ? at : null,
    chats: raw.chats.slice(0, 200).map((c) => cleanChat(c, host)).filter(Boolean)
  }
}

const rank = (g) => GROUPS.indexOf(g)

/**
 * `inputs`: [{ host, source, error? }], one per machine that could carry chats (the source is a
 * sanitized or raw chat list, or null). Returns the block the page draws:
 *   state  'live'   at least one source is fresh
 *          'stale'  sources exist but none was heard in the last 120 s (rows kept, flagged)
 *          'failed' a machine tried to read its chats and could not
 *          'none'   nobody carries chats: the page says "no chat data", never "all well"
 *   rows   ask first, then working, then idle (least idle first), at most 60; counts are of ALL chats
 */
function chatsBlock(inputs, { now = Date.now() } = {}) {
  const list = (Array.isArray(inputs) ? inputs : []).filter(isObj)
  const fresh = []
  const old = []
  let error = null
  for (const input of list) {
    const host = clean(input.host, 63)
    if (input.error) error = clean(input.error, 200)
    const src = sanitizeChats(input.source, host)
    if (!src) continue
    const age = src.generatedAt ? now - src.generatedAt * 1000 : Infinity
    ;(age <= CHATS_STALE_MS ? fresh : old).push({ src, age })
  }
  const used = fresh.length ? fresh : old
  let state = 'none'
  if (fresh.length) state = 'live'
  else if (old.length) state = 'stale'
  else if (error) state = 'failed'
  const seen = new Set()
  const all = []
  for (const { src } of used) {
    for (const chat of src.chats) {
      if (seen.has(chat.id)) continue
      seen.add(chat.id)
      all.push(chat)
    }
  }
  all.sort((a, b) => rank(a.group) - rank(b.group) || (a.idleMinutes ?? 1e9) - (b.idleMinutes ?? 1e9))
  const counts = { ask: 0, working: 0, idle: 0, left: 0, total: all.length }
  for (const chat of all) { counts[chat.group] += 1; if (chat.leftBehind) counts.left += 1 }
  const newest = used.length ? Math.min(...used.map((u) => u.age)) : null
  return {
    ok: state === 'live',
    state,
    ...(state === 'failed' ? { error } : {}),
    heardSecondsAgo: Number.isFinite(newest) ? Math.max(0, Math.round(newest / 1000)) : null,
    counts,
    rows: all.slice(0, CHATS_MAX),
    truncated: Math.max(0, all.length - CHATS_MAX)
  }
}

module.exports = { CHATS_STALE_MS, CHATS_MAX, sanitizeChats, chatsBlock }
