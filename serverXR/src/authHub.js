// The sign-in hub: one server that holds the Google/GitHub/Telegram
// registrations vouches for who someone is; every other di.iiii (a local
// install, a test stack, a stage box) makes its OWN session from that.
//
// Why: a provider only returns people to addresses registered with it, and
// Google refuses private IPs and wildcards outright, so registering every
// install's address can never cover a laptop on a festival wifi or a worktree
// on :4362. One registered hub covers all of them.
//
// Method: the "OAuth proxy" pattern (Auth.js `redirectProxyUrl`, Better Auth
// `oAuthProxy`). The hub's answer is a pass: a JWT (RFC 7519) in JWS compact
// form signed with Ed25519 (EdDSA, RFC 8037). Asymmetric on purpose — a server
// that accepts passes holds only the hub's PUBLIC key, so no secret is shared
// with every laptop, and checking a pass needs no network.
//
// What makes a pass useless to anyone but its owner:
//   aud    the exact callback URL it was minted for; a server accepts only its own
//   nonce  random per attempt, kept in the person's own browser cookie (login CSRF)
//   exp    2 minutes
//   jti    single use (remembered until it expires)
// And the hub mints only for return addresses on its allowlist, so it cannot be
// used to hand someone's identity to an arbitrary site.

const crypto = require('node:crypto')

const PASS_TTL_S = 120
// The official hub: diiii.xyz, registered once with Google and GitHub. Its key
// pair was generated 2026-09-28 on aylmo (~/.config/di-hub/, backup in
// ~/di-backups/di-hub/); rotating it means a new public key here and a release.
const OFFICIAL_HUB_URL = 'https://diiii.xyz/serverXR'
const OFFICIAL_HUB_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAdYfBmRgArKZsAQHzBF33klEjuLIXj/NwHc0zb/2CUT8=\n-----END PUBLIC KEY-----'
const CALLBACK_PATH = '/api/auth/hub/callback'
const HUB_PROVIDERS = ['github', 'google']
const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/

// Defaults: the front door's names, this machine, and the tailnet's MagicDNS.
// A LAN IP is added per hub by config, never by default: any café wifi has one.
const DEFAULT_ALLOWED_RETURNS = [
  'https://*.thedi.studio',
  'https://diiii.xyz', 'https://*.diiii.xyz',
  'http://localhost:*', 'http://127.0.0.1:*', 'http://*.localhost:*',
  'https://*.ts.net'
]

const b64u = (buf) => Buffer.from(buf).toString('base64url')
const fromB64u = (s) => Buffer.from(String(s), 'base64url')

// Keys arrive through env files, where a PEM's newlines are usually written as
// `\n` or the whole PEM is base64'd onto one line. Accept all three.
function readKey(value, kind) {
  const raw = String(value || '').trim()
  if (!raw) return null
  let pem = raw.includes('-----BEGIN') ? raw.replace(/\\n/g, '\n') : Buffer.from(raw, 'base64').toString('utf8')
  if (!pem.includes('-----BEGIN')) return null
  pem = pem.trim() + '\n'
  try {
    return kind === 'private' ? crypto.createPrivateKey(pem) : crypto.createPublicKey(pem)
  } catch {
    return null
  }
}

function generateHubKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' })
  }
}

function signPass(privateKey, claims, { now = Date.now() } = {}) {
  const iat = Math.floor(now / 1000)
  const header = { alg: 'EdDSA', typ: 'JWT' }
  const body = { iat, exp: iat + PASS_TTL_S, jti: crypto.randomBytes(16).toString('hex'), ...claims }
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(body))}`
  const sig = crypto.sign(null, Buffer.from(input), privateKey)
  return `${input}.${b64u(sig)}`
}

// Returns { ok: true, claims } or { ok: false, reason }. Reasons are for logs;
// the person always sees one generic failure.
function verifyPass(publicKey, token, { aud, nonce, now = Date.now(), seen = null } = {}) {
  if (!publicKey) return { ok: false, reason: 'no-key' }
  const parts = String(token || '').split('.')
  if (parts.length !== 3) return { ok: false, reason: 'shape' }
  let header, claims
  try {
    header = JSON.parse(fromB64u(parts[0]).toString('utf8'))
    claims = JSON.parse(fromB64u(parts[1]).toString('utf8'))
  } catch {
    return { ok: false, reason: 'shape' }
  }
  if (header?.alg !== 'EdDSA') return { ok: false, reason: 'alg' }
  const good = crypto.verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, fromB64u(parts[2]))
  if (!good) return { ok: false, reason: 'signature' }
  const t = Math.floor(now / 1000)
  if (typeof claims.exp !== 'number' || t > claims.exp) return { ok: false, reason: 'expired' }
  if (typeof claims.iat !== 'number' || claims.iat > t + 30) return { ok: false, reason: 'future' }
  if (!aud || claims.aud !== aud) return { ok: false, reason: 'audience' }
  if (!nonce || claims.nonce !== nonce) return { ok: false, reason: 'nonce' }
  if (!HUB_PROVIDERS.includes(claims.provider) || !claims.providerId) return { ok: false, reason: 'identity' }
  if (seen) {
    if (seen.has(claims.jti)) return { ok: false, reason: 'replay' }
    seen.add(claims.jti, claims.exp)
  }
  return { ok: true, claims }
}

// Single-use memory for jti values; entries leave once their pass has expired
// anyway, so it cannot grow without bound.
function createSeenSet() {
  const map = new Map()
  return {
    has(jti) { return map.has(jti) },
    add(jti, exp) {
      map.set(jti, exp)
      const t = Math.floor(Date.now() / 1000)
      for (const [k, e] of map) if (e < t) map.delete(k)
    },
    get size() { return map.size }
  }
}

function patternMatches(pattern, url) {
  const m = /^(https?):\/\/([^/:]+)(?::(\*|\d+))?$/.exec(pattern)
  if (!m) return false
  const [, scheme, host, port] = m
  if (url.protocol !== `${scheme}:`) return false
  const want = port === undefined ? (scheme === 'https' ? '443' : '80') : port
  const got = url.port || (url.protocol === 'https:' ? '443' : '80')
  if (want !== '*' && want !== got) return false
  if (host.startsWith('*.')) {
    const suffix = host.slice(1)             // ".thedi.studio"
    return url.hostname.endsWith(suffix) && url.hostname.length > suffix.length
  }
  return url.hostname === host
}

// A return address is allowed only if it is exactly <allowed origin><base>/api/auth/hub/callback:
// no query, no fragment, no credentials, nothing after the callback path.
function isAllowedReturn(value, patterns = DEFAULT_ALLOWED_RETURNS) {
  let url
  try { url = new URL(String(value)) } catch { return false }
  if (url.username || url.password || url.search || url.hash) return false
  if (!url.pathname.endsWith(CALLBACK_PATH)) return false
  if (url.pathname.includes('..') || url.pathname.includes('//')) return false
  return patterns.some((p) => patternMatches(p, url))
}

function isValidNonce(nonce) {
  return NONCE_RE.test(String(nonce || ''))
}

function newNonce() {
  return crypto.randomBytes(24).toString('base64url')
}

module.exports = {
  PASS_TTL_S, CALLBACK_PATH, HUB_PROVIDERS, DEFAULT_ALLOWED_RETURNS, OFFICIAL_HUB_URL, OFFICIAL_HUB_PUBLIC_KEY,
  readKey, generateHubKeyPair, signPass, verifyPass, createSeenSet,
  isAllowedReturn, isValidNonce, newNonce
}
