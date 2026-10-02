// @vitest-environment node
//
// di.iiii comes back by itself (owner, 2026-10-02: "you install the di., it
// opens in browser and everything you do from there" → "yes go fix"). The
// install writes one autostart entry that runs `di autostart run`; the loop
// starts the server when it is not running. Its three rules are below.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { autostartState, isStopped, keepDecision, markStopped, runAutostartLoop, turnOffAutostart, turnOnAutostart } from './autostart.mjs'
import { DI_ENTRY, STAGE, autostartSpec } from './stagePlan.mjs'

let home
let configHome
let savedConfig
beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'di-autostart-'))
    configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'di-autostart-config-'))
    savedConfig = process.env.XDG_CONFIG_HOME
    process.env.XDG_CONFIG_HOME = configHome
})
afterEach(() => {
    if (savedConfig === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = savedConfig
    fs.rmSync(home, { recursive: true, force: true })
    fs.rmSync(configHome, { recursive: true, force: true })
})

const loop = async ({ alive = [], stage = false, before = null, ticks }) => {
    const starts = []
    const lines = []
    let tick = 0
    if (before) await before()
    await runAutostartLoop({
        home,
        isAlive: async () => alive[Math.min(tick, alive.length - 1)] ?? false,
        start: () => { starts.push(tick); return { ok: true, output: '' } },
        stage: () => stage,
        sleep: async () => { tick += 1 },
        log: (line) => lines.push(line),
        ticks
    })
    return { starts, lines }
}

describe('one tick', () => {
    it('starts only what is down, not stopped on purpose, and not on a stage machine', () => {
        expect(keepDecision({ alive: false, stopped: false, stage: false })).toBe('start')
        expect(keepDecision({ alive: true, stopped: false, stage: false })).toBe('running')
        expect(keepDecision({ alive: false, stopped: true, stage: false })).toBe('stopped')
        expect(keepDecision({ alive: false, stopped: false, stage: true })).toBe('stage')
    })
})

describe('the loop', () => {
    it('brings a server back that went down, and leaves a running one alone', async () => {
        const { starts } = await loop({ alive: [true, true, false, true, true], ticks: 5 })
        expect(starts).toEqual([2])
    })

    it('obeys di down: a stop made while it runs stays stopped, and di up lifts it', async () => {
        const starts = []
        let tick = 0
        await runAutostartLoop({
            home,
            // tick 1: the person types `di down` (mark, then the server is gone)
            // tick 3: the person types `di up` (mark lifted, still down for one tick)
            isAlive: async () => {
                if (tick === 1) await markStopped(home)
                if (tick === 3) fs.rmSync(path.join(home, 'run', 'stopped'), { force: true })
                return tick === 0
            },
            start: () => { starts.push(tick); return { ok: true, output: '' } },
            stage: () => false,
            sleep: async () => { tick += 1 },
            ticks: 4
        })
        expect(starts).toEqual([3])
    })

    it('a login is a fresh start: a stop left from before the restart is cleared, and it starts', async () => {
        const { starts } = await loop({ alive: [false, true], ticks: 2, before: () => markStopped(home) })
        expect(isStopped(home)).toBe(false)
        expect(starts).toEqual([0])
    })

    it('does nothing on a stage machine — the stage supervisor owns the server there', async () => {
        const { starts, lines } = await loop({ alive: [false], stage: true, ticks: 3 })
        expect(starts).toEqual([])
        expect(lines.join('\n')).toContain('stage supervisor')
    })
})

describe('the entry', () => {
    it('is the stage shape under its own names, never overwriting the stage entry', () => {
        const spec = autostartSpec({
            platform: 'linux', home: '/h/.di', node: '/n', cli: '/h/.di/current/cli/cli.mjs', configHome: '/h/.config',
            names: DI_ENTRY, args: ['autostart', 'run']
        })
        expect(spec.path).toBe('/h/.config/systemd/user/di-iiii.service')
        expect(spec.content).toContain('ExecStart=/n /h/.di/current/cli/cli.mjs autostart run')
        expect(spec.content).toContain('Restart=always')
        // the server is detached and must survive the loop being restarted
        expect(spec.content).toContain('KillMode=process')
        for (const key of Object.keys(DI_ENTRY)) expect(DI_ENTRY[key]).not.toBe(STAGE[key])
        // and the stage entry itself is unchanged by this
        const stage = autostartSpec({ platform: 'linux', home: '/h/.di', node: '/n', cli: '/c', configHome: '/h/.config' })
        expect(stage.content).toContain('/c stage run')
        expect(stage.content).not.toContain('KillMode')
    })

    it('on the Mac: a LaunchAgent with KeepAlive that leaves the server alone when it restarts', () => {
        const spec = autostartSpec({
            platform: 'darwin', home: '/Users/a/.di', node: '/n', cli: '/c', userHome: '/Users/a', uid: 501,
            names: DI_ENTRY, args: ['autostart', 'run']
        })
        expect(spec.path).toBe('/Users/a/Library/LaunchAgents/studio.thedi.di-iiii.plist')
        expect(spec.content).toContain('<string>autostart</string>')
        expect(spec.content).toContain('<key>AbandonProcessGroup</key>')
    })

    it('on Windows: a logon task that restarts on failure, named di.iiii', () => {
        const spec = autostartSpec({
            platform: 'win32', home: 'C:\\Users\\a\\.di', node: 'C:\\n.exe', cli: 'C:\\c.mjs', user: 'a',
            names: DI_ENTRY, args: ['autostart', 'run']
        })
        expect(spec.install[0].args).toContain('di.iiii')
        expect(spec.content).toContain('autostart run')
        expect(spec.content).toContain('<RestartOnFailure>')
    })

    it('on and off write and take back exactly one entry, recorded in state', async () => {
        const commands = []
        const run = (command) => { commands.push([command.command, ...command.args].join(' ')); return { ok: true, output: '' } }
        if (process.platform !== 'linux') return
        const on = await turnOnAutostart({ home, run })
        expect(on.spec.kind).toBe('systemd-user')
        const file = path.join(configHome, 'systemd', 'user', 'di-iiii.service')
        expect(fs.existsSync(file)).toBe(true)
        expect(autostartState(home).path).toBe(file)
        expect(commands).toContain('systemctl --user enable --now di-iiii.service')
        const off = await turnOffAutostart({ home, run })
        expect(off.was).toBe(true)
        expect(fs.existsSync(file)).toBe(false)
        expect(autostartState(home)).toBe(null)
        expect(commands).toContain('systemctl --user disable --now di-iiii.service')
        // nothing of ours left in the config dir
        expect(fs.readdirSync(configHome)).toEqual([])
    })
})
