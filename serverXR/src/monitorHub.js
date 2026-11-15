// The owner's overview, assembled: what other machines reported, the tiers and
// spaces seen from here, the open asks, and the map that ties them together.
// monitorStore.js scans THIS machine; this file adds everything that arrives
// from outside or is derived from several sources, and shapes it as the contract
// in the overview spec (GET /api/monitor: reports, tiers, spaces, asks, map).
//
// Nothing here runs a command from a request. A report is data a machine sent:
// it is validated, size-capped and stored in memory for an hour; it is stale for
// display after 120 s. Asks the page sends live in the database (they must
// survive a restart); asks a machine reports (the ledger) live with its report.

const os = require('node:os')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')

const STALE_MS = 120 * 1000
const KEEP_MS = 60 * 60 * 1000
const REPORT_MAX_BYTES = 256 * 1024
const MAX_HOSTS = 40
const MAX_ASKS_PER_REPORT = 100
const ASK_TEXT_MAX = 2000
const ASK_PER_HOUR = 30
const ASKS_MAX = 100
const PANEL_NAMES = ['machines', 'network', 'agents', 'presence', 'connected', 'services', 'pullRequests', 'tasks', 'shows']
const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/
const COMMIT_RE = /^[0-9a-f]{7,40}$/

const TIER_SITES = Object.freeze({ dev: 'https://dev.diiii.xyz', prod: 'https://diiii.xyz' })
const TIER_CACHE_MS = 10 * 1000
const TIER_TIMEOUT_MS = 3000

// Plain text only, like agent mail: tab and newline stay, other control
// characters and bidi overrides go.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g
const cleanText = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').trim().slice(0, max)
const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/** 'dev' | 'prod' | 'local' from the release manifest (`staging` is the old name of dev). */
function tierOfDeployEnv(deployEnv) {
  const env = String(deployEnv || '').trim().toLowerCase()
  if (env === 'dev' || env === 'staging') return 'dev'
  if (env === 'production' || env === 'prod') return 'prod'
  return 'local'
}

// ---- reports from other machines -------------------------------------------

function createReportStore({ now = () => Date.now() } = {}) {
  const byHost = new Map()

  const prune = () => {
    const t = now()
    for (const [host, rec] of byHost) if (t - rec.reportedAt > KEEP_MS) byHost.delete(host)
  }

  /** Returns { ok: true } or { error, status }. */
  function put(body) {
    if (!isPlainObject(body)) return { error: 'bad_report', status: 400 }
    const host = typeof body.host === 'string' ? body.host.trim() : ''
    if (!HOST_RE.test(host)) return { error: 'bad_host', status: 400 }
    if (!isPlainObject(body.panels)) return { error: 'bad_panels', status: 400 }
    let size
    try { size = Buffer.byteLength(JSON.stringify(body)) } catch { return { error: 'bad_report', status: 400 } }
    if (size > REPORT_MAX_BYTES) return { error: 'too_large', status: 413, max: REPORT_MAX_BYTES }
    prune()
    if (!byHost.has(host) && byHost.size >= MAX_HOSTS) return { error: 'too_many_hosts', status: 429 }

    const panels = {}
    for (const name of PANEL_NAMES) {
      if (isPlainObject(body.panels[name])) panels[name] = body.panels[name]
    }
    const asks = (Array.isArray(body.asks) ? body.asks : [])
      .filter(isPlainObject)
      .slice(0, MAX_ASKS_PER_REPORT)
      .map((a) => ({
        id: cleanText(a.id, 40),
        state: cleanText(a.state, 20),
        touched: cleanText(a.touched, 40),
        text: cleanText(a.text, 400),
        source: 'ledger'
      }))
      .filter((a) => a.id && a.text)
    const commit = typeof body.commit === 'string' && COMMIT_RE.test(body.commit.trim()) ? body.commit.trim() : null
    const builtAt = typeof body.builtAt === 'string' && !Number.isNaN(Date.parse(body.builtAt)) ? new Date(body.builtAt).toISOString() : null
    byHost.set(host, { host, reportedAt: now(), panels, asks, commit, builtAt })
    return { ok: true, host }
  }

  /** The `reports` contract rows, newest first. Stale ones stay (flagged) until an hour passes. */
  function list() {
    prune()
    const t = now()
    return [...byHost.values()]
      .sort((a, b) => b.reportedAt - a.reportedAt)
      .map((r) => ({ host: r.host, reportedAt: new Date(r.reportedAt).toISOString(), stale: t - r.reportedAt > STALE_MS, panels: r.panels }))
  }

  const raw = () => { prune(); return [...byHost.values()] }
  const clear = () => byHost.clear()
  return { put, list, raw, clear }
}

// ---- asks sent from the page ------------------------------------------------

function createAskStore({ getDb, now = () => Date.now() }) {
  let ready = false
  const db = () => {
    const handle = getDb()
    if (!ready) {
      handle.exec(`CREATE TABLE IF NOT EXISTS monitor_asks (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL,
        touched_at INTEGER NOT NULL,
        by_user TEXT
      )`)
      ready = true
    }
    return handle
  }

  /** { id } or { error, status } */
  function add({ text, by = null }) {
    const body = cleanText(text, ASK_TEXT_MAX + 1)
    if (!body) return { error: 'empty', status: 400 }
    if (body.length > ASK_TEXT_MAX) return { error: 'too_long', status: 400, max: ASK_TEXT_MAX }
    const handle = db()
    const t = now()
    const recent = Number(handle.prepare('SELECT COUNT(*) AS n FROM monitor_asks WHERE created_at > ?').get(t - 3600 * 1000)?.n || 0)
    if (recent >= ASK_PER_HOUR) return { error: 'rate_limited', status: 429, retryAfterSeconds: 3600 }
    const id = `page-${crypto.randomUUID().slice(0, 8)}`
    handle.prepare('INSERT INTO monitor_asks (id, text, state, created_at, touched_at, by_user) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, body, 'open', t, t, by ? String(by).slice(0, 80) : null)
    return { id }
  }

  /** Open asks, newest first, in the contract's row shape. */
  function list() {
    return db().prepare("SELECT id, text, state, touched_at FROM monitor_asks WHERE state = 'open' ORDER BY created_at DESC LIMIT ?")
      .all(ASKS_MAX)
      .map((r) => ({ id: r.id, state: r.state, touched: new Date(Number(r.touched_at)).toISOString(), text: r.text, source: 'page' }))
  }
  return { add, list }
}

// ---- tiers, spaces, map -----------------------------------------------------

function runGit(args, { cwd, timeout = 3000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout, maxBuffer: 1024 * 1024 }, (error, stdout) => (error ? reject(error) : resolve(String(stdout))))
  })
}

function createHub({
  store,
  reports = createReportStore(),
  asks,
  releaseInfo = () => ({}),
  listSpaces = null,
  fetchImpl = (typeof fetch === 'function' ? fetch : null),
  git = runGit,
  repoDir = process.env.DI_REPO_DIR || process.cwd(),
  hostname = () => os.hostname(),
  now = () => Date.now(),
  tierSites = TIER_SITES
}) {
  const selfTier = () => tierOfDeployEnv(releaseInfo()?.deployEnv)
  const selfId = () => {
    const tier = selfTier()
    return tier === 'local' ? `local:${hostname()}` : tier
  }

  let tierCache = null
  async function probeTier(id, url) {
    const started = now()
    const base = { id, url, status: 0, ms: 0, commit: null, builtAt: null, behindDev: null }
    if (!fetchImpl) return base
    try {
      const res = await fetchImpl(`${url}/serverXR/api/health`, { signal: AbortSignal.timeout(TIER_TIMEOUT_MS), redirect: 'manual' })
      const body = res.ok ? await res.json().catch(() => null) : null
      const rel = body?.release || {}
      return {
        ...base,
        status: res.status,
        ms: now() - started,
        commit: typeof rel.gitCommit === 'string' && COMMIT_RE.test(rel.gitCommit) ? rel.gitCommit : null,
        builtAt: typeof rel.generatedAt === 'string' ? rel.generatedAt : null
      }
    } catch {
      return { ...base, ms: now() - started }
    }
  }

  async function behind(commit, devCommit) {
    if (!commit || !devCommit || !COMMIT_RE.test(commit) || !COMMIT_RE.test(devCommit)) return null
    if (commit === devCommit) return 0
    try {
      const out = await git(['rev-list', '--count', `${commit}..${devCommit}`], { cwd: repoDir })
      const n = Number.parseInt(String(out).trim(), 10)
      return Number.isFinite(n) ? n : null
    } catch {
      return null
    }
  }

  async function tiers() {
    const t = now()
    if (tierCache && t - tierCache.at < TIER_CACHE_MS && tierCache.self === selfId()) return tierCache.value
    const self = selfId()
    const rel = releaseInfo() || {}
    const rows = []
    for (const [id, url] of Object.entries(tierSites)) {
      if (id === self) {
        const commit = typeof rel.gitCommit === 'string' && COMMIT_RE.test(rel.gitCommit) ? rel.gitCommit : null
        rows.push({ id, url, status: 200, ms: 0, commit, builtAt: rel.generatedAt || null, behindDev: null })
      } else {
        rows.push(await probeTier(id, url))
      }
    }
    if (self.startsWith('local:')) {
      rows.push({ id: self, url: '', status: 200, ms: 0, commit: rel.gitCommit || null, builtAt: rel.generatedAt || null, behindDev: null })
    }
    for (const r of reports.raw()) {
      const id = `local:${r.host}`
      if (rows.some((x) => x.id === id)) continue
      rows.push({ id, url: '', status: now() - r.reportedAt > STALE_MS ? 0 : 200, ms: 0, commit: r.commit, builtAt: r.builtAt, behindDev: null })
    }
    const devCommit = rows.find((r) => r.id === 'dev')?.commit || null
    for (const row of rows) row.behindDev = row.id === 'dev' ? 0 : await behind(row.commit, devCommit)
    const value = { ok: rows.some((r) => r.id === 'dev' && r.status > 0 && r.status < 500) && rows.some((r) => r.id === 'prod' && r.status > 0 && r.status < 500), rows }
    tierCache = { at: t, value, self }
    return value
  }

  async function spaces() {
    const rows = []
    let ok = true
    const self = selfId()
    if (typeof listSpaces === 'function') {
      try {
        for (const s of await listSpaces()) {
          if (s.kind === 'sandbox') continue
          rows.push({ tier: self, slug: String(s.slug || s.id), visibility: s.isPublic ? 'public' : 'private' })
        }
      } catch { ok = false }
    } else ok = false
    // other tiers: only what a stranger can see (their public list, no login sent)
    for (const [id, url] of Object.entries(tierSites)) {
      if (id === self || !fetchImpl) continue
      try {
        const res = await fetchImpl(`${url}/serverXR/api/spaces`, { signal: AbortSignal.timeout(TIER_TIMEOUT_MS), redirect: 'manual' })
        if (!res.ok) { ok = false; continue }
        const body = await res.json()
        const list = Array.isArray(body) ? body : (Array.isArray(body?.spaces) ? body.spaces : [])
        for (const s of list) {
          if (s?.kind === 'sandbox' || !s?.isPublic) continue
          rows.push({ tier: id, slug: String(s.slug || s.id), visibility: 'public' })
        }
      } catch { ok = false }
    }
    return { ok, rows }
  }

  function asksBlock() {
    let page = []
    let ok = true
    try { page = asks ? asks.list() : [] } catch { ok = false }
    const ledger = reports.raw().flatMap((r) => r.asks).slice(0, ASKS_MAX)
    return { ok, rows: [...page, ...ledger] }
  }

  function buildMap({ base, reportRows, tierBlock, spaceBlock }) {
    const nodes = new Map()
    const edges = []
    const node = (id, kind, label, state) => { if (!nodes.has(id)) nodes.set(id, { id, kind, label: String(label).slice(0, 60), state }) }
    const edge = (from, to, kind) => { if (nodes.has(from) && nodes.has(to)) edges.push({ from, to, kind }) }
    const panelsState = (panels) => (Object.values(panels || {}).some((p) => p && p.ok === false) ? 'warn' : 'ok')

    const selfHost = base.host
    node(`machine:${selfHost}`, 'machine', selfHost, panelsState(base.panels))
    for (const r of reportRows) node(`machine:${r.host}`, 'machine', r.host, r.stale ? 'off' : panelsState(r.panels))
    node('repo:di.iiii', 'repo', 'di.iiii', 'ok')

    for (const row of tierBlock.rows) {
      const state = row.status === 0 ? 'off' : (row.status >= 500 ? 'warn' : ((row.behindDev || 0) > 0 ? 'warn' : 'ok'))
      node(`tier:${row.id}`, 'tier', row.id, state)
    }
    const self = selfId()
    if (nodes.has(`tier:${self}`)) edge(`machine:${selfHost}`, `tier:${self}`, 'runs')
    for (const r of reportRows) {
      edge(`machine:${r.host}`, `tier:local:${r.host}`, 'runs')
      edge('tier:dev', `machine:${r.host}`, 'serves')
    }

    for (const s of spaceBlock.rows.slice(0, 60)) {
      const id = `space:${s.tier}:${s.slug}`
      node(id, 'space', s.slug, 'ok')
      edge(`tier:${s.tier}`, id, 'holds')
    }

    const sources = [{ host: selfHost, panels: base.panels }, ...reportRows.map((r) => ({ host: r.host, panels: r.panels }))]
    let agentCount = 0
    for (const src of sources) {
      for (const show of (src.panels?.shows?.rows || []).slice(0, 12)) {
        const id = `show:${src.host}:${show.id}`
        node(id, 'show', show.title || show.id, show.ok === false ? 'warn' : 'ok')
        edge(id, `machine:${src.host}`, 'shows-on')
      }
      for (const agent of (src.panels?.agents?.rows || []).slice(0, 30)) {
        if (agentCount >= 40) break
        agentCount += 1
        const id = `agent:${src.host}:${String(agent.sessionId || agentCount).slice(0, 8)}`
        node(id, 'agent', agent.title || agent.sessionId, agent.status === 'busy' ? 'ok' : 'warn')
        edge(`machine:${src.host}`, id, 'runs')
        edge(id, 'repo:di.iiii', 'works-on')
      }
    }
    return { nodes: [...nodes.values()], edges }
  }

  /** The whole contract object for GET /api/monitor and the stream. */
  async function getSnapshot({ selfBase = null } = {}) {
    const base = await store.getMonitor({ selfBase })
    const [tierBlock, spaceBlock] = await Promise.all([tiers(), spaces()])
    const reportRows = reports.list()
    return {
      ...base,
      reports: reportRows,
      tiers: tierBlock,
      spaces: spaceBlock,
      asks: asksBlock(),
      map: buildMap({ base, reportRows, tierBlock, spaceBlock })
    }
  }

  return { getSnapshot, reports, asks, selfTier, selfId }
}

/** The stream compares snapshots without the fields that change on every scan. */
const IGNORED_KEYS = new Set(['generatedAt', 'ms'])
function fingerprint(snapshot) {
  return crypto.createHash('sha1').update(JSON.stringify(snapshot, (key, value) => (IGNORED_KEYS.has(key) ? undefined : value))).digest('hex')
}

module.exports = {
  STALE_MS,
  REPORT_MAX_BYTES,
  PANEL_NAMES,
  tierOfDeployEnv,
  createReportStore,
  createAskStore,
  createHub,
  fingerprint,
  cleanText
}
