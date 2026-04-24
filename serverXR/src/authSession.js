const crypto = require('node:crypto')

const DEFAULT_SESSION_COOKIE_NAME = 'dii_serverxr_session'
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 12

const signPayload = (payload, secret) => crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('base64url')

const safeEqual = (left = '', right = '') => {
  const leftBuffer = Buffer.from(String(left))
  const rightBuffer = Buffer.from(String(right))
  if (leftBuffer.length !== rightBuffer.length) {
    return false
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

const createAuthSessionValue = ({
  secret,
  now = Date.now(),
  ttlMs = DEFAULT_SESSION_TTL_MS,
  session = null
} = {}) => {
  if (!secret) {
    throw new Error('Auth session secret is required.')
  }
  const expiresAt = now + Math.max(1, Number(ttlMs) || DEFAULT_SESSION_TTL_MS)
  const normalizedSession = session && typeof session === 'object' ? session : {}
  const payload = Buffer.from(JSON.stringify({
    version: 3,
    issuedAt: now,
    expiresAt,
    ...(normalizedSession.subject ? { subject: String(normalizedSession.subject).trim() } : {}),
    ...(normalizedSession.label ? { label: String(normalizedSession.label).trim() } : {}),
    ...(normalizedSession.role ? { role: String(normalizedSession.role).trim().toLowerCase() } : {}),
    ...(Array.isArray(normalizedSession.spaces) ? { spaces: normalizedSession.spaces } : {})
  })).toString('base64url')
  return {
    value: `${payload}.${signPayload(payload, secret)}`,
    expiresAt
  }
}

const verifyAuthSessionValue = (value, {
  secret,
  now = Date.now()
} = {}) => {
  if (!value || !secret) {
    return { valid: false, reason: 'missing' }
  }
  const parts = String(value).split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'malformed' }
  }
  const [payload, signature] = parts
  const expected = signPayload(payload, secret)
  if (!safeEqual(signature, expected)) {
    return { valid: false, reason: 'signature' }
  }
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!session?.expiresAt || Number(session.expiresAt) <= now) {
      return { valid: false, reason: 'expired' }
    }
    return { valid: true, session }
  } catch {
    return { valid: false, reason: 'payload' }
  }
}

const parseCookies = (header = '') => {
  return String(header || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf('=')
      if (separatorIndex <= 0) return cookies
      const key = entry.slice(0, separatorIndex).trim()
      const value = entry.slice(separatorIndex + 1).trim()
      if (key) {
        cookies[key] = value
      }
      return cookies
    }, {})
}

const readCookie = (header = '', name = DEFAULT_SESSION_COOKIE_NAME) => parseCookies(header)[name] || ''

const serializeCookie = (name, value, {
  httpOnly = true,
  maxAge,
  path = '/',
  sameSite = 'Lax',
  secure = false
} = {}) => {
  const parts = [`${name}=${value || ''}`]
  parts.push(`Path=${path || '/'}`)
  if (Number.isFinite(maxAge)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`)
  }
  if (httpOnly) {
    parts.push('HttpOnly')
  }
  if (sameSite) {
    parts.push(`SameSite=${sameSite}`)
  }
  if (secure) {
    parts.push('Secure')
  }
  return parts.join('; ')
}

const serializeAuthSessionCookie = (value, {
  name = DEFAULT_SESSION_COOKIE_NAME,
  path = '/',
  secure = false,
  ttlMs = DEFAULT_SESSION_TTL_MS
} = {}) => serializeCookie(name, value, {
  maxAge: Math.ceil(Math.max(1, Number(ttlMs) || DEFAULT_SESSION_TTL_MS) / 1000),
  path,
  secure
})

const serializeExpiredAuthSessionCookie = ({
  name = DEFAULT_SESSION_COOKIE_NAME,
  path = '/',
  secure = false
} = {}) => serializeCookie(name, '', {
  maxAge: 0,
  path,
  secure
})

module.exports = {
  DEFAULT_SESSION_COOKIE_NAME,
  DEFAULT_SESSION_TTL_MS,
  createAuthSessionValue,
  parseCookies,
  readCookie,
  serializeAuthSessionCookie,
  serializeExpiredAuthSessionCookie,
  verifyAuthSessionValue
}
