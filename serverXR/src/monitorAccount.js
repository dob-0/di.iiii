// The account side of the local Monitor: when someone is signed in on this machine (`di login`),
// the Monitor also lists THEIR other machines, which report to the dev tier. Signed out, expired or
// offline: the Monitor shows this machine only and says why. The token is read from the user's own
// credentials file, sent only to the dev tier, and never returned, logged or stored.

const fs = require('fs')
const os = require('os')
const path = require('path')

const DEV_BASE = 'https://dev.diiii.xyz/serverXR'
// the base `di login` stored for the dev tier; the token goes only to the dev host, never to a base named elsewhere
const devBase = (value) => {
  try {
    const u = new URL(value)
    return u.protocol === 'https:' && u.host === 'dev.diiii.xyz' ? u.origin + u.pathname.replace(/\/+$/, '') : null
  } catch { return null }
}
const CACHE_MS = 15000
const CACHE_BAD_MS = 10000 // a refusal or outage is asked again after 10 s, so a slow dev never slows every tick
const STALE_MS = 120000
const TIMEOUT_MS = 4000

const expiryMs = (value) => {
  let n = Number(value)
  if (typeof value === 'string' && !Number.isFinite(n)) n = Date.parse(value) / 1000
  if (!Number.isFinite(n) || n <= 0) return null
  return n < 1e11 ? n * 1000 : n
}

// a row from dev is shown only when it has the shape this page reads: a plain host name and a panels object of sane size
const HOST_RE = /^[A-Za-z0-9._-]{1,64}$/
const sound = (r) => {
  if (!r || typeof r !== 'object' || typeof r.host !== 'string' || !HOST_RE.test(r.host)) return false
  if (!r.panels || typeof r.panels !== 'object' || Array.isArray(r.panels)) return false
  try { return JSON.stringify(r).length <= 256 * 1024 } catch { return false }
}

// rebuilt from an allowlist: nothing else from dev reaches the page, and `stale` is worked out here, not taken on trust
const row = (r) => {
  const at = Date.parse(r.reportedAt)
  return { host: r.host, reportedAt: Number.isFinite(at) ? new Date(at).toISOString() : null, stale: !Number.isFinite(at) || Date.now() - at > STALE_MS, panels: r.panels }
}

// the shared picture is kept only in the shape the page reads: known keys, arrays of plain objects, a size limit
const LISTS = ['machines', 'tiers', 'shows', 'tasks']
const plain = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const bounded = (d) => {
  try { if (JSON.stringify(d).length > 512 * 1024) return null } catch { return null }
  const out = { generatedAt: typeof d.generatedAt === 'string' ? d.generatedAt.slice(0, 40) : null }
  for (const k of LISTS) out[k] = (Array.isArray(d[k]) ? d[k] : []).filter(plain).slice(0, 60)
  const prs = plain(d.pullRequests) ? d.pullRequests : {}
  out.pullRequests = { ok: prs.ok === true, from: typeof prs.from === 'string' ? prs.from.slice(0, 64) : null, reportedAt: typeof prs.reportedAt === 'string' ? prs.reportedAt.slice(0, 40) : null, rows: (Array.isArray(prs.rows) ? prs.rows : []).filter(plain).slice(0, 300), ...(Number.isInteger(prs.open) && prs.open >= 0 ? { open: prs.open } : {}), ...(Number.isInteger(prs.drafts) && prs.drafts >= 0 ? { drafts: prs.drafts } : {}), ...(typeof prs.error === 'string' ? { error: prs.error.slice(0, 200) } : {}) }
  for (const k of ['spaces', 'asks']) { const b = plain(d[k]) ? d[k] : {}; out[k] = { ok: b.ok !== false, rows: (Array.isArray(b.rows) ? b.rows : []).filter(plain).slice(0, 200) } }
  return out
}

function createAccountFeed({ home = os.homedir(), fetchImpl = globalThis.fetch, now = () => Date.now(), base = DEV_BASE } = {}) {
  let cache = null // { at, token, promise }

  const readLogin = () => {
    try {
      const store = JSON.parse(fs.readFileSync(path.join(home, '.config', 'di', 'credentials.json'), 'utf8'))
      const entry = store && typeof store === 'object' && Object.hasOwn(store, 'dev') ? store.dev : null
      return entry && typeof entry.token === 'string' && entry.token ? entry : null
    } catch { return null }
  }

  /** { state: 'signed-out'|'expired'|'offline'|'ok', name?, reports: [] } — never throws. */
  async function mine() {
    const login = readLogin()
    const token = login?.token || ''
    // one answer per login: a new sign-in, another person or a sign-out is seen at once; calls in flight share one request
    if (cache && cache.token === token && now() - cache.at < cache.ttl) return cache.promise
    const promise = load(login)
    const entry = { at: now(), token, ttl: CACHE_BAD_MS, promise }
    cache = entry
    promise.then((v) => { if (v.state === 'ok') entry.ttl = CACHE_MS })
    return promise
  }

  async function load(login) {
    if (!login) return { state: 'signed-out', reports: [] }
    // the stored expiry is only a hint (the server rolls a session forward on use): dev decides, a 401 is "ended"
    if (!fetchImpl) return { state: 'offline', reports: [] }
    try {
      const res = await fetchImpl(`${devBase(login.base) || base}/api/monitor/mine`, {
        headers: { Authorization: `Bearer ${login.token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      if (res.status === 401) return { state: 'expired', reports: [] }
      if (!res.ok) return { state: 'offline', reports: [] }
      const body = await res.json()
      const reports = (Array.isArray(body?.reports) ? body.reports : []).filter(sound).slice(0, 40).map(row)
      return { state: 'ok', name: typeof login.user?.name === 'string' ? login.user.name.slice(0, 60) : null, reports }
    } catch { return { state: 'offline', reports: [] } }
  }

  // The SHARED picture from dev (GET /api/monitor/shared, owner's terminal login only). Same login, same cache rules as mine().
  // States: ok, signed-out, expired, offline (dev not answering), refused (this account is not the owner: dev answers 404).
  // After a failure the last good answer is kept (with when it was read) so the page can show it, marked old.
  let sharedCache = null
  let lastGood = null // { at, data }
  async function shared() {
    const login = readLogin()
    const token = login?.token || ''
    if (sharedCache && sharedCache.token === token && now() - sharedCache.at < sharedCache.ttl) return sharedCache.promise
    if (lastGood && lastGood.token !== token) lastGood = null // another person: never their predecessor's picture
    const promise = loadShared(login)
    const entry = { at: now(), token, ttl: CACHE_BAD_MS, promise }
    sharedCache = entry
    promise.then((v) => { if (v.state === 'ok') entry.ttl = CACHE_MS })
    return promise
  }
  async function loadShared(login) {
    const keep = (state) => ({ state, data: lastGood?.data || null, lastGoodAt: lastGood ? new Date(lastGood.at).toISOString() : null })
    if (!login) return keep('signed-out')
    if (!fetchImpl) return keep('offline')
    try {
      const res = await fetchImpl(`${devBase(login.base) || base}/api/monitor/shared`, {
        headers: { Authorization: `Bearer ${login.token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      if (res.status === 401) return keep('expired')
      if (res.status === 404 || res.status === 403) return keep('refused')
      if (!res.ok) return keep('offline')
      const body = await res.json()
      if (!body || body.ok !== true || !body.shared || typeof body.shared !== 'object') return keep('offline')
      const data = bounded(body.shared)
      if (!data) return keep('offline')
      lastGood = { at: now(), token: login.token, data }
      return { state: 'ok', at: new Date(lastGood.at).toISOString(), lastGoodAt: new Date(lastGood.at).toISOString(), data }
    } catch { return keep('offline') }
  }

  return { mine, shared }
}

module.exports = { createAccountFeed, DEV_BASE }
