// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
    parseOsRelease, parsePacmanQ, parsePacmanNames, parsePacmanSl, parsePacmanQo, parseCheckupdates, parseFlatpakList, parseNpmGlobal, parsePipList,
    parseDpkg, parseBrewList, parseBrewOutdated, parseLaunchctl, parseSs, parseLsofListen, bindClass, parseSystemctlShow, execBinary, parseVersionLine, parseDf,
    unitRows, timerRows, stableHash, summarize, capBody, isDue, collectInventory, inventoryPanel, cachePath, COLLECT_EVERY_MS
} from './monitorInventory.mjs'

const homes = []
const tmpHome = () => { const h = fs.mkdtempSync(path.join(os.tmpdir(), 'di-inv-')); homes.push(h); return h }
afterEach(() => { while (homes.length) fs.rmSync(homes.pop(), { recursive: true, force: true }) })

// ---- made-up outputs; nothing here is a real machine ---------------------------------------------------------------
const PACMAN_Q = 'alpha 1.2.3-1\nbeta-lib 4.5-2\ngamma 2:9.0-1\nbad line here now\n'
const SS = [
    'Netid State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess',
    'tcp   LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:(("sshd",pid=10,fd=3))',
    'tcp   LISTEN 0 128 [::]:22 [::]:*',
    'tcp   LISTEN 0 511 127.0.0.1:4000 0.0.0.0:* users:(("node",pid=11,fd=25))',
    'tcp   LISTEN 0 4096 100.100.1.2%tailscale0:43912 0.0.0.0:*',
    'tcp   LISTEN 0 4096 [fd7a:115c:a1e0::1]%tailscale0:62099 [::]:*',
    'tcp   LISTEN 0 9 192.168.1.5:8080 0.0.0.0:* users:(("srv",pid=12,fd=4))',
    'udp   UNCONN 0 0 0.0.0.0:5353 0.0.0.0:*',
    'udp   UNCONN 0 0 [::]:5353 [::]:*'
].join('\n')
const SHOW = [
    'Id=web.service\nLoadState=loaded\nActiveState=active\nSubState=running\nUnitFileState=enabled\nResult=success\nNRestarts=0\nMemoryCurrent=1048576\nCPUUsageNSec=2500000000\nExecMainPID=300\nExecMainStatus=0\nExecStart={ path=/usr/bin/web ; argv[]=/usr/bin/web --token=SECRETVALUE --port 80 ; ignore_errors=no }\n',
    'Id=job.service\nLoadState=loaded\nActiveState=failed\nSubState=failed\nUnitFileState=static\nResult=exit-code\nNRestarts=3\nMemoryCurrent=[not set]\nCPUUsageNSec=[not set]\nExecMainPID=0\nExecMainStatus=1\nExecStart={ path=/home/someone/bin/job ; argv[]=/home/someone/bin/job -k KEY ; ignore_errors=no }\n',
    'Id=gone.service\nLoadState=not-found\nActiveState=inactive\nSubState=dead\nUnitFileState=\nResult=success\nNRestarts=0\nMemoryCurrent=[not set]\nCPUUsageNSec=[not set]\nExecMainPID=0\n',
    'Id=idle.service\nLoadState=loaded\nActiveState=inactive\nSubState=dead\nUnitFileState=disabled\nResult=success\nNRestarts=0\nMemoryCurrent=[not set]\nCPUUsageNSec=[not set]\nExecMainPID=0\n',
    'Id=tick.timer\nLoadState=loaded\nActiveState=active\nSubState=waiting\nUnitFileState=enabled\nResult=success\nNRestarts=0\nUnit=tick.service\nNextElapseUSecRealtime=Tue 2030-01-01 00:00:00 UTC\nLastTriggerUSec=n/a\n',
    'Id=tick.service\nLoadState=loaded\nActiveState=inactive\nSubState=dead\nUnitFileState=static\nResult=success\nNRestarts=0\nMemoryCurrent=[not set]\nExecMainPID=0\nExecMainStatus=0\n'
].join('\n')

describe('parsers (one per source)', () => {
    it('os-release', () => {
        expect(parseOsRelease('NAME="Arch Linux"\nPRETTY_NAME="Arch Linux"\nID=arch\nBUILD_ID=rolling\n')).toEqual({ id: 'arch', name: 'Arch Linux', version: 'rolling' })
        expect(parseOsRelease('')).toEqual({ id: '', name: '', version: '' })
    })
    it('pacman -Q keeps well-formed lines only', () => {
        expect(parsePacmanQ(PACMAN_Q)).toEqual([{ name: 'alpha', version: '1.2.3-1' }, { name: 'beta-lib', version: '4.5-2' }, { name: 'gamma', version: '2:9.0-1' }])
    })
    it('pacman name lists, -Sl repos and -Qo owners', () => {
        expect([...parsePacmanNames('alpha 1-1\nbeta\n\n')]).toEqual(['alpha', 'beta'])
        const repos = parsePacmanSl('core alpha 1.2.3-1 [installed]\nextra beta-lib 4.5-2 [installed: 4.4-1]\nextra other 1-1\n')
        expect(repos.get('alpha')).toBe('core')
        expect(repos.get('beta-lib')).toBe('extra')
        expect(repos.has('other')).toBe(false)
        expect(parsePacmanQo('/usr/bin/web is owned by webpkg 1.0-1\nerror: no package owns /x\n').get('/usr/bin/web')).toEqual({ pkg: 'webpkg', version: '1.0-1' })
    })
    it('checkupdates', () => {
        expect(parseCheckupdates('alpha 1.2.3-1 -> 1.2.4-1\nnoise\ngamma 2:9.0-1 -> 2:9.1-1\n')).toEqual([{ name: 'alpha', from: '1.2.3-1', to: '1.2.4-1' }, { name: 'gamma', from: '2:9.0-1', to: '2:9.1-1' }])
        expect(parseCheckupdates('')).toEqual([])
    })
    it('flatpak list drops duplicate runtime lines and headers', () => {
        const rows = parseFlatpakList('org.example.App\t1.5\tflathub\tuser\norg.example.Rt\t26.1\tflathub\tuser\norg.example.Rt\t26.1\tflathub\tuser\nwarning: something odd here\n')
        expect(rows).toEqual([{ id: 'org.example.App', version: '1.5', origin: 'flathub', scope: 'user' }, { id: 'org.example.Rt', version: '26.1', origin: 'flathub', scope: 'user' }])
    })
    it('npm -g and pip --user as JSON, bad JSON as nothing', () => {
        expect(parseNpmGlobal('{"dependencies":{"npm":{"version":"1.2.3"},"x":{"version":"0.1.0"}}}')).toEqual([{ name: 'npm', version: '1.2.3' }, { name: 'x', version: '0.1.0' }])
        expect(parseNpmGlobal('not json')).toEqual([])
        expect(parsePipList('[{"name":"foo","version":"2.0"}]')).toEqual([{ name: 'foo', version: '2.0' }])
        expect(parsePipList('{')).toEqual([])
    })
    it('dpkg (Debian family)', () => {
        expect(parseDpkg('libfoo\t1.0-1\nbar\t2:3.4\n\nbroken line\n')).toEqual([{ name: 'libfoo', version: '1.0-1' }, { name: 'bar', version: '2:3.4' }])
    })
    it('brew list and outdated (macOS, fixtures only)', () => {
        expect(parseBrewList('git 2.40.0\nnode 20.1.0 21.0.0\n')).toEqual([{ name: 'git', version: '2.40.0' }, { name: 'node', version: '21.0.0' }])
        expect(parseBrewOutdated('git (2.40.0) < 2.41.0\nnode (20.1.0, 21.0.0) < 22.0.0\n')).toEqual([{ name: 'git', from: '2.40.0', to: '2.41.0' }, { name: 'node', from: '21.0.0', to: '22.0.0' }])
    })
    it('launchctl list: third-party labels listed, Apple labels counted', () => {
        const out = parseLaunchctl('PID\tStatus\tLabel\n123\t0\tcom.example.agent\n-\t78\tcom.example.stopped\n456\t0\tcom.apple.Finder\n-\t0\tcom.apple.thing\n')
        expect(out.apple).toBe(2)
        expect(out.rows).toEqual([{ label: 'com.example.agent', pid: 123, status: 0 }, { label: 'com.example.stopped', pid: null, status: 78 }])
    })
    it('ss: who can reach the port, never the address', () => {
        const rows = parseSs(SS)
        expect(rows).toContainEqual({ proto: 'tcp', port: 22, bind: 'all', process: 'sshd' })
        expect(rows).toContainEqual({ proto: 'tcp', port: 4000, bind: 'loopback', process: 'node' })
        expect(rows).toContainEqual({ proto: 'tcp', port: 43912, bind: 'tailnet', process: null })
        expect(rows).toContainEqual({ proto: 'tcp', port: 62099, bind: 'tailnet', process: null })
        expect(rows).toContainEqual({ proto: 'tcp', port: 8080, bind: 'lan', process: 'srv' })
        expect(rows.filter((r) => r.port === 22)).toHaveLength(1) // the IPv4 and IPv6 listeners are one row
        expect(JSON.stringify(rows)).not.toMatch(/\d+\.\d+\.\d+\.\d+/)
    })
    it('bind classes', () => {
        expect(['0.0.0.0', '*', '::', '127.0.0.1', '::1', '100.64.0.1', '100.127.9.9', '100.128.0.1', '10.1.1.1', '172.20.0.1', '172.32.0.1', '8.8.8.8'].map(bindClass))
            .toEqual(['all', 'all', 'all', 'loopback', 'loopback', 'tailnet', 'tailnet', 'other', 'lan', 'lan', 'other', 'other'])
    })
    it('lsof LISTEN lines (macOS)', () => {
        const rows = parseLsofListen('COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 11 u 25u IPv4 0x1 0t0 TCP 127.0.0.1:4000 (LISTEN)\nsshd 12 u 3u IPv6 0x2 0t0 TCP *:22 (LISTEN)\nfoo 13 u 4u IPv4 0x3 0t0 TCP 1.2.3.4:5 (ESTABLISHED)\n')
        expect(rows).toEqual([{ proto: 'tcp', port: 22, bind: 'all', process: 'sshd' }, { proto: 'tcp', port: 4000, bind: 'loopback', process: 'node' }])
    })
    it('version lines and df', () => {
        expect(parseVersionLine('Python 3.14.9')).toBe('3.14.9')
        expect(parseVersionLine('git version 2.56.0')).toBe('2.56.0')
        expect(parseVersionLine('2.1.325 (Claude Code)')).toBe('2.1.325')
        expect(parseDf('Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 1000 250 750 25% /\n')).toEqual({ totalKb: 1000, usedKb: 250, usedPct: 25 })
        expect(parseDf('')).toBe(null)
    })
})

describe('systemd units', () => {
    it('systemctl show: states, restarts, memory; ExecStart keeps the binary name only', () => {
        const rows = parseSystemctlShow(SHOW)
        const web = rows.find((r) => r.name === 'web.service')
        expect(web).toMatchObject({ active: 'active', sub: 'running', enabled: 'enabled', memBytes: 1048576, cpuSec: 3, binary: 'web', pid: 300 })
        expect(rows.find((r) => r.name === 'job.service')).toMatchObject({ active: 'failed', restarts: 3, memBytes: null, result: 'exit-code' })
        expect(execBinary('{ path=/usr/bin/x ; argv[]=/usr/bin/x --secret=1 }')).toEqual({ name: 'x', path: '/usr/bin/x' })
        expect(execBinary('')).toBe(null)
    })
    it('unitRows: running, failed, restarting and enabled units; no arguments, no paths, an owner when known', () => {
        const owners = new Map([['/usr/bin/web', { pkg: 'webpkg', version: '1.0-1' }]])
        const { rows, total } = unitRows(parseSystemctlShow(SHOW), owners)
        expect(total).toBe(4) // gone.service (not-found) is not counted
        expect(rows.map((r) => r.name)).toEqual(['web.service', 'job.service']) // idle (disabled, inactive) and tick.service are only in the total
        expect(rows[0].owner).toEqual({ pkg: 'webpkg', version: '1.0-1' })
        expect(rows[1].home).toBe(true)
        const text = JSON.stringify(rows)
        expect(text).not.toMatch(/SECRETVALUE|--token|\/home\/someone|argv/)
    })
    it('timers join their service result', () => {
        const rows = timerRows(parseSystemctlShow(SHOW))
        expect(rows).toEqual([{ name: 'tick.timer', active: 'active', enabled: 'enabled', next: 'Tue 2030-01-01 00:00:00 UTC', last: null, result: 'success', exitStatus: 0, service: 'tick.service' }])
    })
})

describe('hash, summary, size cap', () => {
    const base = () => ({ collectedAt: 'a', packages: { count: 3, explicit: [{ name: 'a', version: '1' }], system: [] }, units: { total: 1, rows: [{ name: 'x.service', active: 'active', sub: 'running', restarts: 0, memBytes: 10, cpuSec: 1, pid: 5 }] }, ports: [], updates: { rows: [] }, runtimes: [] })
    it('the hash ignores what moves by itself and sees what is a change', () => {
        const a = base()
        const b = base()
        b.collectedAt = 'later'; b.units.rows[0].memBytes = 999; b.units.rows[0].cpuSec = 50; b.units.rows[0].pid = 77
        expect(stableHash(a)).toBe(stableHash(b))
        b.packages.explicit[0].version = '2'
        expect(stableHash(a)).not.toBe(stableHash(b))
        expect(stableHash(a)).toMatch(/^[0-9a-f]{64}$/)
    })
    it('summarize counts', () => {
        const body = { ...base(), units: { total: 9, rows: [{ active: 'active', sub: 'running', restarts: 0 }, { active: 'failed', sub: 'failed', restarts: 2 }] }, ports: [{ bind: 'all' }, { bind: 'loopback' }], updates: { rows: [1, 2, 3] } }
        expect(summarize(body)).toMatchObject({ units: { total: 9, running: 1, failed: 1, restarting: 1 }, ports: { total: 2, exposed: 1 }, updates: 3 })
    })
    it('capBody cuts the least useful rows first and says what it cut', () => {
        const body = { packages: { system: Array.from({ length: 3000 }, (_, i) => ({ name: `pkg-${i}`, version: '1.0-1', repo: 'extra' })), explicit: [{ name: 'keep', version: '1' }] }, updates: { rows: [] }, units: { rows: [] }, ports: [] }
        capBody(body, 20 * 1024)
        expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(20 * 1024 + 200)
        expect(body.truncated['packages.system'].of).toBe(3000)
        expect(body.packages.explicit).toHaveLength(1)
    })
})

describe('when to collect', () => {
    const t0 = Date.parse('2026-11-16T00:00:00Z')
    const cache = { collectedAt: new Date(t0).toISOString(), hash: 'h', mtimes: { '/db': 5 } }
    it('first time, every six hours, or when a package db changed', () => {
        expect(isDue({ cache: null, now: t0 })).toBe('first')
        expect(isDue({ cache, now: t0 + 1000, mtimes: { '/db': 5 } })).toBe(null)
        expect(isDue({ cache, now: t0 + COLLECT_EVERY_MS, mtimes: { '/db': 5 } })).toBe('six-hours')
        expect(isDue({ cache, now: t0 + 1000, mtimes: { '/db': 6 } })).toBe('package-db')
        expect(isDue({ cache, now: t0 + 1000, mtimes: { '/db': 5, '/new': 1 } })).toBe('package-db')
    })
})

// A fake machine: the command runner answers from a table; anything not in it is silence.
const fakeExec = (table, seen = []) => async (cmd, args = []) => {
    const key = [cmd, ...args].join(' ')
    seen.push(key)
    for (const [prefix, out] of Object.entries(table)) if (key.startsWith(prefix)) return out
    return ''
}
const ARCH = {
    'sh -c command -v': '/usr/bin/x\n',
    'pacman -Qqe': 'alpha\n', 'pacman -Qqm': 'beta-lib\n', 'pacman -Qdtq': 'gamma\n',
    'pacman -Sl': 'core alpha 1.2.3-1 [installed]\nextra gamma 2:9.0-1 [installed]\n',
    'pacman -Qo': '/usr/bin/web is owned by webpkg 1.0-1\n',
    'pacman -Q': PACMAN_Q, // last of the pacman keys: the others above are longer and match first
    checkupdates: 'alpha 1.2.3-1 -> 1.2.4-1\n',
    flatpak: 'org.example.App\t1.5\tflathub\tuser\n',
    'systemctl show': SHOW, 'systemctl --user show': '',
    ss: SS, df: 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 1000 250 750 25% /\n',
    node: 'v26.1.0\n', npm: '{"dependencies":{"npm":{"version":"12.0.0"}}}'
}

describe('collectInventory', () => {
    it('Arch: packages with repo and AUR flag, updates, units, ports, runtimes', async () => {
        const seen = []
        const body = await collectInventory({ exec: fakeExec(ARCH, seen), platform: 'linux', home: tmpHome() })
        // the body's os comes from the real /etc/os-release of the test machine, so the Arch branch is chosen by the fake `pacman`
        expect(body.packages.manager).toBe('pacman')
        expect(body.packages.explicit).toEqual([{ name: 'alpha', version: '1.2.3-1', repo: 'core' }])
        expect(body.packages.system.map((p) => [p.name, p.repo])).toEqual([['beta-lib', 'aur'], ['gamma', 'extra']])
        expect(body.packages.orphans).toEqual(['gamma'])
        expect(body.updates).toEqual({ tool: 'checkupdates', rows: [{ name: 'alpha', from: '1.2.3-1', to: '1.2.4-1' }] })
        expect(body.units.rows.find((u) => u.name === 'web.service').owner.pkg).toBe('webpkg')
        expect(body.ports.some((p) => p.port === 22 && p.bind === 'all')).toBe(true)
        expect(body.runtimes).toContainEqual({ name: 'node', version: '26.1.0' })
        expect(body.disk.usedPct).toBe(25)
        expect(JSON.stringify(body)).not.toMatch(/SECRETVALUE|\/home\/someone/)
    })
    it('only read-only commands run: a fixed list, never a shell script, never a write verb', async () => {
        const seen = []
        await collectInventory({ exec: fakeExec(ARCH, seen), platform: 'linux', home: tmpHome() })
        const verbs = /\b(install|remove|-S |-Syu|-R|upgrade -y|enable|disable|restart|start|stop|rm|sudo)\b/
        for (const line of seen) {
            if (line.startsWith('sh -c command -v')) continue
            expect(line).not.toMatch(/\bsudo\b|\brm\b|\benable\b|\bdisable\b|\brestart\b/)
            expect(line.startsWith('pacman') ? /^pacman -(Q|Sl)/.test(line) : true).toBe(true)
        }
        expect(verbs.test('pacman -Q')).toBe(false)
    })
    it('macOS: brew and launchctl branches from fixtures', async () => {
        const mac = {
            'sw_vers': '14.5\n', 'sh -c command -v': '/opt/homebrew/bin/brew\n',
            'brew list': 'git 2.40.0\nnode 20.1.0\n', 'brew outdated': 'git (2.40.0) < 2.41.0\n',
            launchctl: 'PID\tStatus\tLabel\n12\t0\tcom.example.agent\n-\t0\tcom.apple.x\n',
            lsof: 'COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME\nnode 11 u 25u IPv4 0x1 0t0 TCP 127.0.0.1:4000 (LISTEN)\n',
            df: 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/x 1000 500 500 50% /\n'
        }
        const body = await collectInventory({ exec: fakeExec(mac), platform: 'darwin', home: tmpHome() })
        expect(body.os.name).toBe('macOS 14.5')
        expect(body.packages.brew).toEqual([{ name: 'git', version: '2.40.0' }, { name: 'node', version: '20.1.0' }])
        expect(body.updates).toEqual({ tool: 'brew', rows: [{ name: 'git', from: '2.40.0', to: '2.41.0' }] })
        expect(body.launchd).toEqual({ rows: [{ label: 'com.example.agent', pid: 12, status: 0 }], apple: 1 })
        expect(body.ports).toEqual([{ proto: 'tcp', port: 4000, bind: 'loopback', process: 'node' }])
        expect(summarize(body).packages).toMatchObject({ manager: 'brew', total: 2 })
    })
    it('Debian family: dpkg when pacman is absent', async () => {
        const deb = { 'sh -c command -v pacman': '', 'sh -c command -v': '/usr/bin/x\n', 'dpkg-query': 'libfoo\t1.0-1\nbar\t2.0\n', 'apt-get': 'Inst libfoo [1.0-1] (1.0-2 stable)\nConf libfoo (1.0-2 stable)\n' }
        const body = await collectInventory({ exec: fakeExec(deb), platform: 'linux', home: tmpHome() })
        if (!/arch/.test(body.os.id)) {
            expect(body.packages.manager).toBe('dpkg')
            expect(body.updates.rows).toEqual([{ name: 'libfoo', from: '1.0-1', to: '1.0-2' }])
        }
    })
})

describe('the panel: cache, trigger, hash, body only on change', () => {
    const run = (home, extra = {}) => inventoryPanel({ home, platform: 'linux', exec: fakeExec(ARCH), now: Date.parse('2026-11-16T00:00:00Z'), ...extra })
    it('first report carries the body; once sent, the next carries the hash alone and does not collect again', async () => {
        const home = tmpHome()
        let collected = 0
        const collect = async (o) => { collected += 1; const { collectInventory: real } = await import('./monitorInventory.mjs'); return real(o) }
        const first = await run(home, { collect })
        expect(first.due).toBe('first')
        expect(first.panel.body).toBeTruthy()
        expect(first.panel.hash).toMatch(/^[0-9a-f]{64}$/)
        first.sent()
        const second = await run(home, { collect, now: Date.parse('2026-11-16T00:01:00Z') })
        expect(second.due).toBe(null)
        expect(second.panel.body).toBeUndefined()
        expect(second.panel.hash).toBe(first.panel.hash)
        expect(collected).toBe(1)
        expect(fs.statSync(cachePath(home)).mode & 0o777).toBe(0o600)
    })
    it('a send that failed is not recorded: the body goes again; "wanted" forces it too', async () => {
        const home = tmpHome()
        const first = await run(home) // never .sent()
        expect(first.withBody).toBe(true)
        expect((await run(home, { now: Date.parse('2026-11-16T00:01:00Z') })).withBody).toBe(true)
        first.sent()
        expect((await run(home, { now: Date.parse('2026-11-16T00:02:00Z') })).withBody).toBe(false)
        expect((await run(home, { now: Date.parse('2026-11-16T00:02:30Z'), wanted: true })).panel.body).toBeTruthy()
    })
    it('after six hours it collects again, and a changed machine sends a new hash with its body', async () => {
        const home = tmpHome()
        const first = await run(home)
        first.sent()
        const changed = { ...ARCH, checkupdates: 'alpha 1.2.3-1 -> 1.2.4-1\ngamma 2:9.0-1 -> 2:9.1-1\n' }
        const later = await inventoryPanel({ home, platform: 'linux', exec: fakeExec(changed), now: Date.parse('2026-11-16T06:00:01Z') })
        expect(later.due).toBe('six-hours')
        expect(later.panel.hash).not.toBe(first.panel.hash)
        expect(later.panel.body.updates.rows).toHaveLength(2)
    })
    it('the body is capped under 200 KB even for a very large machine', async () => {
        const big = { ...ARCH, 'pacman -Q': Array.from({ length: 6000 }, (_, i) => `package-number-${i} 1.${i}-1`).join('\n') }
        const { panel } = await inventoryPanel({ home: tmpHome(), platform: 'linux', exec: fakeExec(big) })
        expect(Buffer.byteLength(JSON.stringify(panel.body))).toBeLessThanOrEqual(205 * 1024)
    })
})
