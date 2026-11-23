// @vitest-environment node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const { createMonitorStore, findClaudeHomes, REMOTE_SESSIONS_COMMAND, CREDITS_COMMAND_MS } = require('./monitorStore.js')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'di-monitor-'))

const tailscale = JSON.stringify({
  Self: { HostName: 'aylmo', OS: 'linux', TailscaleIPs: ['100.1.1.1'], Online: true },
  Peer: {
    a: { HostName: 'r-di', OS: 'linux', TailscaleIPs: ['100.1.1.2'], Online: true, TxBytes: 5, RxBytes: 7, LastSeen: '2026-11-13T10:00:00Z' },
    b: { HostName: 'r-di', OS: 'windows', TailscaleIPs: ['100.1.1.9'], Online: false, LastSeen: '0001-01-01T00:00:00Z' }
  }
})

const fakeRun = (overrides = {}) => async (command, args) => {
  if (overrides[command]) return overrides[command](args)
  throw new Error(`${command} not installed`)
}

describe('monitor snapshot', () => {
  it('counts online machines and keeps self', async () => {
    const home = tmp()
    const store = createMonitorStore({ home, runCommand: fakeRun({ tailscale: () => tailscale }), fetchImpl: null })
    const { panels } = await store.getMonitor()
    expect(panels.machines.ok).toBe(true)
    expect(panels.machines.total).toBe(3)
    expect(panels.machines.online).toBe(2)
    expect(panels.machines.rows[0]).toMatchObject({ name: 'aylmo', self: true, ip: '100.1.1.1' })
    expect(panels.machines.rows[2].lastSeen).toBeNull()
    // ids are unique even when two machines share a host name
    expect(new Set(panels.machines.rows.map((r) => r.id)).size).toBe(3)
  })

  it('a missing tool greys one panel, not the page', async () => {
    const home = tmp()
    const store = createMonitorStore({ home, runCommand: fakeRun({ tailscale: () => tailscale }), fetchImpl: null })
    const { panels } = await store.getMonitor()
    expect(panels.services.ok).toBe(false)
    expect(panels.services.error).toMatch(/not installed/)
    expect(panels.pullRequests.ok).toBe(false)
    expect(panels.machines.ok).toBe(true)
  })

  it('probes report status and mark a refusing server down', async () => {
    const home = tmp()
    fs.mkdirSync(path.join(home, '.di'))
    fs.writeFileSync(path.join(home, '.di', 'monitor.json'), JSON.stringify({
      probes: [{ name: 'up', url: 'http://up' }, { name: 'down', url: 'http://down' }]
    }))
    const fetchImpl = async (url) => {
      if (url === 'http://down') throw new Error('ECONNREFUSED')
      return { status: 200 }
    }
    const store = createMonitorStore({ home, runCommand: fakeRun(), fetchImpl })
    const { panels, configured } = await store.getMonitor()
    expect(configured).toBe(true)
    expect(panels.network.up).toBe(1)
    expect(panels.network.rows.find((r) => r.name === 'down')).toMatchObject({ ok: false, status: 0 })
  })

  it('reads operator feeds by panel from the config file only', async () => {
    const home = tmp()
    fs.mkdirSync(path.join(home, '.di'))
    fs.writeFileSync(path.join(home, 'board.md'), 'line one\nline two\n')
    fs.writeFileSync(path.join(home, '.di', 'monitor.json'), JSON.stringify({
      feeds: [
        { panel: 'tasks', id: 't', title: 'Open asks', kind: 'command', command: 'echo a; echo b' },
        { panel: 'shows', id: 's', title: 'Board', kind: 'file', path: '~/board.md' },
        { panel: 'shows', id: 'x', title: 'Broken', kind: 'file', path: '/nope/missing.md' }
      ]
    }))
    const store = createMonitorStore({
      home,
      runCommand: async (command, args) => {
        if (command === '/bin/sh') return `${args[1].includes('echo a') ? 'a\nb\n' : ''}`
        throw new Error('no tool')
      },
      fetchImpl: null
    })
    const { panels } = await store.getMonitor()
    expect(panels.tasks.rows[0]).toMatchObject({ ok: true, lines: ['a', 'b'] })
    expect(panels.shows.rows[0]).toMatchObject({ ok: true, lines: ['line one', 'line two'] })
    expect(panels.shows.rows[1].ok).toBe(false)
  })

  it('caps feed output by lines and characters', async () => {
    const home = tmp()
    fs.mkdirSync(path.join(home, '.di'))
    fs.writeFileSync(path.join(home, '.di', 'monitor.json'), JSON.stringify({
      feeds: [{ panel: 'tasks', id: 't', kind: 'command', command: 'x' }]
    }))
    const long = `${'y'.repeat(500)}\n${Array.from({ length: 200 }, (_, i) => `l${i}`).join('\n')}`
    const store = createMonitorStore({ home, runCommand: async () => long, fetchImpl: null })
    const { panels } = await store.getMonitor()
    const lines = panels.tasks.rows[0].lines
    expect(lines.length).toBe(60)
    expect(lines[0].length).toBe(200)
  })

  it('finds every Claude login dir that has projects/', () => {
    const home = tmp()
    for (const d of ['.claude', '.claude-di', '.claude-empty']) fs.mkdirSync(path.join(home, d), { recursive: true })
    fs.mkdirSync(path.join(home, '.claude', 'projects'))
    fs.mkdirSync(path.join(home, '.claude-di', 'projects'))
    expect(findClaudeHomes(home).map((d) => path.basename(d)).sort()).toEqual(['.claude', '.claude-di'])
  })

  it('counts sessions once when two login dirs share one projects folder', async () => {
    const home = tmp()
    fs.mkdirSync(path.join(home, '.claude', 'projects', 'p1'), { recursive: true })
    fs.writeFileSync(path.join(home, '.claude', 'projects', 'p1', 'aaaaaaaa-1111.jsonl'), '{"type":"user","timestamp":"2026-11-13T10:00:00Z"}\n')
    fs.mkdirSync(path.join(home, '.claude-two'), { recursive: true })
    fs.symlinkSync(path.join(home, '.claude', 'projects'), path.join(home, '.claude-two', 'projects'))
    const store = createMonitorStore({ home, runCommand: fakeRun({ tailscale: () => tailscale }), fetchImpl: null })
    const { panels } = await store.getMonitor()
    expect(panels.agents.accounts.sort()).toEqual(['.claude', '.claude-two'])
    expect(panels.agents.total).toBe(1)
  })

  it('lists who is connected per space and project from the hub maps', async () => {
    const home = tmp()
    const spaces = new Map([['platina', new Map([['s1', { userName: 'Emilya', joinedAt: 1700000000000 }], ['s2', { userId: 'u9' }]])], ['empty', new Map()]])
    const projects = new Map([['proj-1', new Map([['s3', { userName: 'Kiara' }]])]])
    const store = createMonitorStore({ home, runCommand: fakeRun(), fetchImpl: null, connections: { spaces, projects } })
    const { panels } = await store.getMonitor()
    expect(panels.presence.people).toBe(3)
    expect(panels.presence.places).toBe(2)
    expect(panels.presence.rows[0]).toMatchObject({ id: 'space:platina', kind: 'space' })
    expect(panels.presence.rows[0].people.map((p) => p.name)).toEqual(['Emilya', 'u9'])
  })

  it('reads connected things from this server and shows a missing one as off', async () => {
    const home = tmp()
    const answers = {
      '/laser/api/state': { armed: true, sim: false, cubes: [{ connected: true }, { connected: false }] },
      '/laser/desk/api/state': { live: { id: 'x' }, liveId: 'ring', master: 0.5, bpm: 128 },
      '/show-status': { machine: 'ponyo', light: { seen: true, scene: 'Hush', blackout: false }, controller: { wired: true, name: 'K2' }, link: { state: 'ok' }, heat: { max_c: 61 } },
      '/osc/api/state': { listeners: [{}], sent: { messages: 4 } },
      '/api/admin/app-visitors': { totals: { browser: { today: 7, agents: 1 } } }
    }
    const fetchImpl = async (url) => {
      const route = url.replace('http://self/serverXR', '')
      if (!answers[route]) return { ok: false, status: 404 }
      return { ok: true, status: 200, json: async () => answers[route], text: async () => '' }
    }
    const store = createMonitorStore({ home, runCommand: fakeRun(), fetchImpl })
    const { panels } = await store.getMonitor({ selfBase: 'http://self/serverXR' })
    const by = Object.fromEntries(panels.connected.rows.map((r) => [r.id, r]))
    expect(by.laser).toMatchObject({ state: 'live' })
    expect(by.laser.detail).toMatch(/1\/2 cubes connected · ARMED/)
    expect(by['laser-desk'].detail).toMatch(/playing ring · master 50% · 128 bpm/)
    expect(by.show.title).toMatch(/ponyo/)
    expect(by.show.detail).toMatch(/light Hush · controller K2 · link ok · heat 61°C/)
    expect(by.ndi).toMatchObject({ state: 'off' })
    expect(by.osc.detail).toMatch(/1 listener/)
    expect(by.visitors.detail).toMatch(/browsers 7/)
  })

  it('spaces panel: this machine\'s own spaces, sandboxes left out; no local address says so (11-24)', async () => {
    const home = tmp()
    const fetchImpl = async (url) => (url === 'http://self/serverXR/api/spaces'
      ? { ok: true, status: 200, json: async () => ({ spaces: [{ slug: 'alpha', isPublic: true }, { id: 'b', isPublic: false }, { slug: 'sb', kind: 'sandbox' }] }) }
      : { ok: false, status: 404 })
    const store = createMonitorStore({ home, runCommand: fakeRun(), fetchImpl })
    const { panels } = await store.getMonitor({ selfBase: 'http://self' })
    expect(panels.spaces).toMatchObject({ ok: true, total: 3, rows: [{ slug: 'alpha', visibility: 'public' }, { slug: 'b', visibility: 'private' }] })
    const bare = createMonitorStore({ home, runCommand: fakeRun(), fetchImpl })
    expect((await bare.getMonitor({ selfBase: null })).panels.spaces).toMatchObject({ ok: false, error: 'no local address to read from' })
  })

  it('serves a cached snapshot for 5 seconds', async () => {
    const home = tmp()
    let calls = 0
    const store = createMonitorStore({
      home,
      runCommand: async (c) => { if (c === 'tailscale') calls += 1; return tailscale },
      fetchImpl: null
    })
    await store.getMonitor()
    await store.getMonitor()
    expect(calls).toBe(1)
  })

  describe('remote agents', () => {
    const line = (file, rec) => `${file}\t${JSON.stringify(rec)}`
    const config = (home, list) => {
      const p = path.join(home, 'monitor.json')
      fs.writeFileSync(p, JSON.stringify({ remoteAgents: list }))
      return p
    }

    it('adds remote live sessions tagged with the machine and runs only the fixed ssh command', async () => {
      const home = tmp()
      const calls = []
      const runCommand = async (command, args) => {
        if (command === 'ssh') {
          calls.push([command, args])
          return [
            line('/home/di/.claude/sessions/1.json', { pid: 1, sessionId: 'abc12345-x', status: 'busy', cwd: '/home/di', name: 'di-58', updatedAt: 1790967899754 }),
            'garbage line', line('/home/di/.claude/sessions/2.json', { nope: true })
          ].join('\n')
        }
        throw new Error('not installed')
      }
      const store = createMonitorStore({ home, configPath: config(home, [{ name: 'r-di', ssh: 'r-di' }]), runCommand, fetchImpl: null })
      const { panels } = await store.getMonitor()
      expect(calls).toHaveLength(1)
      expect(calls[0][1]).toEqual(['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=3', 'r-di', REMOTE_SESSIONS_COMMAND])
      expect(panels.agents.ok).toBe(true)
      expect(panels.agents.rows).toHaveLength(1)
      expect(panels.agents.rows[0]).toMatchObject({ machine: 'r-di', account: '.claude', title: 'di-58', status: 'busy', cwd: '/home/di' })
      expect(panels.agents.remotes).toEqual([{ name: 'r-di', ok: true, live: 1 }])
    })

    it('greys only the unreachable machine, keeps local rows and the others', async () => {
      const home = tmp()
      fs.mkdirSync(path.join(home, '.claude', 'projects'), { recursive: true })
      const runCommand = async (command, args) => {
        if (command === 'ssh' && args.includes('down')) throw new Error('ssh: connect to host down port 22: Connection timed out\nmore')
        if (command === 'ssh') return line('/home/x/.claude-two/sessions/9.json', { sessionId: 'sess-up-1', status: 'idle' })
        throw new Error('not installed')
      }
      const store = createMonitorStore({
        home, runCommand, fetchImpl: null,
        configPath: config(home, [{ name: 'down', ssh: 'down' }, { name: 'up', ssh: 'up' }])
      })
      const { panels } = await store.getMonitor()
      expect(panels.agents.ok).toBe(true)
      expect(panels.agents.rows.map((r) => r.machine)).toEqual(['up'])
      expect(panels.agents.remotes[0]).toMatchObject({ name: 'down', ok: false, live: 0 })
      expect(panels.agents.remotes[0].error).toContain('Connection timed out')
      expect(panels.agents.remotes[0].error).not.toContain('more')
      expect(panels.agents.remotes[1]).toMatchObject({ name: 'up', ok: true, live: 1 })
    })

    it('ignores entries that could inject ssh options or shell', async () => {
      const home = tmp()
      const calls = []
      const runCommand = async (command, args) => { if (command === 'ssh') calls.push(args); return '' }
      const store = createMonitorStore({
        home, runCommand, fetchImpl: null,
        configPath: config(home, [{ name: 'a', ssh: '-oProxyCommand=evil' }, { name: 'b', ssh: 'host; rm -rf /' }, { name: 'c' }, null])
      })
      const { panels } = await store.getMonitor()
      expect(calls).toHaveLength(0)
      expect(panels.agents.remotes).toEqual([])
    })
  })
})

describe('monitor store review fixes', () => {
  it('concurrent callers share one scan', async () => {
    let tailscaleCalls = 0
    const store = createMonitorStore({
      home: '/nonexistent', configPath: '/nonexistent/m.json', repoDir: '/tmp', connections: {},
      runCommand: async (cmd) => { if (cmd === 'tailscale') tailscaleCalls += 1; await new Promise((r) => setTimeout(r, 30)); return '{}' },
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) })
    })
    await Promise.all([store.getMonitor({ selfBase: 'x' }), store.getMonitor({ selfBase: 'x' })])
    expect(tailscaleCalls).toBe(1)
  })
})

describe('monitor devices and credits', () => {
  it('leaves Funnel ingress placeholders out of the machine list and counts', async () => {
    const withFunnel = JSON.stringify({
      Self: { HostName: 'aylmo', OS: 'linux', TailscaleIPs: ['100.1.1.1'], Online: true },
      Peer: {
        a: { HostName: 'r-di', OS: 'linux', TailscaleIPs: ['100.1.1.2'], Online: true },
        f1: { HostName: 'funnel-ingress-node', OS: '', TailscaleIPs: ['fd7a::1'], Online: false, Tags: ['tag:ingress'] },
        f2: { HostName: 'funnel-ingress-node', OS: '', TailscaleIPs: ['fd7a::2'], Online: false, Tags: ['tag:ingress'] }
      }
    })
    const store = createMonitorStore({ home: tmp(), runCommand: fakeRun({ tailscale: () => withFunnel }), fetchImpl: null })
    const { panels } = await store.getMonitor()
    expect(panels.machines.total).toBe(2)
    expect(panels.machines.rows.map((r) => r.name)).toEqual(['aylmo', 'r-di'])
  })

  it('credits: no feed is "not configured"; a feed is cleaned and counted; an address becomes "login"', async () => {
    const none = createMonitorStore({ home: tmp(), runCommand: fakeRun({ tailscale: () => tailscale }), fetchImpl: null })
    expect((await none.getMonitor()).panels.credits).toMatchObject({ ok: true, configured: 0, total: 0 })

    const home = tmp()
    fs.mkdirSync(path.join(home, '.di'))
    fs.writeFileSync(path.join(home, '.di', 'monitor.json'), JSON.stringify({ feeds: [{ panel: 'credits', kind: 'command', command: 'credits-json' }] }))
    const list = JSON.stringify([
      { route: 'plan:dob', available: true, meter: '5h ?% 7d 62%', have: 'login someone@example.com', why: '', secret: 'x' },
      { route: 'api:studio', available: false, meter: 'n/a', have: 'key SPENT', why: 'SPENT: credit balance is too low' }
    ])
    const store = createMonitorStore({ home, runCommand: async (c, a) => (c === 'tailscale' ? tailscale : a[1] === 'credits-json' ? list : Promise.reject(new Error('no'))), fetchImpl: null })
    const credits = (await store.getMonitor()).panels.credits
    expect(credits).toMatchObject({ ok: true, configured: 1, ready: 1, total: 2 })
    expect(credits.rows[0]).toEqual({ id: expect.stringMatching(/^r[0-9a-f]{8}$/), name: 'plan:dob', available: true, meter: '5h ?% 7d 62%', have: expect.stringMatching(/^login login-[0-9a-f]{4}$/), why: '' })
    expect(JSON.stringify(credits)).not.toMatch(/example\.com|secret/)
  })

  it('credits: two routes that look alike after masking keep their own id; a key fragment is masked', async () => {
    const home = tmp()
    fs.mkdirSync(path.join(home, '.di'))
    fs.writeFileSync(path.join(home, '.di', 'monitor.json'), JSON.stringify({ feeds: [{ panel: 'credits', kind: 'command', command: 'c' }] }))
    const list = JSON.stringify([
      { route: 'plan:a@x.com', available: true, meter: '', have: '', why: '' },
      { route: 'plan:b@y.com', available: false, meter: '', have: '', why: 'INVALID: sk-ant-api03-abcdefghijklmnop' }
    ])
    const store = createMonitorStore({ home, runCommand: async (c) => (c === 'tailscale' ? tailscale : list), fetchImpl: null })
    const rows = (await store.getMonitor()).panels.credits.rows
    expect(new Set(rows.map((r) => r.id)).size).toBe(2)
    expect(new Set(rows.map((r) => r.name)).size).toBe(2)
    expect(JSON.stringify(rows)).not.toMatch(/x\.com|y\.com|abcdefgh/)
  })

  it('credits: rows of a changed shape or text that is not JSON grey the panel, not a green 0/0', async () => {
    for (const out of ['[{"label":"x"}]', 'oops', '[{"route":"a"},{"label":"b"}]']) {
      const home = tmp()
      fs.mkdirSync(path.join(home, '.di'))
      fs.writeFileSync(path.join(home, '.di', 'monitor.json'), JSON.stringify({ feeds: [{ panel: 'credits', kind: 'command', command: 'c' }] }))
      const store = createMonitorStore({ home, runCommand: async (c) => (c === 'tailscale' ? tailscale : out), fetchImpl: null })
      expect((await store.getMonitor()).panels.credits.ok).toBe(false)
    }
  })

  it('credits: output that is not a list greys the panel', async () => {
    const home = tmp()
    fs.mkdirSync(path.join(home, '.di'))
    fs.writeFileSync(path.join(home, '.di', 'monitor.json'), JSON.stringify({ feeds: [{ panel: 'credits', kind: 'command', command: 'x' }] }))
    const store = createMonitorStore({ home, runCommand: async (c) => (c === 'tailscale' ? tailscale : '{"a":1}'), fetchImpl: null })
    expect((await store.getMonitor()).panels.credits).toMatchObject({ ok: false })
  })

  it('credits: a command that exits 1 (no route ready) still shows its list', async () => {
    const home = tmp()
    fs.mkdirSync(path.join(home, '.di'))
    fs.writeFileSync(path.join(home, '.di', 'monitor.json'), JSON.stringify({ feeds: [{ panel: 'credits', kind: 'command', command: 'c' }] }))
    const list = JSON.stringify([{ route: 'plan:dob', available: false, meter: '', have: 'login', why: 'limit' }])
    const store = createMonitorStore({ home, fetchImpl: null, runCommand: async (c) => {
      if (c === 'tailscale') return tailscale
      throw Object.assign(new Error('Command failed'), { stdout: list, code: 1 })
    } })
    expect((await store.getMonitor()).panels.credits).toMatchObject({ ok: true, ready: 0, total: 1 })
  })

  // The credits command takes 12 s once an hour (its probe verdicts expire: measured 2026-11-20) and the panel used to be killed at 8 s.
  // A store whose credits command is under the test's hand: each run waits for calls[i].resolve / reject; the clock is the test's too.
  const creditsStore = (extra = {}, command = 'c') => {
    const home = tmp()
    fs.mkdirSync(path.join(home, '.di'))
    const config = (cmd) => fs.writeFileSync(path.join(home, '.di', 'monitor.json'), JSON.stringify({ feeds: [{ panel: 'credits', kind: 'command', command: cmd }] }))
    config(command)
    const clock = { t: 1_000_000 }
    const calls = []
    const runCommand = (c) => (c === '/bin/sh'
      ? new Promise((resolve, reject) => { calls.push({ resolve, reject }) })
      : Promise.reject(new Error(`${c} not installed`)))
    const store = createMonitorStore({ home, runCommand, fetchImpl: null, now: () => clock.t, ...extra })
    return { store, calls, clock, config }
  }
  const creditList = (available) => JSON.stringify([{ route: 'plan:dob', available, meter: '', have: 'login', why: '' }])
  const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

  it('credits: a slow command does not hold the snapshot; the next snapshot has the list', async () => {
    const { store, calls, clock } = creditsStore({ creditsWaitMs: 30 })
    const first = (await store.getMonitor()).panels.credits
    expect(first).toMatchObject({ ok: true, configured: 1, checking: true, rows: [] })
    expect(first.checkedAt).toBeUndefined() // a first check has no list, so no date
    expect(calls).toHaveLength(1)
    calls[0].resolve(creditList(true))
    await settle()
    clock.t += 6000 // past the 5 s snapshot cache, inside the one-minute freshness
    const second = (await store.getMonitor()).panels.credits
    expect(second).toMatchObject({ ok: true, ready: 1, total: 1 })
    expect(second.checking).toBeUndefined()
    expect(second.stale).toBeUndefined()
    expect(second.checkedAt).toBeUndefined() // only an old list says when it was read
    expect(calls).toHaveLength(1) // the good answer is reused, not asked again
  })

  it('credits: after a minute the old list is shown at once while one new check runs in the background', async () => {
    const { store, calls, clock } = creditsStore({ creditsWaitMs: 30 })
    const first = store.getMonitor()
    calls[0].resolve(creditList(true))
    expect((await first).panels.credits).toMatchObject({ ok: true, ready: 1 })
    clock.t += 61_000
    const second = (await store.getMonitor()).panels.credits // the new check is still running: no waiting for it
    expect(second).toMatchObject({ ok: true, ready: 1, total: 1 })
    expect(second.checking).toBeUndefined()
    expect(second.stale).toBeUndefined() // a minute old is not "stale" yet
    expect(calls).toHaveLength(2)
    clock.t += 6000
    await store.getMonitor()
    expect(calls).toHaveLength(2) // one check at a time
    calls[1].resolve(creditList(false))
    await settle()
    clock.t += 6000
    expect((await store.getMonitor()).panels.credits).toMatchObject({ ok: true, ready: 0, total: 1 })
    expect(calls).toHaveLength(2)
  })

  it('credits: a check that keeps failing marks the list old after 5 minutes and stops showing it after 30', async () => {
    const { store, calls, clock } = creditsStore({ creditsWaitMs: 30 })
    const readAt = clock.t
    const first = store.getMonitor()
    calls[0].resolve(creditList(true))
    await first
    // one snapshot `ms` after the list was read; the check it starts fails with `why`; the panel is what that snapshot showed
    const failAt = async (ms, why) => {
      clock.t = readAt + ms
      const snap = await store.getMonitor()
      calls[calls.length - 1].reject(new Error(why))
      await settle()
      return snap.panels.credits
    }
    const minute = 60_000
    const longLine = `Command failed: ${'y'.repeat(300)}`
    const quiet = (panel) => {
      expect(panel).toMatchObject({ ok: true, ready: 1 })
      expect(panel.stale).toBeUndefined()
      expect(panel.checkedAt).toBeUndefined()
      expect(panel.refreshError).toBeUndefined()
    }
    quiet(await failAt(minute + 1000, 'Command failed: c\nboom')) // 1 min: shown, nothing said yet
    quiet(await failAt(4 * minute, 'Command failed: c\nthe second line is not shown')) // 4 min: still not old, though a check failed
    const old = await failAt(6 * minute, longLine) // 6 min: older than 5 min: says when it was read and why (first line of the last failure)
    expect(old).toMatchObject({ ok: true, ready: 1, stale: true, checkedAt: new Date(readAt).toISOString(), refreshError: 'Command failed: c' })
    const long = await failAt(29 * minute, 'Command failed: c') // 29 min: still shown; a long line is clipped to 200 characters
    expect(long).toMatchObject({ ok: true, ready: 1, stale: true, refreshError: `${longLine.slice(0, 199)}…` })
    expect(long.refreshError).toHaveLength(200)
    const late = await failAt(31 * minute, 'Command failed: c') // 31 min: no list any more, a check is running
    expect(late).toMatchObject({ ok: true, configured: 1, checking: true, rows: [] })
    expect(late.stale).toBeUndefined()
    expect(late.checkedAt).toBeUndefined()
    clock.t += 6000
    expect((await store.getMonitor()).panels.credits).toMatchObject({ ok: false, error: expect.stringMatching(/Command failed: c/) })
  })

  it('credits: checks start at most once a minute and one at a time, and a new list restarts its age', async () => {
    const { store, calls, clock } = creditsStore({ creditsWaitMs: 30 })
    const t0 = clock.t
    const panelAt = async (ms) => { clock.t = t0 + ms; return (await store.getMonitor()).panels.credits }
    const first = store.getMonitor()
    calls[0].resolve(creditList(true)) // list A, read at t0
    await first
    expect(await panelAt(59_000)).toMatchObject({ ok: true, ready: 1 })
    expect(calls).toHaveLength(1) // 59 s: still inside the minute
    expect(await panelAt(66_000)).toMatchObject({ ok: true, ready: 1 }) // 66 s (past the 5 s snapshot cache): the old list at once ...
    expect(calls).toHaveLength(2) // ... and one new check started
    await panelAt(130_000)
    expect(calls).toHaveLength(2) // it is still running: no second one beside it
    clock.t = t0 + 140_000
    calls[1].resolve(creditList(false)) // list B, read at 140 s
    await settle()
    expect(await panelAt(146_000)).toMatchObject({ ok: true, ready: 0, total: 1 })
    expect(calls).toHaveLength(2) // 6 s after the last try
    const later = await panelAt(140_000 + 4 * 60_000) // B is 4 min old, A would be 6 min 20 s: the age counts from the newest list
    expect(later).toMatchObject({ ok: true, ready: 0 })
    expect(later.stale).toBeUndefined()
    expect(calls).toHaveLength(3) // a minute passed: the next check starts
    calls[2].resolve(creditList(true))
    await settle()
  })

  it('credits: a list nobody asked about for 6 minutes is marked old with the time it was read, and no old failure is blamed', async () => {
    const { store, calls, clock } = creditsStore({ creditsWaitMs: 30 })
    const t0 = clock.t
    const first = store.getMonitor()
    calls[0].resolve(creditList(true))
    await first
    clock.t = t0 + 61_000 // one check fails ...
    await store.getMonitor()
    calls[1].reject(new Error('Command failed: c\nboom'))
    await settle()
    clock.t = t0 + 130_000 // ... the next one works: a list read at 130 s, and the failure is forgotten
    await store.getMonitor()
    calls[2].resolve(creditList(true))
    await settle()
    clock.t = t0 + 130_000 + 6 * 60_000 // then nobody asks for 6 minutes
    const old = (await store.getMonitor()).panels.credits // the list is old; the check this snapshot starts has not ended
    expect(old).toMatchObject({ ok: true, ready: 1, stale: true, checkedAt: new Date(t0 + 130_000).toISOString() })
    expect(old.refreshError).toBeUndefined()
    expect(calls).toHaveLength(4)
    calls[3].resolve(creditList(true))
    await settle()
  })

  // Real timers, a wait set to a minute: a snapshot that has a usable list must not sit in that wait.
  it('credits: a snapshot with a usable list never waits for the renewal, however long the wait is set', async () => {
    const { store, calls, clock } = creditsStore({ creditsWaitMs: 60_000 })
    const first = store.getMonitor()
    calls[0].resolve(creditList(true))
    expect((await first).panels.credits).toMatchObject({ ok: true, ready: 1 })
    clock.t += 61_000 // a new check starts, and does not end until the test ends it
    let timer
    const verdict = await Promise.race([
      store.getMonitor(),
      new Promise((resolve) => { timer = setTimeout(() => resolve('waited'), 1500) })
    ])
    clearTimeout(timer)
    expect(verdict).not.toBe('waited')
    expect(verdict.panels.credits).toMatchObject({ ok: true, ready: 1 })
    expect(calls).toHaveLength(2)
    calls[1].resolve(creditList(true))
    await settle()
  })

  it('credits: a command that fails is tried again only after the freshness window, not on every snapshot', async () => {
    const { store, calls, clock } = creditsStore({ creditsWaitMs: 30 })
    const first = store.getMonitor()
    calls[0].reject(new Error('boom'))
    expect((await first).panels.credits).toMatchObject({ ok: false, error: expect.stringMatching(/boom/) })
    clock.t += 6000
    expect((await store.getMonitor()).panels.credits).toMatchObject({ ok: false })
    expect(calls).toHaveLength(1)
    clock.t += 60_000
    const third = store.getMonitor()
    calls[1].resolve(creditList(true))
    expect((await third).panels.credits).toMatchObject({ ok: true, ready: 1 })
  })

  it('credits: a changed command is another feed, the old list is not shown for it', async () => {
    const { store, calls, clock, config } = creditsStore({ creditsWaitMs: 30 })
    const first = store.getMonitor()
    calls[0].resolve(creditList(true))
    expect((await first).panels.credits).toMatchObject({ ready: 1 })
    config('another-command')
    clock.t += 6000
    expect((await store.getMonitor()).panels.credits).toMatchObject({ ok: true, checking: true, rows: [] })
    expect(calls).toHaveLength(2)
  })

  // The real 12 s, 30 s and 3 s of the credits command, on fake time: nothing here waits for a clock.
  describe('credits timing on fake timers', () => {
    afterEach(() => { vi.useRealTimers() })

    // A credits command that takes `probeMs` of fake time and is killed at the `timeout` the store hands it, as the real runner kills it.
    // `obey: false` is a runner that cannot kill (a hung process): only the store's own cut then ends the wait.
    const probeStore = ({ probeMs = Infinity, obey = true, extra = {} } = {}) => {
      const home = tmp()
      fs.mkdirSync(path.join(home, '.di'))
      fs.writeFileSync(path.join(home, '.di', 'monitor.json'), JSON.stringify({ feeds: [{ panel: 'credits', kind: 'command', command: 'c' }] }))
      const runs = []
      const runCommand = (command, args, options) => {
        if (command !== '/bin/sh') return Promise.reject(new Error(`${command} not installed`))
        runs.push({ command, args, options })
        return new Promise((resolve, reject) => {
          const timers = []
          const end = (finish, value) => { timers.forEach(clearTimeout); finish(value) }
          if (Number.isFinite(probeMs)) timers.push(setTimeout(() => end(resolve, creditList(true)), probeMs))
          if (obey && options?.timeout) timers.push(setTimeout(() => end(reject, Object.assign(new Error('Command failed: c'), { killed: true })), options.timeout))
        })
      }
      return { store: createMonitorStore({ home, runCommand, fetchImpl: null, ...extra }), runs }
    }
    // a snapshot whose answer can be looked at before it is awaited
    const watch = (promise) => { const w = { done: false, value: null }; promise.then((value) => { w.done = true; w.value = value }); return w }

    it('credits: a cold 12 s probe ends inside the limit, so its verdict can be cached', async () => {
      vi.useFakeTimers()
      const { store, runs } = probeStore({ probeMs: 12_000 }) // the cold run measured 12.1 s on 2026-11-20
      const first = watch(store.getMonitor())
      await vi.advanceTimersByTimeAsync(3000) // the default wait for a first list
      expect(first.done).toBe(true)
      expect(first.value.panels.credits).toMatchObject({ ok: true, configured: 1, checking: true, rows: [] })
      // started once, through the shell, with the store's limit: the cold probe must end inside it, or di-credits is killed before it
      // writes its verdict (the old 8 s limit did) and every snapshot starts another real model call
      expect(runs).toEqual([{ command: '/bin/sh', args: ['-c', 'c'], options: { timeout: CREDITS_COMMAND_MS } }])
      expect(CREDITS_COMMAND_MS).toBeGreaterThan(2 * 12_100) // twice the cold run: a busy machine stretches it
      await vi.advanceTimersByTimeAsync(9000) // 12 s: the probe ends on its own, inside the limit
      await vi.advanceTimersByTimeAsync(6000) // past the 5 s snapshot cache
      const second = (await store.getMonitor()).panels.credits
      expect(second).toMatchObject({ ok: true, ready: 1, total: 1 })
      expect(second.checking).toBeUndefined()
      expect(runs).toHaveLength(1) // the list is kept; the command is not started again
      expect(vi.getTimerCount()).toBe(0)
    })

    it('credits: a one-shot wait for the whole limit carries a list that takes 12 s', async () => {
      vi.useFakeTimers()
      const { store } = probeStore({ probeMs: 12_000, extra: { creditsWaitMs: CREDITS_COMMAND_MS + 2000 } })
      const snap = watch(store.getMonitor())
      await vi.advanceTimersByTimeAsync(11_900)
      expect(snap.done).toBe(false) // it waits: the 9 s cap of the other panels does not cut the credits panel
      await vi.advanceTimersByTimeAsync(200)
      expect(snap.done).toBe(true)
      expect(snap.value.panels.credits).toMatchObject({ ok: true, ready: 1, total: 1 })
      expect(snap.value.panels.credits.checking).toBeUndefined()
      expect(vi.getTimerCount()).toBe(0)
    })

    it('credits: a hung command is cut half a second after its limit, and a one-shot wait ends there with the error', async () => {
      vi.useFakeTimers()
      const { store } = probeStore({ obey: false, extra: { creditsWaitMs: CREDITS_COMMAND_MS + 2000 } }) // never answers, cannot be killed
      const snap = watch(store.getMonitor())
      await vi.advanceTimersByTimeAsync(CREDITS_COMMAND_MS - 100)
      expect(snap.done).toBe(false)
      await vi.advanceTimersByTimeAsync(700) // the limit + 600 ms
      expect(snap.done).toBe(true)
      expect(snap.value.panels.credits).toMatchObject({ ok: false, error: `timed out after ${CREDITS_COMMAND_MS + 500} ms` })
      expect(vi.getTimerCount()).toBe(0)
    })

    it('credits: with no list yet a snapshot waits three seconds for the command, then says checking', async () => {
      vi.useFakeTimers()
      const { store } = probeStore({ obey: false }) // the default wait: no creditsWaitMs given
      const snap = watch(store.getMonitor())
      await vi.advanceTimersByTimeAsync(2900)
      expect(snap.done).toBe(false)
      await vi.advanceTimersByTimeAsync(200)
      expect(snap.done).toBe(true)
      expect(snap.value.panels.credits).toMatchObject({ ok: true, configured: 1, checking: true, rows: [] })
      await vi.advanceTimersByTimeAsync(CREDITS_COMMAND_MS) // the check that was left running is cut at its limit
      expect(vi.getTimerCount()).toBe(0)
    })

    it('credits: an answer that arrives inside the wait is in that snapshot, which does not sit out the rest of the wait', async () => {
      vi.useFakeTimers()
      const { store } = probeStore({ probeMs: 1000 })
      const snap = watch(store.getMonitor())
      await vi.advanceTimersByTimeAsync(1000)
      expect(snap.done).toBe(true)
      expect(snap.value.panels.credits).toMatchObject({ ok: true, ready: 1, total: 1 })
      expect(snap.value.panels.credits.checking).toBeUndefined()
      expect(vi.getTimerCount()).toBe(0) // the wait's own timer is not left behind
    })
  })

  it('credits: more than 24 routes are cut quietly; a model id in the text is kept', async () => {
    const { sanitizeCredits } = require('./monitorCredits.js')
    const rows = sanitizeCredits(Array.from({ length: 30 }, (_, i) => ({ route: `r${i}`, why: 'claude-sonnet-4-5-20250929-something' })))
    expect(rows).toHaveLength(24)
    expect(rows.dropped).toBe(0)
    expect(rows[0].why).toBe('claude-sonnet-4-5-20250929-something')
    expect(sanitizeCredits([{ route: 'a' }, null]).dropped).toBe(1)
  })

  it('pull requests: config.repo is passed to gh as -R', async () => {
    const home = tmp()
    fs.mkdirSync(path.join(home, '.di'))
    fs.writeFileSync(path.join(home, '.di', 'monitor.json'), JSON.stringify({ repo: 'dob-0/di.iiii' }))
    const seen = []
    const store = createMonitorStore({ home, fetchImpl: null, runCommand: async (c, a) => {
      if (c === 'tailscale') return tailscale
      if (c === 'gh') { seen.push(a); return '[]' }
      throw new Error('no')
    } })
    expect((await store.getMonitor()).panels.pullRequests.ok).toBe(true)
    expect(seen[0].slice(0, 4)).toEqual(['pr', 'list', '-R', 'dob-0/di.iiii'])
    // gh stops at --limit; it must ask for more than the 57 open on 11-23 (30 cut the count)
    expect(Number(seen[0][seen[0].indexOf('--limit') + 1])).toBeGreaterThanOrEqual(300)
  })
})
