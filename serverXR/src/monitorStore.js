// One snapshot of everything the operator runs, for Preferences → Monitor:
// machines (tailnet), network probes, agent sessions (every Claude login on
// this machine), running services, open pull requests, and operator-defined
// feeds (tasks, shows) read from ~/.di/monitor.json.
//
// Read-only. Every panel is collected on its own with its own timeout, so a
// dead tailnet or a missing `gh` greys one panel instead of the whole page.
// The commands that run come ONLY from the operator's config file, never from
// a request. Served by monitorRoutes under the same loopback + admin guard as
// the agent board, because it lists machines and session titles.

const fs = require('node:fs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { createAgentBoardStore } = require('./agentBoardStore')
const socketHandlers = require('./socketHandlers')

const CACHE_TTL_MS = 5000
const PANEL_TIMEOUT_MS = 4000
const FEED_MAX_LINES = 60
const LINE_MAX_CHARS = 200

const DEFAULT_PROBES = [
  { name: 'dev tier', url: 'https://dev.diiii.xyz' },
  { name: 'prod tier', url: 'https://diiii.xyz' }
]

function run(command, args, { timeout = PANEL_TIMEOUT_MS, cwd } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, cwd, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error)
      else resolve(String(stdout))
    })
  })
}

const clip = (line) => (line.length > LINE_MAX_CHARS ? `${line.slice(0, LINE_MAX_CHARS - 1)}…` : line)
const toLines = (text) => String(text).split('\n').map((l) => l.trimEnd()).filter(Boolean).slice(0, FEED_MAX_LINES).map(clip)

async function withTimeout(promise, ms) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms) })
    ])
  } finally {
    clearTimeout(timer)
  }
}

function readConfig(configPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

// Every ~/.claude* directory that has a projects/ folder is one login on this
// machine (main login, a second account, a test config). Deduped by name.
function findClaudeHomes(home) {
  let names
  try { names = fs.readdirSync(home) } catch { return [] }
  return names
    .filter((n) => n === '.claude' || n.startsWith('.claude-'))
    .map((n) => path.join(home, n))
    .filter((dir) => {
      try { return fs.statSync(path.join(dir, 'projects')).isDirectory() } catch { return false }
    })
}

function createMonitorStore({
  home = os.homedir(),
  configPath = process.env.DI_MONITOR_CONFIG || path.join(home, '.di', 'monitor.json'),
  runCommand = run,
  fetchImpl = (typeof fetch === 'function' ? fetch : null),
  repoDir = process.env.DI_REPO_DIR || process.cwd(),
  // who is connected right now: the realtime hub's own maps (space/project id -> socket id -> person)
  connections = { spaces: socketHandlers.spaceConnections, projects: socketHandlers.projectConnections },
  now = () => Date.now()
} = {}) {
  const boardStores = new Map()
  let cache = null

  async function machines() {
    const raw = JSON.parse(await runCommand('tailscale', ['status', '--json']))
    // two machines can carry the same host name (a laptop and its Windows twin),
    // so the row id is the tailnet address, which is unique.
    const toRow = (p, self) => ({
      id: (p.TailscaleIPs || [])[0] || p.ID || p.HostName || 'unknown',
      name: p.HostName || p.DNSName || 'unknown',
      os: p.OS || '',
      ip: (p.TailscaleIPs || [])[0] || '',
      online: self ? true : Boolean(p.Online),
      lastSeen: p.LastSeen && !p.LastSeen.startsWith('0001') ? p.LastSeen : null,
      tx: p.TxBytes || 0,
      rx: p.RxBytes || 0,
      self
    })
    const rows = [toRow(raw.Self || {}, true), ...Object.values(raw.Peer || {}).map((p) => toRow(p, false))]
    return { rows, online: rows.filter((r) => r.online).length, total: rows.length }
  }

  async function network(config) {
    const probes = Array.isArray(config.probes) && config.probes.length ? config.probes : DEFAULT_PROBES
    if (!fetchImpl) throw new Error('no fetch available')
    const rows = await Promise.all(probes.slice(0, 12).map(async (probe) => {
      const started = now()
      try {
        const res = await fetchImpl(probe.url, { method: 'GET', signal: AbortSignal.timeout(3000), redirect: 'manual' })
        return { id: probe.url, name: probe.name || probe.url, url: probe.url, status: res.status, ms: now() - started, ok: res.status < 500 }
      } catch (error) {
        return { id: probe.url, name: probe.name || probe.url, url: probe.url, status: 0, ms: now() - started, ok: false, error: String(error.message || error) }
      }
    }))
    return { rows, up: rows.filter((r) => r.ok).length, total: rows.length }
  }

  async function agents() {
    const homes = findClaudeHomes(home)
    const live = []
    let total = 0
    // two login dirs can share one projects/ folder through a symlink: count
    // its sessions once, but keep each dir's own live records (its sessions/).
    const countedProjects = new Set()
    for (const dir of homes) {
      if (!boardStores.has(dir)) boardStores.set(dir, createAgentBoardStore({ claudeHome: dir }))
      const account = path.basename(dir)
      const board = await boardStores.get(dir).getBoard()
      const projectsReal = fs.realpathSync(path.join(dir, 'projects'))
      if (!countedProjects.has(projectsReal)) {
        countedProjects.add(projectsReal)
        total += board.totalSessions || 0
      }
      for (const s of board.sessions || []) {
        if (!s.live) continue
        live.push({
          account,
          sessionId: s.sessionId,
          title: s.title || s.sessionId.slice(0, 8),
          status: s.live.status || 'live',
          kind: s.live.kind || 'interactive',
          branch: s.branch || null,
          cwd: s.worktreePath || s.cwd || null,
          model: s.model || null,
          lastActivity: s.lastActivity || null
        })
      }
    }
    const seen = new Set()
    const rows = live.filter((r) => (seen.has(r.sessionId) ? false : seen.add(r.sessionId)))
    return {
      rows,
      live: rows.length,
      busy: rows.filter((r) => r.status === 'busy').length,
      total,
      accounts: homes.map((d) => path.basename(d))
    }
  }

  // People connected right now, from the realtime hub's own maps. Names are
  // what each browser says about itself (an artist in a space, a guest on a
  // public page); the account behind a name is never shown here.
  async function presence() {
    const rows = []
    for (const [kind, map] of [['space', connections.spaces], ['project', connections.projects]]) {
      for (const [id, members] of map || []) {
        const people = [...members.values()].map((m) => ({
          name: String(m.userName || m.userId || 'guest').slice(0, 60),
          since: m.joinedAt ? new Date(m.joinedAt).toISOString() : null
        }))
        if (people.length) rows.push({ id: `${kind}:${id}`, kind, target: id, people })
      }
    }
    rows.sort((a, b) => b.people.length - a.people.length)
    return { rows, people: rows.reduce((n, r) => n + r.people.length, 0), places: rows.length }
  }

  // The things di.iiii itself drives or listens to, read from this server's own
  // status routes (loopback, same machine). A thing that is not there is
  // "off", not an error: a laptop without lasers is normal.
  async function connected(selfBase) {
    if (!fetchImpl || !selfBase) throw new Error('no local address to read from')
    const get = async (route) => {
      const res = await fetchImpl(`${selfBase}${route}`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) throw new Error(`${route} answered ${res.status}`)
      return res.json()
    }
    const row = (id, title, state, detail) => ({ id, title, state, detail })
    const settle = async (id, title, fn) => {
      try { return await fn() } catch (error) { return row(id, title, 'off', String(error.message || error)) }
    }
    const rows = await Promise.all([
      settle('laser', 'Lasers', async () => {
        const d = await get('/laser/api/state')
        const cubes = d.cubes || []
        const up = cubes.filter((c) => c.connected).length
        return row('laser', 'Lasers', up ? (d.armed ? 'live' : 'ok') : 'idle',
          `${up}/${cubes.length} cubes connected · ${d.armed ? 'ARMED' : 'safe'}${d.dark ? ' · dark' : ''}${d.sim ? ' · simulated' : ''}`)
      }),
      settle('laser-desk', 'Laser desk', async () => {
        const d = await get('/laser/desk/api/state')
        return row('laser-desk', 'Laser desk', d.live ? 'live' : 'idle',
          `${d.live ? `playing ${d.liveId || 'a look'}` : 'nothing playing'} · master ${Math.round((d.master ?? 1) * 100)}%${d.blackout ? ' · blackout' : ''} · ${d.bpm || '—'} bpm`)
      }),
      settle('show', 'Show machine', async () => {
        const d = await get('/show-status')
        const bits = [
          d.light?.seen ? `light ${d.light.scene || 'on'}${d.light.blackout ? ' (blackout)' : ''}` : 'light not seen',
          d.controller?.wired ? `controller ${d.controller.name || 'wired'}` : 'no controller',
          `link ${d.link?.state || 'unknown'}`,
          d.heat?.max_c != null ? `heat ${d.heat.max_c}°C` : null
        ].filter(Boolean)
        return row('show', `Show machine · ${d.machine || 'this'}`, d.light?.seen || d.laser?.connected ? 'ok' : 'idle', bits.join(' · '))
      }),
      settle('ndi', 'NDI video', async () => {
        const d = await get('/ndi/api/summary')
        return row('ndi', 'NDI video', d.available ? 'ok' : 'off', d.available ? `ready (${d.version || 'ok'})` : (d.reason || 'not available'))
      }),
      settle('osc', 'OSC', async () => {
        const d = await get('/osc/api/state')
        const n = (d.listeners || []).length
        return row('osc', 'OSC', n ? 'ok' : 'idle', `${n} listener${n === 1 ? '' : 's'} · sent ${d.sent?.messages ?? 0}`)
      }),
      settle('visitors', 'Apps that visit', async () => {
        const d = await get('/api/admin/app-visitors')
        const t = d.totals || {}
        return row('visitors', 'Apps that visit', 'ok', `today: browsers ${t.browser?.today ?? 0} · anonymous ${t.anonymous?.today ?? 0} · agents ${Object.values(t).reduce((n, x) => n + (x.agents || 0), 0)}`)
      })
    ])
    return { rows, live: rows.filter((r) => r.state === 'live' || r.state === 'ok').length, total: rows.length }
  }

  async function services() {
    const out = await runCommand('systemctl', ['--user', 'list-units', '--type=service', '--state=running,failed', '--no-legend', '--plain', '--no-pager'])
    const rows = out.split('\n').filter(Boolean).map((line) => {
      const [unit, , active, sub, ...desc] = line.trim().split(/\s+/)
      return { unit, active, sub, description: desc.join(' ') }
    })
    return {
      rows,
      running: rows.filter((r) => r.active === 'active').length,
      failed: rows.filter((r) => r.active === 'failed').length
    }
  }

  async function pullRequests() {
    const out = await runCommand('gh', ['pr', 'list', '--limit', '30', '--json', 'number,title,headRefName,isDraft,updatedAt,url'], { cwd: repoDir, timeout: 8000 })
    const rows = JSON.parse(out).map((p) => ({
      number: p.number,
      title: p.title,
      branch: p.headRefName,
      draft: Boolean(p.isDraft),
      updatedAt: p.updatedAt,
      url: p.url
    }))
    return { rows, open: rows.length, drafts: rows.filter((r) => r.draft).length }
  }

  // Operator-defined feeds: { id, title, panel: 'tasks'|'shows', kind: 'command'|'file'|'url', command|path|url }
  async function readFeed(feed) {
    if (feed.kind === 'command' && feed.command) {
      return toLines(await runCommand('/bin/sh', ['-c', feed.command]))
    }
    if (feed.kind === 'file' && feed.path) {
      const filePath = feed.path.replace(/^~(?=\/)/, home)
      const [text, stat] = await Promise.all([fsp.readFile(filePath, 'utf8'), fsp.stat(filePath)])
      return { lines: toLines(text), updatedAt: stat.mtime.toISOString() }
    }
    if (feed.kind === 'url' && feed.url && fetchImpl) {
      const res = await fetchImpl(feed.url, { signal: AbortSignal.timeout(3000) })
      return { lines: toLines(await res.text()), status: res.status }
    }
    throw new Error('feed needs kind command | file | url')
  }

  async function feeds(config, panel) {
    const list = (Array.isArray(config.feeds) ? config.feeds : []).filter((f) => f.panel === panel).slice(0, 12)
    const rows = await Promise.all(list.map(async (feed) => {
      const base = { id: feed.id || feed.title || feed.kind, title: feed.title || feed.id || feed.kind }
      try {
        const got = await withTimeout(readFeed(feed), 5000)
        return Array.isArray(got) ? { ...base, ok: true, lines: got } : { ...base, ok: true, ...got }
      } catch (error) {
        return { ...base, ok: false, lines: [], error: String(error.message || error) }
      }
    }))
    return { rows, configured: list.length }
  }

  async function panel(name, fn) {
    const started = now()
    try {
      const data = await withTimeout(fn(), 9000)
      return [name, { ok: true, ms: now() - started, ...data }]
    } catch (error) {
      return [name, { ok: false, ms: now() - started, error: String(error.message || error), rows: [] }]
    }
  }

  async function getMonitor({ selfBase = null } = {}) {
    if (cache && now() - cache.at < CACHE_TTL_MS) return cache.value
    const config = readConfig(configPath)
    const entries = await Promise.all([
      panel('machines', machines),
      panel('network', () => network(config)),
      panel('agents', agents),
      panel('presence', presence),
      panel('connected', () => connected(selfBase)),
      panel('services', services),
      panel('pullRequests', pullRequests),
      panel('tasks', () => feeds(config, 'tasks')),
      panel('shows', () => feeds(config, 'shows'))
    ])
    const value = {
      generatedAt: new Date(now()).toISOString(),
      host: os.hostname(),
      configured: fs.existsSync(configPath),
      panels: Object.fromEntries(entries)
    }
    cache = { at: now(), value }
    return value
  }

  return { getMonitor }
}

module.exports = { createMonitorStore, findClaudeHomes, DEFAULT_PROBES }
