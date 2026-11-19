// @vitest-environment node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createMonitorStore, findClaudeHomes, REMOTE_SESSIONS_COMMAND } = require('./monitorStore.js')

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

  it('credits: more than 24 routes are cut quietly; a model id in the text is kept', async () => {
    const { sanitizeCredits } = require('./monitorCredits.js')
    const rows = sanitizeCredits(Array.from({ length: 30 }, (_, i) => ({ route: `r${i}`, why: 'claude-sonnet-4-5-20250929-something' })))
    expect(rows).toHaveLength(24)
    expect(rows.dropped).toBe(0)
    expect(rows[0].why).toBe('claude-sonnet-4-5-20250929-something')
    expect(sanitizeCredits([{ route: 'a' }, null]).dropped).toBe(1)
  })
})
