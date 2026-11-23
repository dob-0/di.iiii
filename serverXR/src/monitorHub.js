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
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFile } = require('node:child_process')
const PARTS = require('./parts.json').parts
const { sanitizeCredits } = require('./monitorCredits')
const { sanitizeChats, chatsBlock } = require('./monitorChats')
const { checkWithRetry, createProbeTracker } = require('./monitorProbe')

const STALE_MS = 120 * 1000
const KEEP_MS = 60 * 60 * 1000
const REPORT_MAX_BYTES = 256 * 1024
const MAX_HOSTS = 120
const MAX_HOSTS_PER_SUBJECT = 12
const MAX_OTHER_HOSTS = 80 // machines of senders without ledger rights (not the owner): the rest of MAX_HOSTS is kept for the owner
const MAX_ASKS_PER_REPORT = 100
const ASK_TEXT_MAX = 2000
const ASK_PER_HOUR = 30
const ASKS_MAX = 100
// live agents of the owner's OTHER machines shown in the Agents box: at most this many per machine and in all (a safety limit; the page says when it cuts)
const AGENTS_PER_MACHINE_MAX = 50
const AGENTS_MAX = 150
// the Claude homes named in the Agents box (the union over the machines in the list): a safety limit, a machine has 1 to 4
const ACCOUNTS_MAX = 20
// the map's safety limits: space names and agents drawn (the Spaces and Agents boxes list them all)
const MAP_SPACES_MAX = 80
const MAP_AGENTS_MAX = 40
const MAP_KIND_ORDER = ['machine', 'repo', 'tier', 'space', 'show', 'agent']
const PANEL_NAMES = ['machines', 'network', 'agents', 'presence', 'connected', 'services', 'spaces', 'pullRequests', 'tasks', 'shows', 'chats', 'credits']
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
// A machine is known by the first word of its name ("studio-mac.local" and "Studio-Mac.lan" are one machine); an IP address has no words to cut.
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/
const machineName = (host) => (IPV4_RE.test(host) ? host : host.split('.')[0])

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
    for (const [key, rec] of byHost) if (t - rec.reportedAt > KEEP_MS) byHost.delete(key)
  }

  /**
   * Returns { ok: true } or { error, status }. `subject` is who sent it: a machine is keyed by its
   * sender and name, so two people may each have an `aylmo`, and one subject holds at
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
    // a machine is keyed by who reported it AND its name: nobody can take another person's machine name
    const key = `${subject}\n${host}`
    const held = byHost.get(key)
    if (!held && byHost.size >= MAX_HOSTS) return { error: 'too_many_hosts', status: 429 }
    if (!held && !ledger && [...byHost.values()].filter((r) => !r.ledger).length >= MAX_OTHER_HOSTS) return { error: 'too_many_hosts', status: 429 }
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
        // `stale` stays (only that one word of its age): another machine must not be lent a list its own machine calls old
        panels.credits = { ok, configured: ok && Array.isArray(c.rows) ? 1 : 0, rows, ready: rows.filter((r) => r.available).length, total: rows.length, ...(ok && c.stale === true ? { stale: true } : {}), ...(!ok ? { error } : {}) }
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
    byHost.set(key, { host, subject, ledger: !!ledger, reportedAt: now(), panels, asks, commit, builtAt })
    return { ok: true, host }
  }

  /** The `reports` contract rows, newest first. Stale ones stay (flagged) until an hour passes.
   *  `subjects` keeps only the machines reported by those accounts (the dev tier lists nobody else's). */
  // `chats`: keep each machine's (already sanitised) chat panel; only the signed-in owner's own feed asks for it.
  function list({ subjects = null, chats = false } = {}) {
    prune()
    const t = now()
    return [...byHost.values()]
      .filter((r) => !subjects || subjects.map(String).includes(String(r.subject)))
      .sort((a, b) => b.reportedAt - a.reportedAt)
      .map((r) => ({ host: r.host, reportedAt: new Date(r.reportedAt).toISOString(), stale: t - r.reportedAt > STALE_MS, panels: chats ? r.panels : withoutChats(r.panels) }))
  }

  const raw = ({ subjects = null } = {}) => { prune(); return [...byHost.values()].filter((r) => !subjects || subjects.map(String).includes(String(r.subject))) }
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

// ---- last version seen working ------------------------------------------------
// "Proven" here means one thing: the part's live probe answered (live / ok) while the part ran this
// commit. Kept per part so that after an update that breaks it, the Monitor still names the last version
// that was seen working, and a rollback is one look. A part with no probe is never proven. With no file the
// store lives in memory only (tests, an install with no data dir).
const PROVEN_REFRESH_MS = 60 * 60 * 1000
function createProvenStore({ file = null, now = () => Date.now() } = {}) {
  let data = null
  const load = () => {
    if (data) return data
    data = {}
    if (!file) return data
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      for (const [id, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
        if (/^[a-z0-9-]{1,40}$/.test(id) && COMMIT_RE.test(String(v?.commit || '')) && Number.isFinite(v?.at)) {
          data[id] = { commit: v.commit, date: /^\d{4}-\d{2}-\d{2}$/.test(String(v.date || '')) ? v.date : null, at: v.at }
        }
      }
    } catch { /* no file yet, or unreadable: nothing proven so far */ }
    return data
  }
  const save = () => {
    if (!file) return
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const tmp = `${file}.${process.pid}.tmp`
      fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
      fs.renameSync(tmp, file)
    } catch { /* a read-only data dir must never break the Monitor */ }
  }
  return {
    get: (id) => load()[id] || null,
    /** The part answered while running `commit`: remember it (rewritten at most once an hour per commit). */
    see(id, commit, date) {
      if (!COMMIT_RE.test(String(commit || ''))) return
      const cur = load()[id]
      const t = now()
      if (cur && cur.commit === commit && t - cur.at < PROVEN_REFRESH_MS) return
      data[id] = { commit, date: date || null, at: t }
      save()
    }
  }
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
  provenFile = null,
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

  const proven = createProvenStore({ file: provenFile, now })
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
  async function tiers(subjects = null) {
    const t = now()
    if (tierCache && t - tierCache.at < TIER_CACHE_MS && tierCache.self === selfId()) return tierCache.value
    if (tiersInflight && tiersInflight.self === selfId()) return tiersInflight.promise
    const promise = tiersScan(subjects).finally(() => { tiersInflight = null })
    tiersInflight = { self: selfId(), promise }
    return promise
  }

  async function tiersScan(subjects = null) {
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
    for (const r of reports.raw({ subjects })) {
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
          if (s.kind === 'sandbox' || !(s.slug || s.id)) continue
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

  function asksBlock(subjects = null) {
    let page = []
    let ok = true
    try { page = asks ? asks.list() : [] } catch { ok = false }
    const ledger = reports.raw({ subjects }).flatMap((r) => r.asks).slice(0, ASKS_MAX)
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
      edge(`machine:${r.host}`, `tier:local:${r.host}`, 'runs')
      if (!self.startsWith('local:')) edge(`tier:${self}`, `machine:${r.host}`, 'serves')
    }

    // one node per space name, held by every tier that has it, in name order: the same picture whichever machine draws it
    // (11-24: each machine listed its own spaces first and the cut at 60 kept a different set)
    const holders = new Map()
    for (const s of spaceBlock.rows) {
      if (!holders.has(s.slug)) holders.set(s.slug, new Set())
      holders.get(s.slug).add(s.tier)
    }
    for (const slug of [...holders.keys()].sort().slice(0, MAP_SPACES_MAX)) {
      const id = `space:${slug}`
      node(id, 'space', slug, 'ok')
      for (const tier of [...holders.get(slug)].sort()) if (nodes.has(`tier:${tier}`)) edge(`tier:${tier}`, id, 'holds')
    }

    // machines in name order, each with at most its share of the agents: the viewer's own machine is not first
    const sources = [{ host: selfHost, panels: base.panels }, ...reportRows.map((r) => ({ host: r.host, panels: r.panels }))]
      .sort((a, b) => String(a.host).localeCompare(String(b.host)))
    const agentShare = Math.max(1, Math.floor(MAP_AGENTS_MAX / Math.max(1, sources.length)))
    let agentCount = 0
    for (const src of sources) {
      let mine = 0
      for (const [i, show] of (src.panels?.shows?.rows || []).slice(0, 12).entries()) {
        if (!isPlainObject(show)) continue
        const id = `show:${src.host}:${show.id ?? i}`
        node(id, 'show', show.title || show.id, show.ok === false ? 'warn' : 'ok')
        edge(id, `machine:${src.host}`, 'shows-on')
      }
      for (const agent of (src.panels?.agents?.rows || []).slice(0, 30)) {
        if (!isPlainObject(agent)) continue
        if (agentCount >= MAP_AGENTS_MAX || mine >= agentShare) break
        agentCount += 1
        mine += 1
        const id = `agent:${src.host}:${String(agent.sessionId || agentCount).slice(0, 8)}`
        node(id, 'agent', agent.title || agent.sessionId || `agent ${agentCount}`, agent.status === 'busy' ? 'ok' : 'warn')
        edge(`machine:${src.host}`, id, 'runs')
        edge(id, 'repo:di.iiii', 'works-on')
      }
    }
    // nodes and lines in one fixed order (kind, then name): the page lays them out in list order, and the machine it was
    // opened on must not come first (11-24: same 71 nodes on aylmo and studio-mac, drawn in different places)
    const kindRank = (k) => { const i = MAP_KIND_ORDER.indexOf(k); return i === -1 ? MAP_KIND_ORDER.length : i }
    const sortedNodes = [...nodes.values()].sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.id.localeCompare(b.id))
    const edgeKey = (e) => `${e.from}\n${e.to}\n${e.kind}`
    const sortedEdges = [...new Map(edges.map((e) => [edgeKey(e), e])).values()].sort((a, b) => edgeKey(a).localeCompare(edgeKey(b)))
    return { nodes: sortedNodes, edges: sortedEdges }
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
      // works: only a probe that answered AND shows it running counts; idle = answered, not started; unprobed and unread stay 'unknown'
      const works = state === 'off' ? 'not working' : (state === 'live' || state === 'ok') ? 'working' : state === 'idle' ? 'idle' : 'unknown'
      if (works === 'working' && stamp?.commit) proven.see(part.id, stamp.commit, stamp.date)
      return {
        id: part.id, name: part.name, state, detail, commit: stamp?.commit || null, date: stamp?.date || null,
        works, history: Array.isArray(stamp?.history) ? stamp.history : [], proven: proven.get(part.id)
      }
    })
    return { rows, version: rel.version || null, packedAt: rel.packedAt || null }
  }

  // Chats come through the same door as everything else: this machine's own chat panel (a feed in its
  // config) and the chat panel of every machine that reported. Nobody carrying chats is "no chat data".
  const chatsFor = (base, extra = [], subjects = null) => {
    const self = base.panels?.chats
    const inputs = []
    if (self && (self.source || self.ok === false)) inputs.push({ host: String(base.host || 'this machine').split('.')[0], source: self.source || null, error: self.ok === false ? (self.error || 'chat list not read') : null })
    for (const r of reports.raw({ subjects })) {
      const c = r.panels?.chats
      if (c) inputs.push({ host: r.host, source: c.source || null, error: c.error || null })
    }
    for (const r of extra) {
      const c = r.panels?.chats
      if (c) inputs.push({ host: r.host, source: c.source || null, error: c.error || null })
    }
    return chatsBlock(inputs, { now: now() })
  }

  // Credits belong to the account, not to one machine. A machine with no credits list of its own (no credits feed in
  // its monitor config) shows the freshest list another machine of the same owner reported, marked `from` (that
  // machine) and `reportedAt` (when it came in), so the page says whose list it is and how old. Nothing is read or
  // probed here: the list is the one the other machine already made (a probe is a real model call of about 113,000
  // tokens, so a probe per machine would cost every hour). A panel that is the machine's own is never covered: a list,
  // a failing check, a check still running, a feed that answered empty. Only a whole, fresh list is lent: a stale report
  // or one with no readable time, a stale, failing, still-checking or empty list, or rows that are not all objects (dev's
  // account rows are only checked to be objects) are skipped, so a bad row can never fail the snapshot. The page only:
  // the machine's own report to dev still carries its own panel, so a lent list is never reported back as its own.
  // Limit: the freshest report wins, so with two or more fit donors `from` (and the rows, if their lists differ) can
  // change from one scan to the next as their reports arrive; the meters in a list are as old as that machine's own read.
  const creditsFor = (base, sources) => {
    const mine = base.panels?.credits
    if (mine && !(mine.ok === true && !mine.configured && !mine.checking && !mine.rows?.length)) return mine
    const donor = sources
      .filter((r) => r && typeof r.host === 'string' && r.stale !== true && isPlainObject(r.panels?.credits))
      .map((r) => ({ host: r.host, reportedAt: r.reportedAt, at: typeof r.reportedAt === 'string' ? Date.parse(r.reportedAt) : NaN, c: r.panels.credits }))
      .filter(({ at, c }) => Number.isFinite(at) && c.ok === true && c.stale !== true && !c.checking && Array.isArray(c.rows) && c.rows.length > 0 && c.rows.every(isPlainObject))
      .sort((a, b) => b.at - a.at || b.c.rows.length - a.c.rows.length || a.host.localeCompare(b.host))[0]
    if (!donor) return mine
    const rows = donor.c.rows
    return { ...mine, ok: true, configured: 1, rows, ready: rows.filter((r) => r.available).length, total: rows.length, from: donor.host, reportedAt: donor.reportedAt }
  }

  // Agents belong to the owner, not to one machine. The Agents box and the "Agents at work" list show the live agents of this
  // machine AND of every other machine of the owner with a fresh report, read from the reports the hub already holds (nothing is
  // asked or probed here). Each row says where it runs (`machine`): a row another machine sent keeps the machine it names (a host
  // that machine reached by ssh), else it is the reporting machine; this machine's own rows are named too (always, not only
  // while another machine is listed: a name that came and went with the other machines would change the label of every agent of
  // this machine each time). `machines` says, for this machine
  // and every other one, whether its agents are in the list: a stale report or a failed or missing list is named, never shown as
  // zero (the page's change feed reads it: an agent starts or ends only if it is the same in both snapshots and no list is cut).
  // A machine with several reports (one machine under two spellings, or heard here and through dev) is shown by its best
  // one: a list beats a failed list, that a missing one, that a stale report; of two equal ones the newer wins. A session already
  // in the list (same sessionId) is listed once. This machine's own rows are never cut; of every other machine at most
  // AGENTS_PER_MACHINE_MAX are listed, and no more once the list holds AGENTS_MAX rows (this machine's counted): the machine says
  // so (`capped`). When this machine's own list cannot be read (its scan failed or took longer than the panel's time limit; a
  // machine with no Claude homes is not this case, its list is a list with no agents) it is named in `machines` with the reason,
  // its own rows are not trusted, and the other machines' agents are still listed; when no other machine has a list either, its
  // own panel is returned as it was. `from` (the credits note's field)
  // is never set. The page only: the machine's own report to dev carries its own panel (the sender reads the store, not this
  // snapshot), so a lent agent is never reported back as its own.
  const agentsFor = (base, sources) => {
    const mine = base.panels?.agents
    const selfHost = machineName(String(base.host || 'this machine'))
    const count = (n) => (Number.isFinite(n) && n > 0 ? n : 0)
    const names = (list) => (Array.isArray(list) ? list.filter((x) => typeof x === 'string').map((x) => cleanText(x, 80)).filter(Boolean) : [])
    // what a machine's agents list is: a list (ok), no list at all (none), or one that could not be read (failed, with the reason)
    const listOf = (a) => {
      if (!isPlainObject(a)) return { state: 'none' }
      if (a.ok !== true || !Array.isArray(a.rows)) return { state: 'failed', error: cleanText(a.ok === false ? a.error : 'the agents list was not a list', 200) }
      return { state: 'ok' }
    }
    const own = listOf(mine)
    const ownRows = own.state === 'ok' ? mine.rows.filter(isPlainObject).map((x) => (typeof x.machine === 'string' && x.machine ? x : { ...x, machine: selfHost })) : []
    const RANK = { ok: 0, failed: 1, none: 2, stale: 3 }
    const best = new Map() // first word of the name, lower case -> the report that tells most about that machine
    for (const r of sources) {
      if (!r || typeof r.host !== 'string') continue
      const host = machineName(r.host)
      if (!host || host.toLowerCase() === selfHost.toLowerCase()) continue
      const reportedAt = typeof r.reportedAt === 'string' ? r.reportedAt : null
      const a = r.panels?.agents
      const list = r.stale === true ? { state: 'stale' } : listOf(a)
      const found = { full: r.host, at: Number.isFinite(Date.parse(reportedAt)) ? Date.parse(reportedAt) : -Infinity, rows: [], accounts: [] }
      if (list.state === 'stale') found.info = { host, state: 'stale', reportedAt }
      else if (list.state === 'none') found.info = { host, state: 'none' }
      else if (list.state === 'failed') found.info = { host, state: 'failed', error: list.error }
      else {
        found.info = { host, state: 'ok', total: count(a.total) }
        found.rows = a.rows.filter((x) => isPlainObject(x) && typeof x.sessionId === 'string' && x.sessionId)
        found.accounts = names(a.accounts)
      }
      const had = best.get(host.toLowerCase())
      const better = !had || RANK[list.state] < RANK[had.info.state] || (RANK[list.state] === RANK[had.info.state] && (found.at > had.at || (found.at === had.at && found.full.localeCompare(had.full) < 0)))
      if (better) best.set(host.toLowerCase(), found)
    }
    const others = [...best.values()].sort((a, b) => a.info.host.localeCompare(b.info.host))
    // nothing to lend: this machine's own list could not be read and no other machine has one, so its panel stays as it was
    if (own.state !== 'ok' && !others.some(({ info }) => info.state === 'ok')) return mine
    const seen = new Set(ownRows.map((x) => x.sessionId))
    const lent = []
    for (const { info, rows } of others) {
      if (info.state !== 'ok') continue
      info.live = rows.length
      info.shown = 0
      for (const row of rows) {
        if (seen.has(row.sessionId)) continue
        if (info.shown >= AGENTS_PER_MACHINE_MAX || ownRows.length + lent.length >= AGENTS_MAX) { info.capped = true; continue }
        seen.add(row.sessionId)
        lent.push({ ...row, machine: typeof row.machine === 'string' && row.machine ? row.machine : info.host })
        info.shown += 1
      }
    }
    const rows = [...ownRows, ...lent]
    const accounts = [...new Set([...(own.state === 'ok' ? names(mine.accounts) : []), ...others.flatMap((o) => o.accounts || [])])].slice(0, ACCOUNTS_MAX)
    return {
      ...(own.state === 'ok' ? mine : { ok: true, ms: count(mine?.ms), at: Number.isFinite(mine?.at) ? mine.at : now(), remotes: [] }),
      rows,
      accounts,
      live: rows.length,
      busy: rows.filter((x) => x.status === 'busy').length,
      total: (own.state === 'ok' ? count(mine.total) : 0) + others.reduce((n, { info }) => n + (info.total || 0), 0),
      machines: [own.state === 'ok' ? { host: selfHost, state: 'ok', live: ownRows.length, self: true } : { host: selfHost, ...own, self: true }, ...others.map(({ info }) => info)]
    }
  }

  // Tasks and shows belong to the account, not to one machine: a feed that only one machine can read (the owner's ledger,
  // a show board, the brain) is shown on every machine's Monitor. The rows come from the shared picture dev already
  // builds (`shared.data.tasks` / `.shows`, newest report first, each row tagged with the machine that read it); nothing
  // is read or probed here. A row is lent only when it is whole and fresh: a plain object from another machine (never
  // this one, under any spelling), not stale, ok, with a text id and title and a list of text lines. This machine's own
  // rows always win: an id it has already is not lent again (so a per-machine feed such as the chat counts, which every
  // machine has under the same id, stays this machine's own), and of two machines with the same id the newest report wins.
  // Lent rows keep `machine`, so the page names where each was read; `lentFrom` lists those machines. The page only: the
  // machine's own report to dev carries its own panel, so a lent row is never reported back as its own.
  // Network probes and services are each machine's own, but the Monitor is the account's (owner 11-23: "it still not the same",
  // "make that be synced"): every machine shows the same list, its own rows first, then each other machine's from that
  // machine's fresh report (the reports the hub already holds, nothing probed here). Every row is tagged `machine` and gets an
  // `id` "<machine>/<probe id or unit>", so two machines' "dev" probe or "di-server.service" never collide. A stale report,
  // a failed panel or a row without its key is skipped; at most MACHINE_ROWS_MAX rows per other machine.
  const MACHINE_ROWS_MAX = 80
  const machineRowsFor = (base, sources, name, keyOf) => {
    const mine = base.panels?.[name]
    const self = machineName(String(base.host || os.hostname()))
    const selfKey = self.toLowerCase()
    const tag = (r, machine) => { const k = keyOf(r); return typeof k === 'string' && k ? { ...r, machine, id: `${machine}/${k}` } : null }
    const lent = []
    const from = []
    const seenHosts = new Set([selfKey])
    for (const src of sources) {
      if (!src || typeof src.host !== 'string' || src.stale === true) continue
      const host = machineName(src.host)
      if (seenHosts.has(host.toLowerCase())) continue
      const p = src.panels?.[name]
      if (!isPlainObject(p) || p.ok !== true || !Array.isArray(p.rows)) continue
      const rows = p.rows.filter(isPlainObject).map((r) => tag(r, host)).filter(Boolean).slice(0, MACHINE_ROWS_MAX)
      if (!rows.length) continue
      seenHosts.add(host.toLowerCase())
      from.push(host)
      lent.push(...rows)
    }
    if (!lent.length) return mine
    const ownOk = isPlainObject(mine) && mine.ok === true && Array.isArray(mine.rows)
    const own = ownOk ? mine.rows.filter(isPlainObject).map((r) => tag(r, self)).filter(Boolean) : []
    return { ...(isPlainObject(mine) ? mine : { ms: 0, at: now() }), ok: true, rows: [...own, ...lent], lentFrom: from.sort(), ...(ownOk ? {} : { ownError: (isPlainObject(mine) && mine.error) || 'not read on this machine' }) }
  }

  const FEED_LENT_MAX = 40
  const feedFor = (base, shared, name) => {
    const mine = base.panels?.[name]
    const list = shared?.data?.[name]
    if (!Array.isArray(list) || !list.length) return mine
    const selfHost = machineName(String(base.host || os.hostname())).toLowerCase()
    const ownRows = isPlainObject(mine) && Array.isArray(mine.rows) ? mine.rows : []
    const seen = new Set(ownRows.filter(isPlainObject).map((r) => r.id))
    const lent = []
    for (const r of list) {
      if (lent.length >= FEED_LENT_MAX) break
      if (!isPlainObject(r) || typeof r.machine !== 'string' || !r.machine) continue
      if (machineName(r.machine).toLowerCase() === selfHost) continue
      if (r.stale === true || r.ok !== true || typeof r.id !== 'string' || !r.id || typeof r.title !== 'string') continue
      if (!Array.isArray(r.lines) || !r.lines.every((l) => typeof l === 'string')) continue
      if (seen.has(r.id)) continue
      seen.add(r.id)
      lent.push({ ...r, machine: machineName(r.machine) })
    }
    if (!lent.length) return mine
    return {
      ...(isPlainObject(mine) ? mine : { ms: 0, at: now() }),
      ok: isPlainObject(mine) && typeof mine.ok === 'boolean' ? mine.ok : true,
      rows: [...ownRows, ...lent],
      lentFrom: [...new Set(lent.map((r) => r.machine))].sort()
    }
  }

  // a machine seen only through the account (it reports to dev, not here) is a tier row like a machine that reports here
  function tiersFor(tierBlock, machines) {
    const rows = [...tierBlock.rows]
    for (const m of machines) {
      const id = `local:${m.host}`
      if (rows.some((x) => x.id === id)) continue
      rows.push({ id, url: '', source: 'report', status: null, ms: null, state: m.stale ? 'warn' : 'ok', commit: m.commit || null, builtAt: m.builtAt || null, behindDev: null })
    }
    // dev and prod first, then every machine in name order: the Tiers box reads the same from any machine (11-24)
    const rank = (id) => (id === 'dev' ? 0 : id === 'prod' ? 1 : 2)
    rows.sort((a, b) => rank(a.id) - rank(b.id) || String(a.id).localeCompare(String(b.id)))
    return { ...tierBlock, rows }
  }

  // the other machines' own spaces as rows of their local tier; a machine's report without the panel adds nothing
  function spacesFor(spaceBlock, machines) {
    const rows = [...spaceBlock.rows]
    const seen = new Set(rows.map((r) => `${r.tier}\n${r.slug}`))
    const lentFrom = []
    for (const m of machines) {
      const p = m.panels?.spaces
      if (!isPlainObject(p) || p.ok === false || !Array.isArray(p.rows)) continue
      const tier = `local:${m.host}`
      for (const r of p.rows.filter(isPlainObject)) {
        const slug = typeof r.slug === 'string' ? r.slug.slice(0, 80) : ''
        if (!slug || seen.has(`${tier}\n${slug}`)) continue
        seen.add(`${tier}\n${slug}`)
        rows.push({ tier, slug, visibility: r.visibility === 'public' ? 'public' : 'private' })
      }
      lentFrom.push(m.host)
    }
    if (!lentFrom.length) return spaceBlock
    return { ...spaceBlock, rows, lentFrom: [...new Set(lentFrom)].sort() }
  }

  /** The whole contract object for GET /api/monitor and the stream. */
  // `subjects`: dev lists only the owners' machines. `account`: the local Monitor's signed-in extras
  // ({ state, name, reports } from monitorAccount.js): this account's other machines, marked via:'dev',
  // never replacing a machine this server already holds.
  async function getSnapshot({ selfBase = null, subjects = null, account = null, shared = null } = {}) {
    const base = await store.getMonitor({ selfBase })
    const [tierBlock, spaceBlock] = await Promise.all([tiers(subjects), spaces()])
    const own = reports.list({ subjects })
    const shortHost = (v) => String(v || '').split('.')[0]
    // never a second row for this machine itself (it may also report to dev), nor for a host the server already holds
    const held = new Set([...own.map((r) => r.host), shortHost(base.host), shortHost(os.hostname())])
    const extra = (account?.reports || [])
      .filter((r) => r && typeof r.host === 'string' && !held.has(r.host) && !held.has(shortHost(r.host)))
      .map((r) => ({ ...r, via: 'dev' }))
    const reportRows = [...own, ...extra.map(({ panels, ...r }) => ({ ...r, panels: withoutChats(panels) }))]
    // a new panels object only when something is lent (credits, agents): the store's own scan (cached, shared) is never written to
    const credits = creditsFor(base, [...own, ...extra])
    const agents = agentsFor(base, [...own, ...extra])
    // PRs: this machine's own list when it has one; else the shared one from dev (no GitHub login needed here)
    const sharedPrs = shared?.data?.pullRequests
    const prs = base.panels?.pullRequests?.ok !== true && sharedPrs?.ok === true
      ? { ok: true, ms: 0, at: Date.parse(sharedPrs.reportedAt) || now(), rows: sharedPrs.rows, open: Number.isInteger(sharedPrs.open) ? sharedPrs.open : sharedPrs.rows.length, drafts: Number.isInteger(sharedPrs.drafts) ? sharedPrs.drafts : sharedPrs.rows.filter((p) => p.draft).length, from: sharedPrs.from }
      : null
    const tasks = feedFor(base, shared, 'tasks')
    const shows = feedFor(base, shared, 'shows')
    const network = machineRowsFor(base, [...own, ...extra], 'network', (r) => r.id ?? r.target)
    const servicesAll = machineRowsFor(base, [...own, ...extra], 'services', (r) => r.unit)
    const services = servicesAll === base.panels?.services ? servicesAll
      : { ...servicesAll, running: servicesAll.rows.filter((r) => r.active === 'active').length, failed: servicesAll.rows.filter((r) => r.active === 'failed').length }
    // spaces: this machine's tiers plus each of the account's other machines' own spaces (its local tier), so the
    // Spaces box and the map are the same on every machine
    const spacesAll = spacesFor(spaceBlock, [...own, ...extra])
    // the account's other machines are tiers too (their own local di), as on dev: same tiers on every machine
    const tiersAll = tiersFor(tierBlock, extra)
    const lent = {
      ...(credits !== base.panels?.credits ? { credits } : {}),
      ...(agents !== base.panels?.agents ? { agents } : {}),
      ...(prs ? { pullRequests: prs } : {}),
      ...(tasks !== base.panels?.tasks ? { tasks } : {}),
      ...(shows !== base.panels?.shows ? { shows } : {}),
      ...(network !== base.panels?.network ? { network } : {}),
      ...(services !== base.panels?.services ? { services } : {})
    }
    return {
      ...base,
      ...(Object.keys(lent).length ? { panels: { ...base.panels, ...lent } } : {}),
      shared: shared ? { state: shared.state, at: shared.at || null, lastGoodAt: shared.lastGoodAt || null, data: shared.data || null } : null,
      account: account ? { state: account.state, name: account.name || null, machines: extra.length } : null,
      reports: reportRows,
      tiers: tiersAll,
      parts: partsBlock(base),
      chats: chatsFor(base, extra, subjects),
      spaces: spacesAll,
      asks: asksBlock(subjects),
      map: buildMap({ base, reportRows, tierBlock: tiersAll, spaceBlock: spacesAll })
    }
  }

  // The SHARED picture (dev tier only, built from the owners' machine reports): one answer for every machine's Monitor.
  // Machines with the version each reports, the freshest good pull request list, spaces, the owner's asks, and each machine's
  // tasks/shows feed lines tagged with the machine. Bounded; nothing is probed here. Chats and credits are NOT in it (personal).
  const SHARED_ROWS = 60
  // every open PR is sent on (gh lists up to 300); 40 cut the list (57 open, 11-23)
  const SHARED_PRS_MAX = 300
  const pickFeed = (raw, name) => {
    const rows = []
    for (const r of raw) {
      const p = r.panels?.[name]
      if (!isPlainObject(p) || p.ok === false || !Array.isArray(p.rows)) continue
      for (const x of p.rows.filter(isPlainObject)) rows.push({ machine: r.host, stale: now() - r.reportedAt > STALE_MS, ...x })
    }
    return rows.slice(0, SHARED_ROWS)
  }
  async function getShared({ subjects = null } = {}) {
    const [tierBlock, spaceBlock] = await Promise.all([tiers(subjects), spaces()])
    const raw = reports.raw({ subjects }).sort((a, b) => b.reportedAt - a.reportedAt)
    const t = now()
    const prSources = raw
      .map((r) => ({ host: r.host, at: r.reportedAt, p: r.panels?.pullRequests }))
      .filter(({ p }) => isPlainObject(p) && p.ok !== false && Array.isArray(p.rows))
    const pr = prSources[0] || null // newest report first, so the freshest list wins
    return {
      generatedAt: new Date(t).toISOString(),
      machines: raw.slice(0, SHARED_ROWS).map((r) => ({ host: r.host, reportedAt: new Date(r.reportedAt).toISOString(), stale: t - r.reportedAt > STALE_MS, commit: r.commit, builtAt: r.builtAt })),
      tiers: tierBlock.rows.slice(0, SHARED_ROWS).map((r) => ({ id: r.id, status: r.status, commit: r.commit, builtAt: r.builtAt, behindDev: r.behindDev ?? null, state: r.state || null })),
      pullRequests: pr ? { ok: true, from: pr.host, reportedAt: new Date(pr.at).toISOString(), rows: pr.p.rows.filter(isPlainObject).slice(0, SHARED_PRS_MAX), ...(Number.isInteger(pr.p.open) ? { open: pr.p.open } : {}), ...(Number.isInteger(pr.p.drafts) ? { drafts: pr.p.drafts } : {}) } : { ok: false, rows: [], error: 'no machine has sent a pull request list' },
      spaces: { ok: spaceBlock.ok, rows: spaceBlock.rows.slice(0, 200) },
      asks: asksBlock(subjects),
      shows: pickFeed(raw, 'shows'),
      tasks: pickFeed(raw, 'tasks')
    }
  }

  return { getSnapshot, getShared, reports, asks, selfTier, selfId }
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
  createProvenStore,
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
