// Anti-CSRF `state` for OAuth login round-trips that don't have a session
// store to persist it in (this app's login flow always runs `session: false`,
// so passport-oauth2 would otherwise fall back to a NullStore that accepts
// any state value unverified). Same signed/timing-safe/TTL'd pattern as the
// Drive-connect flow's state token, just not bound to a user id.

const crypto = require('node:crypto')

const STATE_TTL_MS = 10 * 60 * 1000

function signLoginState(secret) {
  const payload = Buffer.from(JSON.stringify({ n: crypto.randomBytes(8).toString('hex'), t: Date.now() }))
    .toString('base64url')
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${mac}`
}

function verifyLoginState(secret, state) {
  if (!state || typeof state !== 'string' || !state.includes('.')) return false
  const [payload, mac] = state.split('.')
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return Boolean(data.t) && (Date.now() - data.t <= STATE_TTL_MS)
  } catch {
    return false
  }
}

module.exports = { signLoginState, verifyLoginState, STATE_TTL_MS }
