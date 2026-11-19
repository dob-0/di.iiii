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
const PARTS = require('./parts.json').parts
const { sanitizeCredits } = require('./monitorCredits')
const { sanitizeChats, chatsBlock } = require('./monitorChats')
const { checkWithRetry, createProbeTracker } = require('./monitorProbe')

const STALE_MS = 120 * 1000
const KEEP_MS = 60 * 60 * 1000
const REPORT_MAX_BYTES = 256 * 1024
const MAX_HOSTS = 40
const MAX_HOSTS_PER_SUBJECT = 12
const MAX_ASKS_PER_REPORT = 100
const ASK_TEXT_MAX = 2000
const ASK_PER_HOUR = 30
const ASKS_MAX = 100
const PANEL_NAMES = ['machines', 'network', 'agents', 'presence', 'connected', 'services', 'pullRequests', 'tasks', 'shows', 'chats', 'credits']
const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/
const COMMIT_RE = /^[0-9a-f]{7,40}$/

const TIER_SITES = Object.freeze({ dev: 'https://dev.diiii.xyz', prod: 'https://diiii.xyz' })
const TIER_CACHE_MS = 10 * 1000
const SPACES_CACHE_MS = 10 * 1000
const TIER_TIMEOUT_MS = 3000

// Plain text only, like agent mail: tab and newline stay, other control
// characters and bidi overrides go.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F‪-‮⁦-⁩]/g
const cleanText = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').trim().slice(0, max)
const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)

/**
 * 'dev' | 'prod' | 'local' from the release manifest. Fails closed: only a missing or empty
 * deployEnv is a local machine; `staging` is the old name of dev; everything else
 * ('production', 'prod', 'standby' = what the Mac's prod tier writes, anything unknown) is prod.
 */
function tierOfDeployEnv(deployEnv) {
  const env = String(deployEnv ?? '').trim().toLowerCase()
  if (!env) return 'local'
  if (env === 'dev' || env === 'staging') return 'dev'
  return 'prod'
}

/** A panel value's `url` keeps only http(s); anything else drops the field. Strings are capped like cleanText. */
const PANEL_STRING_MAX = 400
const PANEL_DEPTH_MAX = 6
function cleanPanelValue(value, depth = 0, key = '') {
  if (typeof value === 'string') {
    const text = cleanText(value, PANEL_STRING_MAX)
    if (key === 'url') {
      try { return ['http:', 'https:'].includes(new URL(text).protocol) ? text : undefined } catch { return undefined }
    }
    return text
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (depth >= PANEL_DEPTH_MAX) return undefined
  if (Array.isArray(value)) return value.map((v) => cleanPanelValue(v, depth + 1, key)).filter((v) => v !== undefined)
  if (isPlainObject(value)) {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      const clean = cleanPanelValue(v, depth + 1, k)
      if (clean !== undefined) out[cleanText(k, 60)] = clean
    }
    return out
  }
  return undefined
}
const withoutChats = (panels) => { const { chats, ...rest } = panels || {}; return rest }
const isUp = (status) => status >= 200 && status < 300

// ---- reports from other machines -------------------------------------------

function createReportStore({ now = () => Date.now() } = {}) {
  const byHost = new Map()

  const prune = () => {
    const t = now()
    for (const [host, rec] of byHost) if (t - rec.reportedAt > KEEP_MS) byHost.delete(host)
  }

  /**
   * Returns { ok: true } or { error, status }. `subject` is who sent it: a host belongs to the
   * subject that reported it until it goes stale (409 for anyone else), and one subject holds at
   * most MAX_HOSTS_PER_SUBJECT hosts. `ledger` says the sender may bring ledger asks.
   */
  function put(body, { subject = null, ledger = false } = {}) {
    if (!isPlainObject(body)) return { error: 'bad_report', status: 400 }
    const host = typeof body.host === 'string' ? body.host.trim() : ''
    if (!HOST_RE.test(host)) return { error: 'bad_host', status: 400 }
    if (!isPlainObject(body.panels)) return { error: 'bad_panels', status: 400 }
    let size
    try { size = Buffer.byteLength(JSON.stringify(body)) } catch { return { error: 'bad_report', status: 400 } }
    if (size > REPORT_MAX_BYTES) return { error: 'too_large', status: 413, max: REPORT_MAX_BYTES }
    prune()
    const held = byHost.get(host)
    if (held && held.subject !== subject && now() - held.reportedAt <= STALE_MS) return { error: 'host_taken', status: 409 }
    if (!held && byHost.size >= MAX_HOSTS) return { error: 'too_many_hosts', status: 429 }
    if (!held && [...byHost.values()].filter((r) => r.subject === subject).length >= MAX_HOSTS_PER_SUBJECT) return { error: 'too_many_hosts', status: 429 }

    const panels = {}
    for (const name of PANEL_NAMES) {
      if (!isPlainObject(body.panels[name])) continue
      // chats: only what the page shows is kept (no owner text, no paths); see monitorChats.js
      if (name === 'chats') panels.chats = { source: sanitizeChats(body.panels.chats.source ?? body.panels.chats, host), ...(body.panels.chats.ok === false ? { error: cleanText(body.panels.chats.error, 200) || 'chat list not read' } : {}) }
      else if (name === 'credits') {
        // credits: only route, ready, meter, have, why are kept, an address becomes "login"; see monitorCredits.js
        const c = body.panels.credits
        let ok = c.ok !== false
        let error = ok ? '' : cleanText(c.error, 200)
        let rows = (ok && sanitizeCredits(c.rows)) || []
        // rows that are not a list, a row without a name, or "configured" without rows: a changed shape greys the panel, never a quiet 0/0
        if (ok && (rows.dropped || (c.rows !== undefined && !Array.isArray(c.rows)) || (c.configured && !Array.isArray(c.rows)))) { ok = false; error = 'the credits rows were not in the expected shape'; rows = [] }
        panels.credits = { ok, configured: ok && Array.isArray(c.rows) && c.configured ? 1 : 0, rows, ready: rows.filter((r) => r.available).length, total: rows.length, ...(!ok ? { error } : {}) }
      } else panels[name] = cleanPanelValue(body.panels[name])
    }
    const asks = (ledger && Array.isArray(body.asks) ? body.asks : [])
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
    byHost.set(host, { host, subject, reportedAt: now(), panels, asks, commit, builtAt })
    return { ok: true, host }
  }

  /** The `reports` contract rows, newest first. Stale ones stay (flagged) until an hour passes. */
  function list() {
    prune()
    const t = now()
    return [...byHost.values()]
      .sort((a, b) => b.reportedAt - a.reportedAt)
      .map((r) => ({ host: r.host, reportedAt: new Date(r.reportedAt).toISOString(), stale: t - r.reportedAt > STALE_MS, panels: withoutChats(r.panels) }))
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
    const who = by ? String(by).slice(0, 80) : null
    const recent = Number(handle.prepare('SELECT COUNT(*) AS n FROM monitor_asks WHERE created_at > ? AND by_user IS ?').get(t - 3600 * 1000, who)?.n || 0)
    if (recent >= ASK_PER_HOUR) return { error: 'rate_limited', status: 429, retryAfterSeconds: 3600 }
    const id = `page-${crypto.randomUUID().slice(0, 8)}`
    handle.prepare('INSERT INTO monitor_asks (id, text, state, created_at, touched_at, by_user) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, body, 'open', t, t, who)
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
  hostname = () => os.hostname().split('.')[0],
  now = () => Date.now(),
  tierSites = TIER_SITES
}) {
  const selfTier = () => tierOfDeployEnv(releaseInfo()?.deployEnv)
  const selfId = () => {
    const tier = selfTier()
    return tier === 'local' ? `local:${String(hostname()).split('.')[0]}` : tier
  }

  let tierCache = null
  const tracker = createProbeTracker({ now })
  // one check of one tier: the answer, how long it took, and whether it counts as up (2xx only)
  async function checkTier(url) {
    const started = now()
    try {
      const res = await fetchImpl(`${url}/serverXR/api/health`, { signal: AbortSignal.timeout(TIER_TIMEOUT_MS), redirect: 'manual' })
      const body = res.ok ? await res.json().catch(() => null) : null
      const rel = body?.release || {}
      return {
        ok: isUp(res.status),
        status: res.status,
        ms: now() - started,
        commit: typeof rel.gitCommit === 'string' && COMMIT_RE.test(rel.gitCommit) ? rel.gitCommit : null,
        builtAt: typeof rel.generatedAt === 'string' ? rel.generatedAt : null
      }
    } catch (error) {
      return { ok: false, status: 0, ms: now() - started, error: String(error?.message || error).slice(0, 120) }
    }
  }
  async function probeTier(id, url) {
    const base = { id, url, source: 'probe', status: 0, ms: 0, commit: null, builtAt: null, behindDev: null }
    if (!fetchImpl) return base
    const got = await checkWithRetry(() => checkTier(url))
    const judged = tracker.judge(id, got)
    if (got.ok) tierLastGood.set(id, { commit: got.commit, builtAt: got.builtAt })
    return {
      ...base,
      status: judged.status,
      rawStatus: judged.rawStatus,
      ms: got.ms,
      probe: judged.state,
      note: judged.note,
      misses: judged.misses,
      lastGoodAt: judged.lastGoodAt,
      ...(got.error ? { error: got.error } : {}),
      // a missed check keeps the last good answer's commit, so a flicker never blanks the tile
      commit: got.commit ?? (judged.state === 'doubt' ? tierLastGood.get(id)?.commit ?? null : null),
      builtAt: got.builtAt ?? (judged.state === 'doubt' ? tierLastGood.get(id)?.builtAt ?? null : null)
    }
  }
  const tierLastGood = new Map()

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

  // one probe round at a time: the GET and the SSE poller share the round in flight, so one
  // outage is never counted as two misses (same rule as monitorStore.getMonitor).
  let tiersInflight = null
  async function tiers() {
    const t = now()
    if (tierCache && t - tierCache.at < TIER_CACHE_MS && tierCache.self === selfId()) return tierCache.value
    if (tiersInflight && tiersInflight.self === selfId()) return tiersInflight.promise
    const promise = tiersScan().finally(() => { tiersInflight = null })
    tiersInflight = { self: selfId(), promise }
    return promise
  }

  async function tiersScan() {
    const t = now()
    const self = selfId()
    const rel = releaseInfo() || {}
    const rows = []
    const probed = await Promise.all(Object.entries(tierSites).map(async ([id, url]) => {
      if (id === self) {
        const commit = typeof rel.gitCommit === 'string' && COMMIT_RE.test(rel.gitCommit) ? rel.gitCommit : null
        return { id, url, source: 'self', status: 200, ms: 0, commit, builtAt: rel.generatedAt || null, behindDev: null }
      }
      return probeTier(id, url)
    }))
    rows.push(...probed)
    if (self.startsWith('local:')) {
      rows.push({ id: self, url: '', source: 'self', status: 200, ms: 0, commit: rel.gitCommit || null, builtAt: rel.generatedAt || null, behindDev: null })
    }
    for (const r of reports.raw()) {
      const id = `local:${r.host}`
      if (rows.some((x) => x.id === id)) continue
      // a machine that only REPORTS was never probed: no status, a state from how fresh its report is
      rows.push({ id, url: '', source: 'report', status: null, ms: null, state: now() - r.reportedAt > STALE_MS ? 'warn' : 'ok', commit: r.commit, builtAt: r.builtAt, behindDev: null })
    }
    const devCommit = rows.find((r) => r.id === 'dev')?.commit || null
    for (const row of rows) row.behindDev = row.id === 'dev' ? 0 : await behind(row.commit, devCommit)
    const value = { at: t, ok: rows.some((r) => r.id === 'dev' && isUp(r.status)) && rows.some((r) => r.id === 'prod' && isUp(r.status)), rows }
    tierCache = { at: t, value, self }
    return value
  }

  let spaceCache = null
  async function spaces() {
    const t = now()
    const self = selfId()
    if (spaceCache && t - spaceCache.at < SPACES_CACHE_MS && spaceCache.self === self) return spaceCache.value
    const value = await readSpaces()
    spaceCache = { at: t, value, self }
    return value
  }

  async function readSpaces() {
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
    // a label is never "undefined": the given text, else the id's last part, else the kind
    const node = (id, kind, label, state) => {
      if (nodes.has(id)) return
      const given = label === undefined || label === null ? '' : String(label).trim()
      const text = (given && given !== 'undefined' && given !== 'null') ? given : (String(id).split(':').pop() || kind)
      nodes.set(id, { id, kind, label: text.slice(0, 60), state })
    }
    const edge = (from, to, kind) => { if (nodes.has(from) && nodes.has(to)) edges.push({ from, to, kind }) }
    const panelsState = (panels) => (Object.values(panels || {}).some((p) => p && p.ok === false) ? 'warn' : 'ok')

    const selfHost = String(base.host || 'this machine').split('.')[0]
    node(`machine:${selfHost}`, 'machine', selfHost, panelsState(base.panels))
    for (const r of reportRows) node(`machine:${r.host}`, 'machine', r.host, r.stale ? 'off' : panelsState(r.panels))
    // every device on the tailnet is on the map, not only the ones that report (a laptop that never ran
    // `di monitor report` would otherwise be missing): online = ok, offline = off. A reporting host keeps its own node.
    for (const m of (base.panels?.machines?.ok ? base.panels.machines.rows || [] : []).slice(0, 60)) {
      const name = String(m?.name || '').split('.')[0].trim()
      // the same device under another letter case is the one node already there, not a second one
      const known = [...nodes.keys()].some((k) => k.startsWith('machine:') && k.slice(8).toLowerCase() === name.toLowerCase())
      if (name && !known) node(`machine:${name}`, 'machine', name, m.online ? 'ok' : 'off')
    }
    node('repo:di.iiii', 'repo', 'di.iiii', 'ok')

    for (const row of tierBlock.rows) {
      const state = row.source === 'report' ? row.state : row.status === 0 ? 'off' : (!isUp(row.status) || row.probe === 'slow' || row.probe === 'doubt' ? 'warn' : ((row.behindDev || 0) > 0 ? 'warn' : 'ok'))
      node(`tier:${row.id}`, 'tier', row.id, state)
    }
    const self = selfId()
    if (nodes.has(`tier:${self}`)) edge(`machine:${selfHost}`, `tier:${self}`, 'runs')
    // a report reached THIS tier, so this is the tier that machine follows; a local build is nobody's tier
    for (const r of reportRows) {
      edge(`machine:${r.host}`, `tier:local:${r.host}`, 'reports')
      if (!self.startsWith('local:')) edge(`tier:${self}`, `machine:${r.host}`, 'serves')
    }

    for (const s of spaceBlock.rows.slice(0, 60)) {
      const id = `space:${s.tier}:${s.slug}`
      node(id, 'space', s.slug, 'ok')
      edge(`tier:${s.tier}`, id, 'holds')
    }

    const sources = [{ host: selfHost, panels: base.panels }, ...reportRows.map((r) => ({ host: r.host, panels: r.panels }))]
    let agentCount = 0
    for (const src of sources) {
      for (const [i, show] of (src.panels?.shows?.rows || []).slice(0, 12).entries()) {
        if (!isPlainObject(show)) continue
        const id = `show:${src.host}:${show.id ?? i}`
        node(id, 'show', show.title || show.id, show.ok === false ? 'warn' : 'ok')
        edge(id, `machine:${src.host}`, 'shows-on')
      }
      for (const agent of (src.panels?.agents?.rows || []).slice(0, 30)) {
        if (!isPlainObject(agent)) continue
        if (agentCount >= 40) break
        agentCount += 1
        const id = `agent:${src.host}:${String(agent.sessionId || agentCount).slice(0, 8)}`
        node(id, 'agent', agent.title || agent.sessionId || `agent ${agentCount}`, agent.status === 'busy' ? 'ok' : 'warn')
        edge(`machine:${src.host}`, id, 'runs')
        edge(id, 'repo:di.iiii', 'works-on')
      }
    }
    return { nodes: [...nodes.values()], edges }
  }

  // One row per part (serverXR/src/parts.json): live state from the rows the Connected panel already read
  // (no extra probe per viewer) and the version stamped at pack time. A part with no probe says so; it is
  // never shown as healthy. `packedAt` rides with every version: the stamp is the PACK, not the running code.
  const partsBlock = (base) => {
    const rel = releaseInfo() || {}
    const stamps = new Map((Array.isArray(rel.parts) ? rel.parts : []).map((x) => [x.id, x]))
    const connectedRows = base.panels?.connected?.ok ? (base.panels.connected.rows || []) : null
    const rows = PARTS.map((part) => {
      let state = 'unprobed'
      let detail = 'no live probe'
      if (part.probe) {
        const wanted = new Set(part.rows || [part.id])
        const mine = connectedRows ? connectedRows.filter((r) => wanted.has(r.id)) : []
        // a Connected panel that failed or lacks the row is UNKNOWN, not a part that is down
        if (!mine.length) { state = 'unknown'; detail = 'not read' } else {
          state = mine.some((r) => r.state === 'off') ? 'off' : mine.some((r) => r.state === 'live') ? 'live' : mine.some((r) => r.state === 'ok') ? 'ok' : 'idle'
          detail = mine.map((r) => r.detail).filter(Boolean).join(' · ')
        }
      }
      const stamp = stamps.get(part.id)
      return { id: part.id, name: part.name, state, detail, commit: stamp?.commit || null, date: stamp?.date || null }
    })
    return { rows, version: rel.version || null, packedAt: rel.packedAt || null }
  }

  // Chats come through the same door as everything else: this machine's own chat panel (a feed in its
  // config) and the chat panel of every machine that reported. Nobody carrying chats is "no chat data".
  const chatsFor = (base) => {
    const self = base.panels?.chats
    const inputs = []
    if (self && (self.source || self.ok === false)) inputs.push({ host: String(base.host || 'this machine').split('.')[0], source: self.source || null, error: self.ok === false ? (self.error || 'chat list not read') : null })
    for (const r of reports.raw()) {
      const c = r.panels?.chats
      if (c) inputs.push({ host: r.host, source: c.source || null, error: c.error || null })
    }
    return chatsBlock(inputs, { now: now() })
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
      parts: partsBlock(base),
      chats: chatsFor(base),
      spaces: spaceBlock,
      asks: asksBlock(),
      map: buildMap({ base, reportRows, tierBlock, spaceBlock })
    }
  }

  return { getSnapshot, reports, asks, selfTier, selfId }
}

/** The stream compares snapshots without the fields that change on every scan. */
const IGNORED_KEYS = new Set(['generatedAt', 'ms', 'heardSecondsAgo', 'ages'])
// `at` is a scan clock only where the scanners stamp it: the snapshot's own sections (tiers.at, spaces.at,
// ...) and each panel (panels.<name>.at). Anywhere deeper (a report, an ask, a row) it is data and counts.
const isScanStamp = (path) => path.length === 2 || (path.length === 3 && path[0] === 'panels')
function stripNoise(value, path = []) {
  if (Array.isArray(value)) return value.map((item, i) => stripNoise(item, [...path, String(i)]))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, v] of Object.entries(value)) {
      if (IGNORED_KEYS.has(key)) continue
      if (key === 'at' && isScanStamp([...path, key])) continue
      out[key] = stripNoise(v, [...path, key])
    }
    return out
  }
  return value
}
function fingerprint(snapshot) {
  return crypto.createHash('sha1').update(JSON.stringify(stripNoise(snapshot))).digest('hex')
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
  cleanText,
  cleanPanelValue,
  MAX_HOSTS_PER_SUBJECT
}
