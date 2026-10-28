// The name broker: gives each install a network name `<label>.<zone>` and moves
// its records on the install's signed word, never holding the install's TLS key.
// Design: docs/ai/team-sync-by-network-name.md §4–§6, §10, §12. README.md here.
import { createDns, CloudflareError, RECORD_TTL } from './cloudflare.js'
import { importPublicKey, verifyRequest } from './sign.js'

export const VERSION = '0.1.0'
export const LIMITS = {
  labelsPerAccount: 3,
  ordersPerWeek: 4,
  addressesPerHour: 60,
  badSignaturesPerHour: 20
}
const HOUR = 3600
const WEEK = 7 * 24 * HOUR
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'
const LABEL_RE = /^[a-z0-9-]{3,40}$/
const LOOPBACK_RECORD = '127.0.0.1'
const MAX_BODY = 4096

const json = (status, data) =>
  new Response(data === undefined ? null : JSON.stringify(data), {
    status,
    headers: data === undefined ? {} : { 'content-type': 'application/json; charset=utf-8' }
  })
const fail = (status, error) => json(status, { error })
const log = (label, op, outcome) => console.log(JSON.stringify({ label: label || null, op, outcome }))

// ── names ────────────────────────────────────────────────────────────────

// `<who>`: a short handle. The dev tier's whoami answers a display name (or an
// email when there is none), not a handle, so the install may send its own
// `labelHint`; otherwise the first word of the name. Never the whole name:
// Certificate Transparency publishes every label (§12).
export function whoFrom(hint, name) {
  const clean = (text) =>
    String(text || '')
      .toLowerCase()
      .split(/[\s@.]/)[0]
      .normalize('NFKD')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 35)
      .replace(/-$/, '')
  return clean(hint) || clean(name) || 'di'
}

function randomSuffix() {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return [...bytes].map((b) => BASE32[b & 31]).join('')
}

export function isLabel(text) {
  return typeof text === 'string' && LABEL_RE.test(text) && !text.startsWith('-') && !text.endsWith('-')
}

// ── the private-address rule (§6.3) ─────────────────────────────────────

function ipv4Parts(text) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some((n, i) => n > 255 || (m[i + 1].length > 1 && m[i + 1].startsWith('0')))) return null
  return parts
}

function ipv6Hextets(text) {
  if (typeof text !== 'string' || !/^[0-9a-fA-F:]+$/.test(text) || text.length > 39) return null
  const halves = text.split('::')
  if (halves.length > 2) return null
  const side = (s) => (s === '' ? [] : s.split(':'))
  const head = side(halves[0])
  const tail = halves.length === 2 ? side(halves[1]) : []
  if ([...head, ...tail].some((h) => !/^[0-9a-fA-F]{1,4}$/.test(h))) return null
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null
  return [...head, ...Array(missing).fill('0'), ...tail].map((h) => parseInt(h, 16))
}

// 'A' or 'AAAA' when the address is loopback / RFC 1918 / 100.64/10 / ::1 / fc00::/7, else null.
export function privateAddressType(address) {
  const v4 = ipv4Parts(String(address || ''))
  if (v4) {
    const [a, b] = v4
    const ok =
      a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
    return ok ? 'A' : null
  }
  const v6 = ipv6Hextets(String(address || ''))
  if (v6) {
    const loopback = v6.slice(0, 7).every((h) => h === 0) && v6[7] === 1
    const ula = (v6[0] & 0xfe00) === 0xfc00
    return loopback || ula ? 'AAAA' : null
  }
  return null
}

// ── KV helpers (keys: label:<l>, account:<id>, seen:<l>:<sig>, n:<l>:<kind>:<bucket>) ──

async function readJson(kv, key) {
  const raw = await kv.get(key)
  if (raw == null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function bump(kv, key, ttl) {
  const n = Number((await kv.get(key)) || 0) + 1
  await kv.put(key, String(n), { expirationTtl: ttl })
  return n
}

const bucket = (now, size) => Math.floor(now / size)

// ── the dev tier: who is this login? ─────────────────────────────────────

async function whoIs(env, loginToken, fetchImpl) {
  const base = String(env.DI_API_BASE || 'https://dev.diiii.xyz/serverXR').replace(/\/+$/, '')
  const response = await fetchImpl(`${base}/api/auth/cli/whoami`, {
    headers: { authorization: `Bearer ${loginToken}`, accept: 'application/json' }
  })
  if (response.status === 401 || response.status === 403) return { refused: true }
  if (!response.ok) throw new Error(`whoami answered ${response.status}`)
  const data = await response.json()
  const id = data?.user?.id
  if (!id) throw new Error('whoami answered without a user')
  return { account: String(id), name: data.user.name || '' }
}

// ── routes ───────────────────────────────────────────────────────────────

async function readBody(request) {
  const text = await request.text()
  if (text.length > MAX_BODY) return { text, data: null, tooLarge: true }
  if (!text) return { text, data: null }
  try {
    return { text, data: JSON.parse(text) }
  } catch {
    return { text, data: undefined }
  }
}

async function claim(request, env, ctx) {
  const { data } = await readBody(request)
  if (!data || typeof data !== 'object') return fail(400, 'body must be JSON')
  const { pubkey, loginToken, labelHint } = data
  if (typeof loginToken !== 'string' || !loginToken) return fail(400, 'loginToken is required')
  if (!(await importPublicKey(pubkey))) return fail(400, 'pubkey must be a base64url Ed25519 public key')
  if (labelHint !== undefined && typeof labelHint !== 'string') return fail(400, 'labelHint must be a string')

  let who
  try {
    who = await whoIs(env, loginToken, ctx.fetch)
  } catch (error) {
    log(null, 'claim', `dev tier unreachable: ${error.message}`)
    return fail(502, 'could not check the login with the dev tier')
  }
  if (who.refused) {
    log(null, 'claim', 'login refused')
    return fail(401, 'login token not accepted')
  }

  const accountKey = `account:${who.account}`
  const owned = (await readJson(env.LABELS, accountKey)) || []
  if (owned.length >= LIMITS.labelsPerAccount) {
    log(null, 'claim', 'limit: labels per account')
    return fail(409, `an account holds at most ${LIMITS.labelsPerAccount} labels`)
  }

  const handle = whoFrom(labelHint, who.name)
  let label = null
  for (let attempt = 0; attempt < 8 && !label; attempt += 1) {
    const candidate = `${handle}-${randomSuffix()}`
    if (isLabel(candidate) && !(await env.LABELS.get(`label:${candidate}`))) label = candidate
  }
  if (!label) return fail(503, 'no free label, try again')

  const name = `${label}.${env.ZONE}`
  try {
    await ctx.dns.create('A', name, LOOPBACK_RECORD)
  } catch (error) {
    log(label, 'claim', `dns failed: ${error.message}`)
    return fail(502, 'could not write the name record')
  }
  const createdAt = new Date(ctx.now * 1000).toISOString()
  await env.LABELS.put(`label:${label}`, JSON.stringify({ account: who.account, pubkey, createdAt }))
  await env.LABELS.put(accountKey, JSON.stringify([...owned, label]))
  log(label, 'claim', 'created')
  return json(201, { label, zone: env.ZONE, name, record: LOOPBACK_RECORD })
}

// Checks the signature on a call to /v1/labels/:label/...; returns { entry, data } or a Response.
async function signedCall(request, env, ctx, label) {
  const headerLabel = request.headers.get('x-di-label')
  if (!isLabel(label)) return fail(400, 'not a label')
  if (headerLabel !== label) return fail(403, 'an install writes only under its own label')
  const entry = await readJson(env.LABELS, `label:${label}`)
  if (!entry) return fail(401, 'unknown label')

  const badKey = `n:${label}:bad:${bucket(ctx.now, HOUR)}`
  if (Number((await env.LABELS.get(badKey)) || 0) >= LIMITS.badSignaturesPerHour) {
    log(label, 'auth', 'blocked: bad signatures')
    return fail(429, 'too many bad signatures, try again in an hour')
  }

  const body = await readBody(request)
  if (body.tooLarge) return fail(413, 'body too large')
  const sig = request.headers.get('x-di-sig') || ''
  const result = await verifyRequest({
    pubkey: entry.pubkey,
    method: request.method,
    path: new URL(request.url).pathname,
    ts: request.headers.get('x-di-ts'),
    sig,
    body: body.text,
    nowSeconds: ctx.now
  })
  let reason = result.ok ? null : result.reason
  const seenKey = `seen:${label}:${sig}`
  if (!reason && (await env.LABELS.get(seenKey))) reason = 'replayed'
  if (reason) {
    await bump(env.LABELS, badKey, 2 * HOUR)
    log(label, `${request.method} ${new URL(request.url).pathname}`, `refused: ${reason}`)
    return fail(401, 'bad signature')
  }
  // A signature is good once; it stays remembered past the clock window.
  await env.LABELS.put(seenKey, '1', { expirationTtl: 4 * 120 })
  if (body.data === undefined) return fail(400, 'body must be JSON')
  return { entry, data: body.data }
}

async function underLimit(env, label, kind, size, max, now) {
  const key = `n:${label}:${kind}:${bucket(now, size)}`
  const used = Number((await env.LABELS.get(key)) || 0)
  if (used >= max) return false
  await env.LABELS.put(key, String(used + 1), { expirationTtl: 2 * size })
  return true
}

async function putTxt(request, env, ctx, label) {
  const checked = await signedCall(request, env, ctx, label)
  if (checked instanceof Response) return checked
  const { name, value } = checked.data || {}
  if (name !== '_acme-challenge') return fail(400, 'name must be "_acme-challenge"')
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(value)) return fail(400, 'value must be a base64url string')
  if (!(await underLimit(env, label, 'txt', WEEK, LIMITS.ordersPerWeek, ctx.now))) {
    log(label, 'txt put', 'limit: orders per week')
    return fail(429, `at most ${LIMITS.ordersPerWeek} certificate orders per label per week`)
  }
  try {
    await ctx.dns.create('TXT', `_acme-challenge.${label}.${env.ZONE}`, `"${value}"`)
  } catch (error) {
    log(label, 'txt put', `dns failed: ${error.message}`)
    return fail(502, 'could not write the challenge record')
  }
  log(label, 'txt put', 'ok')
  return json(204)
}

async function deleteTxt(request, env, ctx, label) {
  const checked = await signedCall(request, env, ctx, label)
  if (checked instanceof Response) return checked
  try {
    await ctx.dns.removeAll('TXT', `_acme-challenge.${label}.${env.ZONE}`)
  } catch (error) {
    log(label, 'txt delete', `dns failed: ${error.message}`)
    return fail(502, 'could not delete the challenge record')
  }
  log(label, 'txt delete', 'ok')
  return json(204)
}

async function putAddress(request, env, ctx, label) {
  const checked = await signedCall(request, env, ctx, label)
  if (checked instanceof Response) return checked
  const address = checked.data?.address
  const type = privateAddressType(address)
  if (!type) {
    log(label, 'address', 'refused: not private')
    return fail(400, 'address must be private')
  }
  if (!(await underLimit(env, label, 'addr', HOUR, LIMITS.addressesPerHour, ctx.now))) {
    log(label, 'address', 'limit: addresses per hour')
    return fail(429, `at most ${LIMITS.addressesPerHour} address changes per label per hour`)
  }
  const name = `${label}.${env.ZONE}`
  try {
    await ctx.dns.upsert(type, name, address)
    await ctx.dns.removeAll(type === 'A' ? 'AAAA' : 'A', name)
  } catch (error) {
    log(label, 'address', `dns failed: ${error.message}`)
    return fail(502, 'could not move the name record')
  }
  log(label, 'address', `ok ${type}`)
  return json(204)
}

function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i += 1) diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i)
  return diff === 0
}

async function revoke(request, env, ctx, label) {
  if (!sameSecret(request.headers.get('x-di-admin') || '', env.ADMIN_TOKEN)) {
    log(label, 'revoke', 'refused: not admin')
    return fail(401, 'admin token required')
  }
  if (!isLabel(label)) return fail(400, 'not a label')
  const entry = await readJson(env.LABELS, `label:${label}`)
  if (!entry) return fail(404, 'unknown label')
  const name = `${label}.${env.ZONE}`
  try {
    for (const type of ['A', 'AAAA']) await ctx.dns.removeAll(type, name)
    await ctx.dns.removeAll('TXT', `_acme-challenge.${name}`)
  } catch (error) {
    log(label, 'revoke', `dns failed: ${error.message}`)
    return fail(502, 'could not delete the records')
  }
  await env.LABELS.delete(`label:${label}`)
  const accountKey = `account:${entry.account}`
  const owned = ((await readJson(env.LABELS, accountKey)) || []).filter((l) => l !== label)
  if (owned.length) await env.LABELS.put(accountKey, JSON.stringify(owned))
  else await env.LABELS.delete(accountKey)
  log(label, 'revoke', 'ok')
  return json(204)
}

export async function handle(request, env, { fetchImpl = fetch } = {}) {
  const url = new URL(request.url)
  const ctx = {
    now: Math.floor(Date.now() / 1000),
    fetch: fetchImpl,
    dns: createDns({ token: env.CF_API_TOKEN, zoneId: env.CF_ZONE_ID, fetchImpl })
  }
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = request.method.toUpperCase()

  if (path === '/v1/health') {
    return method === 'GET' ? json(200, { ok: true, zone: env.ZONE, version: VERSION }) : fail(405, 'method not allowed')
  }
  if (path === '/v1/claim') return method === 'POST' ? claim(request, env, ctx) : fail(405, 'method not allowed')

  const m = /^\/v1\/labels\/([^/]+)(?:\/(txt|address))?$/.exec(path)
  if (m) {
    const [, label, what] = m
    if (!what && method === 'DELETE') return revoke(request, env, ctx, label)
    if (what === 'txt' && method === 'PUT') return putTxt(request, env, ctx, label)
    if (what === 'txt' && method === 'DELETE') return deleteTxt(request, env, ctx, label)
    if (what === 'address' && method === 'PUT') return putAddress(request, env, ctx, label)
    return fail(405, 'method not allowed')
  }
  return fail(404, 'not found')
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env)
    } catch (error) {
      log(null, 'error', error instanceof CloudflareError ? 'cloudflare' : 'internal')
      return fail(500, 'internal error')
    }
  }
}

export { RECORD_TTL }
