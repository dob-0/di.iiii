/**
 * `di autoupdate` — the install keeps itself on its channel, with no hands.
 *
 * A systemd USER timer (no root) runs `di autoupdate run` every 15 minutes.
 * That command is the whole job: heat guard, then `di update --channel <c>`
 * (which keeps the stage → rehearse → backup → flip → rollback safety of a
 * hand-typed update), then ONE log line in ~/.di/logs/autoupdate.log and the
 * same facts in state.json for `di status`.
 *
 * Practice followed: systemd.timer(5) with Persistent=/OnCalendar= for a
 * job that must survive reboots and catch up after sleep; user units via
 * `systemctl --user` with `loginctl enable-linger` for running with nobody
 * logged in (the unattended-upgrades model on Debian does the same with a
 * system timer). Linux only here; Windows and macOS are named, not built.
 *
 * Nothing in this file runs a command at import. The system is reached
 * through injected functions, so the tests drive it without a clock, a CPU
 * sensor or systemd.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { paths } from './paths.mjs'
import { readState, writeState } from './state.mjs'

export const EVERY_MINUTES = 15
export const HEAT_LIMIT_C = 85
export const UNIT = 'di-autoupdate'

export const logFile = (home) => path.join(paths(home).logs, 'autoupdate.log')

export const unitDir = (env = process.env, homedir = os.homedir()) =>
    path.join(env.XDG_CONFIG_HOME || path.join(homedir, '.config'), 'systemd', 'user')

/** The service and the timer, as the text that lands on disk. */
// The service runs under systemd's user PATH, where /usr/bin comes first: the
// shim then picked the system's node (v26 on aylmo, no cap_net_bind_service),
// the restarted server could not bind 443 and di stayed down after every
// update, silently (measured 2026-10-05: EACCES 127.0.0.1:443, then a pkexec
// prompt nobody was there to answer). The node that ran `di autoupdate on` goes
// first, so the update restarts di with the node it was installed with.
export const unitTexts = ({ home, shim, nodeDir = path.dirname(process.execPath) }) => {
    const service = [
        '# Written by `di autoupdate on`. Remove with `di autoupdate off`.',
        '[Unit]',
        'Description=di.iiii: update this install along its channel',
        'After=network-online.target',
        'Wants=network-online.target',
        '',
        '[Service]',
        'Type=oneshot',
        'Nice=10',
        `Environment=DI_HOME=${home}`,
        `Environment=PATH=${nodeDir}:/usr/local/bin:/usr/bin:/bin`,
        `ExecStart=${shim} autoupdate run`,
        ''
    ].join('\n')
    const timer = [
        '# Written by `di autoupdate on`. Remove with `di autoupdate off`.',
        '[Unit]',
        `Description=di.iiii: check for an update every ${EVERY_MINUTES} minutes`,
        '',
        '[Timer]',
        `OnCalendar=*:0/${EVERY_MINUTES}`,
        // A laptop that slept through a tick catches up when it wakes; a
        // reboot does not lose the schedule.
        'Persistent=true',
        'RandomizedDelaySec=60',
        `Unit=${UNIT}.service`,
        '',
        '[Install]',
        'WantedBy=timers.target',
        ''
    ].join('\n')
    return { service, timer }
}

/** `sensors` text → the CPU package temperature in °C, or null. */
export const parsePackageTemp = (text) => {
    const match = /Package id \d+:\s*\+?(-?\d+(?:\.\d+)?)\s*°?C/.exec(String(text || ''))
    return match ? Number(match[1]) : null
}

/**
 * The CPU package temperature. `sensors` first (what the owner reads on
 * aylmo), then the kernel's x86_pkg_temp thermal zone. null = unreadable,
 * and the caller says so rather than assuming it is cool.
 */
export const readPackageTemp = ({
    exec = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 5000 }),
    thermalRoot = '/sys/class/thermal'
} = {}) => {
    try {
        const out = exec('sensors', [])
        const fromSensors = parsePackageTemp(out?.stdout)
        if (fromSensors !== null) return fromSensors
    } catch { /* no lm-sensors */ }
    try {
        for (const zone of fs.readdirSync(thermalRoot)) {
            if (!zone.startsWith('thermal_zone')) continue
            const type = fs.readFileSync(path.join(thermalRoot, zone, 'type'), 'utf8').trim()
            if (type !== 'x86_pkg_temp') continue
            return Number(fs.readFileSync(path.join(thermalRoot, zone, 'temp'), 'utf8')) / 1000
        }
    } catch { /* not Linux, or no such zone */ }
    return null
}

const line = (now, outcome, detail) => `${now.toISOString()} ${outcome}${detail ? ` ${detail}` : ''}\n`

/**
 * One run of the job. Always appends exactly one line to the log and records
 * the same in state.json — a failure is a line that says why, never silence.
 *
 *   skipped-heat · up-to-date · pending · updated · failed
 */
export const runAutoUpdate = async ({
    home,
    now = () => new Date(),
    temp = () => readPackageTemp(),
    update = async () => ({ code: 1, output: 'no update runner' }),
    heatLimit = HEAT_LIMIT_C
}) => {
    const p = paths(home)
    const at = now()
    const state = readState(home)
    const channel = state.channel || 'stable'
    let outcome
    let detail = ''
    let error = null
    let updated = null

    try {
        const degrees = temp()
        if (degrees !== null && degrees > heatLimit) {
            outcome = 'skipped-heat'
            detail = `cpu package ${degrees} C > ${heatLimit} C — not updating while hot`
        } else {
            const before = state.version || null
            const result = await update({ channel })
            const text = String(result.output || '').trim().split('\n').filter(Boolean).pop() || ''
            if (result.code !== 0) {
                outcome = 'failed'
                error = text || `di update exited ${result.code}`
                detail = `channel=${channel} ${error}`
            } else if (/already the newest|up to date|nothing to update to/i.test(text)) {
                outcome = 'up-to-date'
                detail = `channel=${channel} ${text}`
            } else if (/no dev build|try again/i.test(text)) {
                outcome = 'pending'
                detail = `channel=${channel} ${text}`
            } else {
                outcome = 'updated'
                updated = { at: at.toISOString(), from: before, channel }
                detail = `channel=${channel} ${text}`
            }
            if (degrees === null) detail += ' (cpu temperature unreadable, heat guard not applied)'
        }
    } catch (caught) {
        outcome = 'failed'
        error = String(caught?.message || caught)
        detail = error
    }

    await fsp.mkdir(p.logs, { recursive: true })
    await fsp.appendFile(logFile(home), line(at, outcome, detail))
    await writeState(home, {
        autoupdate: {
            lastCheck: at.toISOString(),
            lastOutcome: outcome,
            lastUpdate: updated ? updated.at : (state.autoupdate?.lastUpdate || null),
            lastError: error ? { at: at.toISOString(), message: error } : (state.autoupdate?.lastError || null)
        }
    })
    return { outcome, detail }
}

const systemctl = (args) => {
    const result = spawnSync('systemctl', ['--user', ...args], { encoding: 'utf8' })
    return { ok: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}`.trim() }
}

export const supported = (platform = process.platform) => platform === 'linux'

/** What Windows and macOS would need — said, because it is not built. */
export const unsupportedText = (platform = process.platform) => [
    `automatic updates are built for Linux only; this is ${platform}.`,
    platform === 'win32'
        ? '  equivalent: a Task Scheduler task running `di autoupdate run` every 15 minutes (schtasks /create /sc minute /mo 15).'
        : '  equivalent: a LaunchAgent with StartInterval 900 running `di autoupdate run`.',
    '  until then:  di update'
].join('\n')

export const enable = async ({ home, run = systemctl, dir = unitDir() }) => {
    const p = paths(home)
    const { service, timer } = unitTexts({ home, shim: p.shim })
    await fsp.mkdir(dir, { recursive: true })
    await fsp.writeFile(path.join(dir, `${UNIT}.service`), service)
    await fsp.writeFile(path.join(dir, `${UNIT}.timer`), timer)
    for (const args of [['daemon-reload'], ['enable', '--now', `${UNIT}.timer`]]) {
        const result = run(args)
        if (!result.ok) return { ok: false, why: result.output || `systemctl ${args.join(' ')} failed` }
    }
    return { ok: true }
}

export const disable = async ({ run = systemctl, dir = unitDir() } = {}) => {
    run(['disable', '--now', `${UNIT}.timer`])
    await fsp.rm(path.join(dir, `${UNIT}.timer`), { force: true })
    await fsp.rm(path.join(dir, `${UNIT}.service`), { force: true })
    run(['daemon-reload'])
    return { ok: true }
}

/** Facts for `di autoupdate status` and `di status`. Reads only. */
export const statusOf = ({ home, run = systemctl, dir = unitDir() }) => {
    const state = readState(home)
    const auto = state.autoupdate || {}
    const installed = fs.existsSync(path.join(dir, `${UNIT}.timer`))
    const active = installed ? run(['is-active', `${UNIT}.timer`]).ok : false
    return {
        installed,
        active,
        channel: state.channel || 'stable',
        lastCheck: auto.lastCheck || null,
        lastOutcome: auto.lastOutcome || null,
        lastUpdate: state.lastUpdate?.at ? `${state.lastUpdate.at} (${state.lastUpdate.from} -> ${state.lastUpdate.to}, ${state.lastUpdate.channel})` : (auto.lastUpdate || null),
        lastError: auto.lastError || null,
        log: logFile(home)
    }
}

export const statusLines = (s) => [
    `automatic updates  ${s.installed ? (s.active ? 'on' : 'installed, timer not active') : 'off'} · channel ${s.channel}`,
    `  last check   ${s.lastCheck ? `${s.lastCheck} (${s.lastOutcome})` : 'never'}`,
    `  last update  ${s.lastUpdate || 'never'}`,
    `  last error   ${s.lastError ? `${s.lastError.at} ${s.lastError.message}` : 'none'}`,
    `  log          ${s.log}`
]
