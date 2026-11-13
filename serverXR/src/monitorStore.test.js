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
