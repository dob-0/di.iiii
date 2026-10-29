// Signed calls to the name broker: what an install signs, and how the broker
// checks it. Ed25519 through WebCrypto (Workers and Node 22 both carry it).
//
//   message = `${method}\n${path}\n${ts}\n${sha256hex(body)}`
//   X-Di-Sig = base64url(Ed25519 signature over message, the label's install key)
//
// The install key is made on the install and only its public half is sent at
// claim time (docs/ai/team-sync-by-network-name.md §6).

export const CLOCK_SKEW_SECONDS = 120

const encoder = new TextEncoder()

export function base64urlToBytes(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(text)) return null
  const b64 = text.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  try {
    const raw = atob(padded)
    const out = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

export function bytesToBase64url(bytes) {
  let raw = ''
  for (const b of new Uint8Array(bytes)) raw += String.fromCharCode(b)
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function sha256hex(body) {
  const data = typeof body === 'string' ? encoder.encode(body) : new Uint8Array(body || [])
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function signedMessage(method, path, ts, body) {
  return `${String(method).toUpperCase()}\n${path}\n${ts}\n${await sha256hex(body)}`
}

// A 32-byte raw Ed25519 public key that WebCrypto accepts, or null.
export async function importPublicKey(pubkey) {
  const bytes = base64urlToBytes(pubkey)
  if (!bytes || bytes.length !== 32) return null
  try {
    return await crypto.subtle.importKey('raw', bytes, { name: 'Ed25519' }, false, ['verify'])
  } catch {
    return null
  }
}

// { ok: true } or { ok: false, reason } — the reason is for the log, the
// caller answers every failure with the same 401.
export async function verifyRequest({ pubkey, method, path, ts, sig, body, nowSeconds }) {
  const tsNumber = Number(ts)
  if (!/^\d{1,12}$/.test(String(ts || ''))) return { ok: false, reason: 'no timestamp' }
  if (Math.abs(nowSeconds - tsNumber) > CLOCK_SKEW_SECONDS) return { ok: false, reason: 'timestamp out of window' }
  const sigBytes = base64urlToBytes(sig)
  if (!sigBytes || sigBytes.length !== 64) return { ok: false, reason: 'malformed signature' }
  const key = await importPublicKey(pubkey)
  if (!key) return { ok: false, reason: 'stored key unusable' }
  const message = encoder.encode(await signedMessage(method, path, ts, body))
  const good = await crypto.subtle.verify({ name: 'Ed25519' }, key, sigBytes, message)
  return good ? { ok: true } : { ok: false, reason: 'signature does not verify' }
}
