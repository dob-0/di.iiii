// The account side of the local Monitor: when someone is signed in on this machine (`di login`),
// the Monitor also lists THEIR other machines, which report to the dev tier. Signed out, expired or
// offline: the Monitor shows this machine only and says why. The token is read from the user's own
// credentials file, sent only to the dev tier, and never returned, logged or stored.

const fs = require('fs')
const os = require('os')
const path = require('path')

const DEV_BASE = 'https://dev.diiii.xyz'
const CACHE_MS = 15000
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
    if (cache && cache.token === token && now() - cache.at < CACHE_MS) return cache.promise
    const promise = load(login)
    cache = { at: now(), token, promise }
    return promise
  }

  async function load(login) {
    if (!login) return { state: 'signed-out', reports: [] }
    const expires = expiryMs(login.expiresAt)
    if (expires && expires < now()) return { state: 'expired', reports: [] }
    if (!fetchImpl) return { state: 'offline', reports: [] }
    try {
      const res = await fetchImpl(`${base}/api/monitor/mine`, {
        headers: { Authorization: `Bearer ${login.token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      if (res.status === 401) return { state: 'expired', reports: [] }
      if (!res.ok) return { state: 'offline', reports: [] }
      const body = await res.json()
      const reports = (Array.isArray(body?.reports) ? body.reports : []).filter(sound).slice(0, 40)
      return { state: 'ok', name: typeof login.user?.name === 'string' ? login.user.name.slice(0, 60) : null, reports }
    } catch { return { state: 'offline', reports: [] } }
  }

  return { mine }
}

module.exports = { createAccountFeed, DEV_BASE }
