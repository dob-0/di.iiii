// Anti-CSRF `state` for OAuth login round-trips that don't have a session
// store to persist it in (this app's login flow always runs `session: false`,
// so passport-oauth2 would otherwise fall back to a NullStore that accepts
// any state value unverified). Same signed/timing-safe/TTL'd pattern as the
// Drive-connect flow's state token, just not bound to a user id.

const crypto = require('node:crypto')

const STATE_TTL_MS = 10 * 60 * 1000

// Same-site paths only: an absolute URL, a protocol-relative //host, or a
// backslash variant here would turn the OAuth callback into an open redirect.
const RETURN_TO_MAX_LENGTH = 600

function sanitizeReturnTo(returnTo) {
  if (typeof returnTo !== 'string') return null
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) return null
  if (returnTo.includes('\\') || returnTo.length > RETURN_TO_MAX_LENGTH) return null
  return returnTo
}

function signLoginState(secret, { returnTo = null } = {}) {
  const safeReturnTo = sanitizeReturnTo(returnTo)
  const payload = Buffer.from(JSON.stringify({
    n: crypto.randomBytes(8).toString('hex'),
    t: Date.now(),
    ...(safeReturnTo ? { r: safeReturnTo } : {})
  })).toString('base64url')
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${mac}`
}

// Returns the verified payload ({ n, t, r? }) or null — verifyLoginState
// keeps its boolean shape on top of this for existing callers.
function readLoginState(secret, state) {
  if (!state || typeof state !== 'string' || !state.includes('.')) return null
  const [payload, mac] = state.split('.')
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!data.t || Date.now() - data.t > STATE_TTL_MS) return null
    return data
  } catch {
    return null
  }
}

function verifyLoginState(secret, state) {
  return Boolean(readLoginState(secret, state))
}

module.exports = { signLoginState, verifyLoginState, readLoginState, sanitizeReturnTo, STATE_TTL_MS }
