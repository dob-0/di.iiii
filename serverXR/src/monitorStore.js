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
const { tagPanels } = require('../../shared/infoLayers.cjs')
const fsp = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { createAgentBoardStore } = require('./agentBoardStore')
const { sanitizeChats } = require('./monitorChats')
const { sanitizeCredits } = require('./monitorCredits')
const { checkWithRetry, createProbeTracker } = require('./monitorProbe')

const CACHE_TTL_MS = 5000
// gh pr list stops at its --limit; 30 cut the count (57 open showed as 30, 11-23), so ask for all
const PR_LIST_LIMIT = 300
const PANEL_TIMEOUT_MS = 4000
const PANEL_CAP_MS = 9000
// the spaces a machine reports for the map: a safety limit (aylmo holds 36)
const SPACES_MAX = 200
const FEED_MAX_LINES = 60
const LINE_MAX_CHARS = 200

// The credits command (`di-credits status --json`) is slow once an hour: it keeps each key's probe verdict for 3600 s and the
// first run after that makes the real calls (12.1 s measured on 2026-11-20; 2-3 s otherwise). A panel that waits for it was killed
// at 8 s every hour and held every snapshot back that long. So the last good list is kept and renewed in the background.
const CREDITS_FRESH_MS = 60 * 1000 // a good answer is reused this long; then one background refresh runs (a failed one is retried this often)
const CREDITS_STALE_MS = 5 * 60 * 1000 // a list older than this is marked stale: the renewal is slow or failing
const CREDITS_DROP_MS = 30 * 60 * 1000 // a list older than this is not shown any more: the panel shows the failure, or "checking" while a new check runs
const CREDITS_WAIT_MS = 3000 // with no list yet, a snapshot waits this long for the command, then says "checking"
// The command's own limit. A cold probe (12.1 s measured) must end INSIDE it: di-credits writes each route's verdict when that
// route's probe ends, so a probe still running when the command is killed (the old 8 s limit) never caches and every snapshot
// starts that real model call again.
// It must also stay short enough for the one-shot report (scripts/di/monitorReport.mjs), which waits for all of it, to end before its
// timer unit's TimeoutStartSec=60: the credits read ends 0.5 s after the limit at the latest (30.5 s), then git 5 s + ledger 5 s
// + send 15 s = 55.5 s < 60 s. A longer limit makes the timer unit kill the report; scripts/di/monitorCollect.test.js checks the sum.
const CREDITS_COMMAND_MS = 30 * 1000

const DEFAULT_PROBES = [
  { name: 'dev tier', url: 'https://dev.diiii.xyz' },
  { name: 'prod tier', url: 'https://diiii.xyz' }
]

function run(command, args, { timeout = PANEL_TIMEOUT_MS, cwd } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, cwd, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) { Object.defineProperty(error, 'stdout', { value: String(stdout || ''), enumerable: false }); reject(error) }
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

// Resolves when the promise settles or after `ms`, whichever is first; never rejects, never leaves a timer behind.
async function settleWithin(promise, ms) {
  let timer
  try {
    await Promise.race([promise.catch(() => {}), new Promise((resolve) => { timer = setTimeout(resolve, ms) })])
  } finally {
    clearTimeout(timer)
  }
}

function readConfig(configPath) {
  try {
    // the file can name shell commands: refuse it when anyone but its owner can write to it
    const st = fs.statSync(configPath)
    if (st.mode & 0o022) return {}
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

// Fixed, read-only command run on a remote machine over ssh. Never built from
// a request or from config: only the ssh target comes from ~/.di/monitor.json.
// One line per live session file: <path><TAB><json>. A session file whose pid
// is gone is skipped (kill -0 works on Linux and macOS).
const REMOTE_SESSIONS_COMMAND = [
  'for f in "$HOME"/.claude*/sessions/*.json; do',
  '[ -f "$f" ] || continue;',
  "pid=$(sed -n 's/.*\"pid\":\\([0-9][0-9]*\\).*/\\1/p' \"$f\" | head -n 1);",
  '[ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || continue;',
  'printf \'%s\\t\' "$f"; head -c 4096 "$f" | tr -d \'\\n\'; echo;',
  'done'
].join(' ')
const SSH_ARGS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=3']
const SSH_TARGET = /^[A-Za-z0-9._@-]{1,100}$/

function parseRemoteSessions(machine, out) {
  const rows = []
  for (const line of String(out).split('\n')) {
    const tab = line.indexOf('\t')
    if (tab < 0) continue
    let rec
    try { rec = JSON.parse(line.slice(tab + 1)) } catch { continue }
    if (!rec || typeof rec.sessionId !== 'string') continue
    const account = path.basename(path.dirname(path.dirname(line.slice(0, tab))))
    rows.push({
      machine,
      account,
      sessionId: rec.sessionId,
      title: String(rec.name || rec.sessionId.slice(0, 8)).slice(0, 120),
      status: rec.status || 'live',
      kind: rec.kind || 'interactive',
      branch: null,
      cwd: typeof rec.cwd === 'string' ? rec.cwd : null,
      model: null,
      lastActivity: Number.isFinite(rec.updatedAt) ? new Date(rec.updatedAt).toISOString() : null
    })
  }
  return rows
}

function createMonitorStore({
  home = os.homedir(),
  configPath = process.env.DI_MONITOR_CONFIG || path.join(home, '.di', 'monitor.json'),
  runCommand = run,
  fetchImpl = (typeof fetch === 'function' ? fetch : null),
  repoDir = process.env.DI_REPO_DIR || process.cwd(),
  // who is connected right now: the realtime hub's own maps (space/project id -> socket id -> person)
  // (loaded lazily: the `di monitor report` CLI builds this store without a realtime hub)
  connections = null,
  now = () => Date.now(),
  // how long a snapshot waits for the credits command when no list is known yet; the one-shot `di monitor report`
  // has no memory between runs and passes the command's whole limit, so a report always carries the real list or the command's error
  creditsWaitMs = CREDITS_WAIT_MS,
  // `di monitor report` sets it: the report carries this machine's own spaces for the other machines' map
  reportSpaces = false
} = {}) {
  const boardStores = new Map()
  const hub = () => connections || (() => {
    const sh = require('./socketHandlers')
    return { spaces: sh.spaceConnections, projects: sh.projectConnections }
  })()
  let cache = null
  const probeTracker = createProbeTracker({ now })

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
    // Tailscale Funnel adds one placeholder peer per public hostname, tagged tag:ingress (no OS, no name of
    // its own, never a device); they are not machines, so they are left out of the list and the counts.
    const isIngress = (p) => (p.Tags || []).includes('tag:ingress') || (p.ShareeNode === true && !p.OS && !p.DNSName)
    const rows = [toRow(raw.Self || {}, true), ...Object.values(raw.Peer || {}).filter((p) => !isIngress(p)).map((p) => toRow(p, false))]
    return { rows, online: rows.filter((r) => r.online).length, total: rows.length }
  }

  async function network(config) {
    const probes = Array.isArray(config.probes) && config.probes.length ? config.probes : DEFAULT_PROBES
    if (!fetchImpl) throw new Error('no fetch available')
    const rows = await Promise.all(probes.slice(0, 12).map(async (probe) => {
      const check = async () => {
        const started = now()
        try {
          const res = await fetchImpl(probe.url, { method: 'GET', signal: AbortSignal.timeout(3000), redirect: 'manual' })
          return { ok: res.status < 500, status: res.status, ms: now() - started }
        } catch (error) {
          return { ok: false, status: 0, ms: now() - started, error: String(error.message || error) }
        }
      }
      const got = await checkWithRetry(check)
      const judged = probeTracker.judge(probe.url, got)
      return {
        id: probe.url, name: probe.name || probe.url, url: probe.url, status: judged.status, ms: got.ms, ok: judged.ok,
        probe: judged.state, note: judged.note, misses: judged.misses, lastGoodAt: judged.lastGoodAt,
        ...(got.error ? { error: got.error } : {})
      }
    }))
    return { rows, up: rows.filter((r) => r.ok).length, total: rows.length }
  }

  async function remoteAgents(config) {
    const list = (Array.isArray(config.remoteAgents) ? config.remoteAgents : [])
      .filter((r) => r && typeof r.name === 'string' && typeof r.ssh === 'string' && SSH_TARGET.test(r.ssh) && !r.ssh.startsWith('-'))
      .slice(0, 12)
    return Promise.all(list.map(async (r) => {
      try {
        const out = await withTimeout(runCommand('ssh', [...SSH_ARGS, r.ssh, REMOTE_SESSIONS_COMMAND], { timeout: 6000 }), 7000)
        return { name: r.name, ok: true, rows: parseRemoteSessions(r.name, out) }
      } catch (error) {
        return { name: r.name, ok: false, rows: [], error: String(error.message || error).split('\n')[0].slice(0, 200) }
      }
    }))
  }

  async function agents(config = {}) {
    const homes = findClaudeHomes(home)
    const live = []
    let total = 0
    // two login dirs can share one projects/ folder through a symlink: count
    // its sessions once, but keep each dir's own live records (its sessions/).
    const countedProjects = new Set()
    for (const dir of homes) {
      if (!boardStores.has(dir)) boardStores.set(dir, createAgentBoardStore({ claudeHome: dir }))
      const account = path.basename(dir)
      let board
      let projectsReal
      try {
        board = await boardStores.get(dir).getBoard()
        projectsReal = fs.realpathSync(path.join(dir, 'projects'))
      } catch {
        continue // one broken login dir greys itself, not the whole panel
      }
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
    const localRows = live.filter((r) => (seen.has(r.sessionId) ? false : seen.add(r.sessionId)))
    const remotes = await remoteAgents(config)
    const remoteRows = remotes.flatMap((r) => r.rows).filter((r) => (seen.has(`${r.machine}:${r.sessionId}`) ? false : seen.add(`${r.machine}:${r.sessionId}`)))
    const rows = [...localRows, ...remoteRows]
    return {
      rows,
      live: rows.length,
      busy: rows.filter((r) => r.status === 'busy').length,
      total,
      accounts: homes.map((d) => path.basename(d)),
      remotes: remotes.map((r) => ({ name: r.name, ok: r.ok, live: r.rows.length, ...(r.error ? { error: r.error } : {}) }))
    }
  }

  // People connected right now, from the realtime hub's own maps. Names are
  // what each browser says about itself (an artist in a space, a guest on a
  // public page); the account behind a name is never shown here.
  async function presence() {
    const rows = []
    const live = hub()
    for (const [kind, map] of [['space', live.spaces], ['project', live.projects]]) {
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
      // The light desk is asked ONLY for its clock: every other light route BUILDS the desk (40 Hz loop,
      // Art-Net bind) on a machine that has no lights (serverXR/src/routes/lightingRoutes.js).
      settle('light', 'Light desk', async () => {
        const d = await get('/light/api/clock')
        return row('light', 'Light desk', d.up ? 'ok' : 'idle', d.up ? 'desk started (not a check that lights work)' : 'not started on this machine')
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
      const [unit, , active, sub, ...desc] = line.replace(/^[^\w]+/, '').trim().split(/\s+/)
      return { unit, active, sub, description: desc.join(' ') }
    })
    return {
      rows,
      running: rows.filter((r) => r.active === 'active').length,
      failed: rows.filter((r) => r.active === 'failed').length
    }
  }

  async function pullRequests(config = {}) {
    // config.repo ("owner/name") lets a server that does not run inside a checkout still list its pull requests
    const repoArgs = typeof config.repo === 'string' && /^[\w.-]+\/[\w.-]+$/.test(config.repo) ? ['-R', config.repo] : []
    const out = await runCommand('gh', ['pr', 'list', ...repoArgs, '--limit', String(PR_LIST_LIMIT), '--json', 'number,title,headRefName,isDraft,updatedAt,url'], { cwd: repoDir, timeout: 8000 })
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

  // The credits of this machine: a feed { panel: 'credits', kind: 'command' } in the config whose output is the
  // JSON list `di-credits status --json` prints (route, available, meter, have, why). Only those fields are kept,
  // text is clipped, an e-mail address is shown as "login-<4 hex>" and key-like text is masked (monitorCredits.js), so no address or key leaves the machine in a report.
  async function readCredits(command) {
    // the command is killed by runCommand's own timeout, so a hung probe never leaves a process behind
    // di-credits exits 1 when no route is ready, and still prints the full list: that list is what this panel is for
    const out = await withTimeout(runCommand('/bin/sh', ['-c', command], { timeout: CREDITS_COMMAND_MS }).catch((error) => {
      if (error && typeof error.stdout === 'string' && error.stdout.trim().startsWith('[') && !error.killed) return error.stdout
      throw error
    }), CREDITS_COMMAND_MS + 500)
    let parsed
    try { parsed = JSON.parse(out) } catch { throw new Error('the credits command did not print JSON') }
    const rows = sanitizeCredits(parsed)
    if (!rows || rows.dropped) throw new Error('the credits list was not in the expected shape')
    return { configured: 1, rows, ready: rows.filter((r) => r.available).length, total: rows.length }
  }

  // What the credits panel remembers between scans: the last good list and when it was read, when the command was last
  // tried (good or not), why the last try failed, and the renewal in flight (one at a time, shared by every scan).
  let creditsMemo = null
  async function credits(config) {
    const feed = (Array.isArray(config.feeds) ? config.feeds : []).find((f) => f.panel === 'credits' && f.kind === 'command' && f.command)
    if (!feed) return { configured: 0, rows: [], ready: 0, total: 0 }
    // a changed command is another feed: the list of the old one is forgotten
    if (!creditsMemo || creditsMemo.command !== feed.command) creditsMemo = { command: feed.command, value: null, at: 0, triedAt: -Infinity, error: '', renewing: null }
    const memo = creditsMemo
    if (!memo.renewing && now() - memo.triedAt >= CREDITS_FRESH_MS) {
      memo.renewing = readCredits(memo.command).then(
        (value) => { memo.value = value; memo.at = now(); memo.error = '' },
        (error) => { memo.error = String(error.message || error) }
      ).then(() => { memo.triedAt = now(); memo.renewing = null })
    }
    // a list that is too old counts as no list. With none, wait a little for the answer; a usable list is shown at once while the renewal runs on
    const usable = () => memo.value && now() - memo.at <= CREDITS_DROP_MS
    if (!usable() && memo.renewing) await settleWithin(memo.renewing, creditsWaitMs)
    if (usable()) {
      const data = { ...memo.value }
      // only an old list says when it was read (the page tells how old); a fresh list, a first check and a dropped list carry no date
      if (now() - memo.at > CREDITS_STALE_MS) {
        data.stale = true
        data.checkedAt = new Date(memo.at).toISOString()
        if (memo.error) data.refreshError = clip(memo.error.split('\n')[0])
      }
      return data
    }
    if (memo.renewing) return { configured: 1, rows: [], ready: 0, total: 0, checking: true }
    throw new Error(memo.error || 'the credits command has not answered')
  }

  // The chat list of this machine: a feed { panel: 'chats', kind: 'command' } in the config whose output is
  // the chat list as JSON. No such feed is "not configured", not an empty list. Only the shown fields are kept.
  async function chats(config) {
    const list = (Array.isArray(config.feeds) ? config.feeds : []).filter((f) => f.panel === 'chats' && f.kind === 'command' && f.command).slice(0, 1)
    if (!list.length) return { configured: 0, source: null }
    const out = await withTimeout(runCommand('/bin/sh', ['-c', list[0].command]), 6000)
    const source = sanitizeChats(JSON.parse(out), os.hostname().split('.')[0])
    if (!source) throw new Error('the chat list was not in the expected shape')
    return { configured: 1, source }
  }

  // this machine's own spaces (slug + public/private), read from its own server: the Monitor of the owner's OTHER machines
  // shows them on the map, so every machine draws the same map (11-24: studio-mac drew 6 spaces, aylmo 36)
  async function spaces(selfBase) {
    if (!fetchImpl || !selfBase) throw new Error('no local address to read from')
    const res = await fetchImpl(`${selfBase}/api/spaces`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error(`/api/spaces answered ${res.status}`)
    const body = await res.json()
    const list = Array.isArray(body) ? body : (Array.isArray(body?.spaces) ? body.spaces : [])
    const rows = list
      .filter((s) => s && s.kind !== 'sandbox' && (s.slug || s.id))
      .map((s) => ({ slug: String(s.slug || s.id).slice(0, 80), visibility: s.isPublic ? 'public' : 'private' }))
      .slice(0, SPACES_MAX)
    return { rows, total: list.length }
  }

  async function panel(name, fn, capMs = PANEL_CAP_MS) {
    const started = now()
    try {
      const data = await withTimeout(fn(), capMs)
      return [name, { ok: true, ms: now() - started, ...data, at: now() }]
    } catch (error) {
      return [name, { ok: false, ms: now() - started, error: String(error.message || error), rows: [], at: now() }]
    }
  }

  // one scan at a time: concurrent callers (several tabs, a poll during a slow
  // panel) share the scan in flight instead of each starting their own.
  let inflight = null
  async function getMonitor({ selfBase = null } = {}) {
    if (cache && cache.selfBase === selfBase && now() - cache.at < CACHE_TTL_MS) return cache.value
    if (inflight && inflight.selfBase === selfBase) return inflight.promise
    const promise = scan(selfBase).finally(() => { inflight = null })
    inflight = { selfBase, promise }
    return promise
  }

  async function scan(selfBase) {
    const config = readConfig(configPath)
    const entries = await Promise.all([
      panel('machines', machines),
      panel('network', () => network(config)),
      panel('agents', () => agents(config)),
      panel('presence', presence),
      panel('connected', () => connected(selfBase)),
      panel('services', services),
      // the server's own Monitor lists its spaces itself (monitorHub); only a machine REPORT carries them (11-24: the server's
      // own scan of this panel failed and turned its machine yellow on its own map)
      ...(reportSpaces ? [panel('spaces', () => spaces(selfBase))] : []),
      panel('pullRequests', () => pullRequests(config)),
      panel('tasks', () => feeds(config, 'tasks')),
      panel('shows', () => feeds(config, 'shows')),
      panel('chats', () => chats(config)),
      panel('credits', () => credits(config), Math.max(PANEL_CAP_MS, creditsWaitMs + 1000))
    ])
    const value = {
      generatedAt: new Date(now()).toISOString(),
      host: os.hostname(),
      configured: fs.existsSync(configPath),
      // every panel (and each machines row) says its layer, so a report and the shared picture pick by tag, not by name
      panels: tagPanels(Object.fromEntries(entries))
    }
    cache = { at: now(), value, selfBase }
    return value
  }

  return { getMonitor }
}

module.exports = { createMonitorStore, REMOTE_SESSIONS_COMMAND, findClaudeHomes, DEFAULT_PROBES, CREDITS_COMMAND_MS }
