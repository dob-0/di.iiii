// Signing in from a terminal — the storage half. Method and wire format:
// docs/architecture/CLI_LOGIN.md (the OAuth device grant, RFC 8628, delivering the
// per-person key of docs/architecture/SPEC_agent_door.md §6).
//
// Two things live here, and they are kept apart on purpose:
//
//   A device code — a terminal asking "may I be signed in as whoever types this
//   code?". The terminal keeps a 256-bit secret (deviceCode) and shows a short
//   user code (BDFG-HJKL). A person who is already signed in, in a browser,
//   types the user code and says yes or no. Both codes are stored as a SHA-256
//   only, it lives ten minutes, and it is spent by the first poll that gets
//   the answer.
//
//   A terminal token — what the yes turns into: `dii_cli_<id>.<secret>`, bound
//   to one account, shown once, stored as a SHA-256, ending when the person
//   revokes it, when it has not been used for 90 days, or 365 days after it was
//   made. It does NOT end when a browser signs out: a login that died with every
//   browser sign-out would bring back the browser trip this exists to remove.
//
// What such a token may reach is cliTokenGate.js; how it becomes a request's
// identity is getAuthState in index.js.

const crypto = require('node:crypto')
const { getDb } = require('./db')

const TOKEN_PREFIX = 'dii_cli_'

// RFC 8628 §6.1: no vowels (so no accidental words), no characters that look
// alike. 20 symbols x 8 places = 34 bits, which §5.1 pairs with a short life
// and rate limits (the routes' limiters; the 10 minutes here).
const USER_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ'
const USER_CODE_LENGTH = 8

const DEVICE_TTL_MS = 10 * 60 * 1000
const INTERVAL_MS = 5 * 1000
const SLOW_DOWN_STEP_MS = 5 * 1000
// A client that polls every `interval` seconds is not "too fast" for being a
// moment early (timers drift); a second of slack, no more.
const POLL_SLACK_MS = 1000
// A stranger can start codes without signing in. The routes limit them per
// address; this bounds the table whatever the addresses are.
const MAX_LIVE_DEVICE_CODES = 2000

const TOKEN_IDLE_MS = 90 * 24 * 60 * 60 * 1000
const TOKEN_MAX_MS = 365 * 24 * 60 * 60 * 1000
// Using a token moves its expiry forward, but a write per request would make
// every call a database write; once in ten minutes is enough for a 90-day window.
const TOUCH_EVERY_MS = 10 * 60 * 1000

const sha256Hex = (value) => crypto.createHash('sha256').update(String(value)).digest('hex')

const constantTimeEqualHex = (a, b) => {
  const bufA = Buffer.from(String(a || ''), 'hex')
  const bufB = Buffer.from(String(b || ''), 'hex')
  if (bufA.length !== bufB.length || bufA.length === 0) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

// The label is text the machine chose and a person reads on the approval page.
// Control characters and the invisible direction marks that can make one word
// read as another are removed; it is shown as plain text and never as a name.
// Spelled as numbers, not characters: a source file with the invisible ones in it is the very thing being guarded against.
const isUnsafeLabelChar = (code) => code <= 0x1f || (code >= 0x7f && code <= 0x9f)
  || (code >= 0x200b && code <= 0x200f) // zero-width marks and the left-to-right / right-to-left marks
  || (code >= 0x202a && code <= 0x202e) // embedding and override controls
  || (code >= 0x2066 && code <= 0x2069) // isolates
  || code === 0xfeff

const cleanLabel = (value, max = 80) => {
  const text = Array.from(String(value ?? ''), (ch) => (isUnsafeLabelChar(ch.codePointAt(0)) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.slice(0, max) : null
}

const randomUserCode = () => {
  let code = ''
  for (let i = 0; i < USER_CODE_LENGTH; i += 1) code += USER_CODE_ALPHABET[crypto.randomInt(USER_CODE_ALPHABET.length)]
  return code
}

const formatUserCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`

// What a person typed -> the code, or null. Case and the dash do not matter;
// anything outside the alphabet makes it no code at all (a quick "no", before
// the database is asked).
const normalizeUserCode = (input) => {
  const code = String(input ?? '').toUpperCase().replace(/[\s-]+/g, '')
  if (code.length !== USER_CODE_LENGTH) return null
  for (const ch of code) if (!USER_CODE_ALPHABET.includes(ch)) return null
  return code
}

const hashUserCode = (code) => sha256Hex(`user-code:${code}`)
const hashDeviceCode = (code) => sha256Hex(`device-code:${code}`)

// ── device codes ────────────────────────────────────────────────────────────

const startDeviceLogin = ({ label = null, from = null, now = Date.now() } = {}) => {
  const db = getDb()
  const live = db.prepare("SELECT COUNT(*) AS n FROM cli_device_codes WHERE status = 'pending' AND expires_at > ?").get(now)
  if (Number(live?.n || 0) >= MAX_LIVE_DEVICE_CODES) {
    const error = new Error('Too many terminals are waiting to sign in. Try again in a few minutes.')
    error.code = 'busy'
    throw error
  }

  const deviceCode = crypto.randomBytes(32).toString('base64url')
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const userCode = randomUserCode()
    const hash = hashUserCode(userCode)
    // Two LIVE codes must never share a user code: a person typing it would
    // approve whichever the database found first.
    const clash = db.prepare("SELECT 1 FROM cli_device_codes WHERE user_code_hash = ? AND status = 'pending' AND expires_at > ?").get(hash, now)
    if (clash) continue
    db.prepare(`
      INSERT INTO cli_device_codes
        (id, device_hash, user_code_hash, label, created_from, status, interval_ms, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(
      crypto.randomBytes(8).toString('hex'), hashDeviceCode(deviceCode), hash,
      cleanLabel(label), from ? String(from).slice(0, 64) : null, INTERVAL_MS, now, now + DEVICE_TTL_MS
    )
    return {
      deviceCode,
      userCode: formatUserCode(userCode),
      expiresIn: Math.round(DEVICE_TTL_MS / 1000),
      interval: Math.round(INTERVAL_MS / 1000)
    }
  }
  const error = new Error('Could not make a free code. Try again.')
  error.code = 'busy'
  throw error
}

const findPendingByUserCode = (input, now = Date.now()) => {
  const code = normalizeUserCode(input)
  if (!code) return null
  return getDb().prepare(`
    SELECT * FROM cli_device_codes
    WHERE user_code_hash = ? AND status = 'pending' AND expires_at > ?
    ORDER BY created_at DESC LIMIT 1
  `).get(hashUserCode(code), now) || null
}

// What the approval page shows about a code that is waiting: only what the
// machine said about itself, when, and from where. Never the codes.
const describePending = (input, now = Date.now()) => {
  const row = findPendingByUserCode(input, now)
  if (!row) return null
  return { label: row.label || null, requestedAt: row.created_at, expiresAt: row.expires_at, from: row.created_from || null }
}

// The person's answer. Returns { approved } or null when no live code matches
// (wrong, expired, or already decided — the caller cannot tell which, nor can
// anyone probing).
const decide = ({ userCode, userId, approve, now = Date.now() }) => {
  if (!userId) return null
  const row = findPendingByUserCode(userCode, now)
  if (!row) return null
  const status = approve ? 'approved' : 'denied'
  const result = getDb().prepare("UPDATE cli_device_codes SET status = ?, user_id = ? WHERE id = ? AND status = 'pending'")
    .run(status, String(userId), row.id)
  if (result.changes !== 1) return null
  return { approved: Boolean(approve) }
}

// The terminal's poll. The answer is one of:
//   { status: 'pending' } · { status: 'slow_down', interval } · { status: 'denied' }
//   { status: 'expired' } (unknown, spent, or past its ten minutes)
//   { status: 'approved', token, tokenId, expiresAt, userId } — once
// `canIssueFor(userId)` lets the caller refuse a person who can no longer be
// signed in (a blocked or removed account) at the moment of issue.
const exchangeDeviceCode = ({ deviceCode, canIssueFor = () => true, now = Date.now() }) => {
  const code = String(deviceCode ?? '')
  if (!code || code.length > 200) return { status: 'expired' }
  const db = getDb()
  const row = db.prepare('SELECT * FROM cli_device_codes WHERE device_hash = ?').get(hashDeviceCode(code))
  if (!row || row.status === 'consumed') return { status: 'expired' }
  if (now > row.expires_at) return { status: 'expired' }

  if (row.last_poll_at && now - row.last_poll_at < row.interval_ms - POLL_SLACK_MS) {
    const slower = row.interval_ms + SLOW_DOWN_STEP_MS
    db.prepare('UPDATE cli_device_codes SET interval_ms = ?, last_poll_at = ? WHERE id = ?').run(slower, now, row.id)
    return { status: 'slow_down', interval: Math.round(slower / 1000) }
  }
  db.prepare('UPDATE cli_device_codes SET last_poll_at = ? WHERE id = ?').run(now, row.id)

  if (row.status === 'pending') return { status: 'pending' }

  // Whatever the answer, it is given once: compare-and-swap, so two polls that
  // race (or two servers on one database) cannot both leave with a token.
  const spent = db.prepare("UPDATE cli_device_codes SET status = 'consumed' WHERE id = ? AND status = ?").run(row.id, row.status)
  if (spent.changes !== 1) return { status: 'expired' }

  if (row.status === 'denied') return { status: 'denied' }
  if (!row.user_id || !canIssueFor(row.user_id)) return { status: 'denied' }
  const minted = mintCliToken({ userId: row.user_id, label: row.label, from: row.created_from, now })
  return { status: 'approved', token: minted.token, tokenId: minted.id, expiresAt: minted.expiresAt, userId: row.user_id }
}

// ── terminal tokens ─────────────────────────────────────────────────────────

// Returns { token, id, expiresAt }. The token is shown once and never stored.
const mintCliToken = ({ userId, label = null, from = null, now = Date.now() }) => {
  if (!userId) throw new Error('A terminal token needs the account it acts as.')
  const id = crypto.randomBytes(8).toString('hex')
  const secret = crypto.randomBytes(32).toString('base64url')
  const expiresAt = now + TOKEN_IDLE_MS
  getDb().prepare(`
    INSERT INTO cli_tokens (id, secret_hash, user_id, label, created_from, created_at, last_used_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sha256Hex(secret), String(userId), cleanLabel(label), from ? String(from).slice(0, 64) : null, now, now, expiresAt)
  return { token: `${TOKEN_PREFIX}${id}.${secret}`, id, expiresAt }
}

// The claim, or null for every failure — unknown, malformed, expired, revoked,
// wrong secret — and the caller cannot tell them apart. It does NOT check the
// account itself (still there? blocked?): index.js reads the account fresh on
// every request, as it does for a cookie.
const resolveCliToken = (token = '', now = Date.now()) => {
  const value = String(token || '').trim()
  if (!value.startsWith(TOKEN_PREFIX)) return null
  const rest = value.slice(TOKEN_PREFIX.length)
  const dot = rest.indexOf('.')
  if (dot <= 0) return null
  const id = rest.slice(0, dot)
  const secret = rest.slice(dot + 1)
  if (!id || !secret) return null

  const db = getDb()
  let row
  try { row = db.prepare('SELECT * FROM cli_tokens WHERE id = ?').get(id) } catch { return null }
  if (!row || row.revoked_at) return null
  if (now > row.expires_at) return null
  if (now > row.created_at + TOKEN_MAX_MS) return null
  if (!constantTimeEqualHex(sha256Hex(secret), row.secret_hash)) return null

  let expiresAt = row.expires_at
  if (!row.last_used_at || now - row.last_used_at >= TOUCH_EVERY_MS) {
    expiresAt = Math.min(now + TOKEN_IDLE_MS, row.created_at + TOKEN_MAX_MS)
    try {
      db.prepare('UPDATE cli_tokens SET last_used_at = ?, expires_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, expiresAt, id)
    } catch { /* not being able to note a use is never a reason to refuse the request */ }
  }
  return { tokenId: row.id, userId: row.user_id, label: row.label || null, createdAt: row.created_at, expiresAt }
}

// This account's live terminal logins, for the list in the browser.
const listCliTokens = (userId, now = Date.now()) => getDb().prepare(`
  SELECT id, label, created_at, last_used_at, expires_at FROM cli_tokens
  WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? AND created_at + ? > ?
  ORDER BY created_at DESC
`).all(String(userId || ''), now, TOKEN_MAX_MS, now).map((row) => ({
  id: row.id,
  label: row.label || null,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at || null,
  expiresAt: row.expires_at
}))

// Ending a login: one of an account's own (the list), or the one a terminal
// holds (`di logout`). Both answer how many ended, so a wrong id is a plain 0.
const revokeCliToken = ({ id, userId = null, now = Date.now() }) => {
  try {
    const where = userId === null ? 'id = ?' : 'id = ? AND user_id = ?'
    const args = userId === null ? [now, String(id || '')] : [now, String(id || ''), String(userId)]
    return getDb().prepare(`UPDATE cli_tokens SET revoked_at = ? WHERE ${where} AND revoked_at IS NULL`).run(...args).changes || 0
  } catch {
    return 0
  }
}

const revokeCliTokensForUser = (userId, now = Date.now()) => {
  try {
    return getDb().prepare('UPDATE cli_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(now, String(userId || '')).changes || 0
  } catch {
    return 0
  }
}

// Expired and spent rows are worthless; this only stops the tables growing.
// Rides the same half-hour sweep as the Telegram tokens (index.js). Device
// codes go an hour after they ended, so a late poll still hears "expired".
const pruneCliLogin = (now = Date.now()) => {
  try {
    const db = getDb()
    const codes = db.prepare("DELETE FROM cli_device_codes WHERE expires_at < ? OR status = 'consumed'").run(now - 60 * 60 * 1000).changes || 0
    const tokens = db.prepare('DELETE FROM cli_tokens WHERE revoked_at IS NOT NULL OR expires_at < ? OR created_at + ? < ?')
      .run(now, TOKEN_MAX_MS, now).changes || 0
    return codes + tokens
  } catch {
    return 0
  }
}

module.exports = {
  startDeviceLogin,
  describePending,
  decide,
  exchangeDeviceCode,
  mintCliToken,
  resolveCliToken,
  listCliTokens,
  revokeCliToken,
  revokeCliTokensForUser,
  pruneCliLogin,
  normalizeUserCode,
  formatUserCode,
  cleanLabel,
  TOKEN_PREFIX,
  USER_CODE_ALPHABET,
  USER_CODE_LENGTH,
  DEVICE_TTL_MS,
  INTERVAL_MS,
  TOKEN_IDLE_MS,
  TOKEN_MAX_MS,
  TOUCH_EVERY_MS,
  MAX_LIVE_DEVICE_CODES
}
