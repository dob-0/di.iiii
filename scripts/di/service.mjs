/**
 * The installed server, supervised by systemd — on a Linux machine that has it.
 *
 * Without this, `di up` starts the server detached and walks away: if the
 * process dies (a crash, an OOM, a `pkill -f` aimed at a dev server — that
 * killed the owner's install three times in September 2026) nothing notices
 * and nothing starts it again. With it, the server is the MAIN process of a
 * systemd user unit, and systemd restarts it whenever it exits without being
 * asked to.
 *
 * Method, not invention — every key below is documented systemd behaviour:
 *   systemd.service(5)  Type=exec, Restart=always, RestartSec=, RestartSteps=,
 *                       RestartMaxDelaySec=, TimeoutStopSec=
 *   systemd.unit(5)     StartLimitIntervalSec=/StartLimitBurst= ([Unit]),
 *                       specifiers (%t = $XDG_RUNTIME_DIR, `%%` = a literal %)
 *   systemd.exec(5)     EnvironmentFile= (a leading `-` = optional; a later file
 *                       overrides an earlier one), SyslogIdentifier=
 *   sd_booted(3)        /run/systemd/system exists ⇔ the machine booted systemd
 *
 * Why Restart=always and not on-failure: SIGTERM — what `kill` and `pkill -f`
 * send — is a CLEAN exit for on-failure, so the very kill this exists for
 * would not be restarted. `systemctl stop` (what `di down` does) is never
 * restarted under either setting.
 *
 * Opt-in per install: `di service install` writes the unit and records its
 * name in state.json. No unit, or no systemd, and every command does exactly
 * what it did before — macOS, Windows and the machines without systemd are
 * not touched by this file.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

import { paths } from './paths.mjs'
import { readState, writeState } from './state.mjs'

export const DEFAULT_UNIT = 'di-server'

/** A unit name di may write: no template `@`, no path, no `.service` suffix typed twice. */
export const validUnitName = (name) => typeof name === 'string'
    && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(name)
    && !name.endsWith('.service')

/** `systemctl --user …`, synchronously. Injected in tests. */
export const systemctl = (args) => spawnSync('systemctl', ['--user', ...args], { encoding: 'utf8' })

/** Where a user unit is found — the directory `systemctl --user` reads (systemd.unit(5)). */
export const userUnitDir = (env = process.env) =>
    path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'systemd', 'user')

/** $XDG_RUNTIME_DIR: tmpfs, gone at reboot. `%t` in a user unit names the same directory. */
export const runtimeDir = (env = process.env) =>
    env.XDG_RUNTIME_DIR || `/run/user/${typeof process.getuid === 'function' ? process.getuid() : 0}`

export const servicePaths = (home, name, env = process.env) => ({
    unit: `${name}.service`,
    unitFile: path.join(userUnitDir(env), `${name}.service`),
    // Everything the server is started with, written by every `di up`. In
    // run/ beside the pid file, 0600: it carries di.env, which holds secrets.
    serverEnv: path.join(paths(home).run, 'server.env'),
    // Only THIS start's --lan / --guests. In the runtime dir so a reboot
    // forgets it: `--lan` is per start and never written down, and a machine
    // that rebooted comes back on loopback exactly as `di up` would.
    startEnv: path.join(runtimeDir(env), `${name}.start.env`)
})

/**
 * The node `di service install` ran with, while it is still there. A later
 * `di up` from a shell whose PATH puts another node first (the system's v26,
 * which cannot bind :443 on aylmo) must not swap the unit's node under it:
 * the install is re-pointed only by `di service install`.
 */
export const pinnedNode = (home, { exists = fs.existsSync } = {}) => {
    const node = readState(home).service?.node
    return typeof node === 'string' && node && exists(node) ? node : null
}

/** sd_booted(3), plus a user manager we can talk to. */
export const systemdUsable = ({ run = systemctl, platform = process.platform, exists = fs.existsSync } = {}) => {
    if (platform !== 'linux') return false
    if (!exists('/run/systemd/system')) return false
    try {
        return run(['show-environment']).status === 0
    } catch {
        return false
    }
}

/**
 * The unit this install is supervised by, or null. All three must hold:
 * state.json names it, its file is where systemd reads units, and systemd is
 * here to read it. Anything less is the detached path, as before.
 */
export const activeService = (home, { run = systemctl, env = process.env, usable = null } = {}) => {
    const name = readState(home).service?.name
    if (!validUnitName(name)) return null
    const sp = servicePaths(home, name, env)
    if (!fs.existsSync(sp.unitFile)) return null
    const ok = usable === null ? systemdUsable({ run }) : usable
    return ok ? { name, ...sp } : null
}

// ── text ──────────────────────────────────────────────────────────────────

// In a unit file `%` starts a specifier; a path that contains one must say `%%`.
const unitEscape = (value) => String(value).replace(/%/g, '%%')
// ExecStart= splits on whitespace; a double-quoted word may contain spaces.
const execWord = (value) => `"${unitEscape(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/**
 * The unit, as text. Pure. It names `<home>/current`, never a version: an
 * update flips `current` between a stop and a start, and the same unit then
 * runs the new build without being rewritten.
 */
export const unitText = ({ name, home, node }) => {
    const current = path.join(home, 'current')
    const sp = servicePaths(home, name)
    return [
        `# Written by \`di service install\`; rewritten by every \`di up\`. Remove with \`di service remove\`.`,
        '# di.iiii\'s installed server, supervised by systemd: restarted whenever it exits unasked.',
        '[Unit]',
        `Description=di.iiii server (${unitEscape(home)})`,
        // Ten starts in five minutes and systemd stops trying and marks the
        // unit failed — a server that cannot start (its port taken, its data
        // unreadable) is not hammered forever. `di status` says so; `di up`
        // clears it.
        'StartLimitIntervalSec=300',
        'StartLimitBurst=10',
        '',
        '[Service]',
        // exec: the unit is "started" once node itself is running, and node IS
        // the main process — the pid systemd watches is the server's.
        'Type=exec',
        `WorkingDirectory=${unitEscape(path.join(current, 'serverXR'))}`,
        `EnvironmentFile=${unitEscape(sp.serverEnv)}`,
        `EnvironmentFile=-%t/${name}.start.env`,
        `ExecStart=${execWord(node)} ${execWord(path.join(current, 'serverXR', 'src', 'index.js'))}`,
        'Restart=always',
        'RestartSec=2',
        // Back-off 2 s → 60 s over five restarts (systemd ≥ 254). An older
        // systemd ignores these two keys with a warning and keeps 2 s.
        'RestartSteps=5',
        'RestartMaxDelaySec=60',
        // `di down` used to wait 8 s, then SIGKILL. Same here.
        'TimeoutStopSec=10',
        `SyslogIdentifier=${name}`,
        '',
        '[Install]',
        'WantedBy=default.target',
        ''
    ].join('\n')
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * One value as systemd's EnvironmentFile parser reads it back unchanged:
 * single quotes are literal; a value with a single quote in it goes in double
 * quotes, where `\`, `"`, `` ` `` and `$` are escaped (systemd.exec(5),
 * "EnvironmentFile=", shell-like quoting).
 */
export const envValue = (value) => {
    const text = String(value)
    if (!text.includes('\'')) return `'${text}'`
    return `"${text.replace(/[\\"`$]/g, (c) => `\\${c}`)}"`
}

/** An environment as an EnvironmentFile. Pure. Names systemd would refuse are left out. */
export const envFileText = (env) => `${Object.entries(env)
    .filter(([key, value]) => ENV_NAME.test(key) && value !== null && value !== undefined && !String(value).includes('\n'))
    .map(([key, value]) => `${key}=${envValue(value)}`)
    .join('\n')}\n`

/** What `want` sets that `base` does not set the same way: the per-start overrides. */
export const envDelta = (want, base) => Object.fromEntries(
    Object.entries(want).filter(([key, value]) => base[key] !== value)
)

// ── state of the unit ─────────────────────────────────────────────────────

export const unitStatus = (svc, { run = systemctl } = {}) => {
    const shown = run(['show', svc.unit, '-p', 'ActiveState,SubState,MainPID,NRestarts,Result,UnitFileState'])
    const out = {}
    for (const line of String(shown?.stdout || '').split('\n')) {
        const eq = line.indexOf('=')
        if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1)
    }
    return {
        active: out.ActiveState === 'active' || out.ActiveState === 'activating' || out.ActiveState === 'reloading',
        state: out.ActiveState || 'unknown',
        sub: out.SubState || '',
        mainPid: Number(out.MainPID) || 0,
        restarts: Number(out.NRestarts) || 0,
        result: out.Result || '',
        enabled: out.UnitFileState || ''
    }
}

const writeIfChanged = async (file, text, mode) => {
    let before = null
    try { before = await fsp.readFile(file, 'utf8') } catch { /* new */ }
    if (before === text) return false
    await fsp.mkdir(path.dirname(file), { recursive: true })
    await fsp.writeFile(file, text, mode ? { mode } : undefined)
    if (mode) { try { await fsp.chmod(file, mode) } catch { /* no modes here */ } }
    return true
}

const check = (result, what) => {
    if (result?.status === 0) return result
    const why = String(result?.stderr || result?.error?.message || '').trim()
    throw new Error(`systemctl --user ${what} failed${why ? `: ${why}` : ''}`)
}

/**
 * Write the unit (only if it changed) and both environment files. Called by
 * `di service install` and by every supervised `di up`, so the unit always
 * names the node and the home this CLI is running with.
 */
export const writeUnit = async ({ svc, home, node, serverEnv, startEnv = {}, run = systemctl }) => {
    await fsp.mkdir(paths(home).run, { recursive: true })
    await writeIfChanged(svc.serverEnv, envFileText(serverEnv), 0o600)
    if (Object.keys(startEnv).length) {
        await writeIfChanged(svc.startEnv, envFileText(startEnv), 0o600)
    } else {
        await fsp.rm(svc.startEnv, { force: true })
    }
    if (await writeIfChanged(svc.unitFile, unitText({ name: svc.name, home, node }))) {
        check(run(['daemon-reload']), 'daemon-reload')
    }
}

/** Start (or restart) the unit, clearing a give-up first so `di up` always gets a fresh try. */
export const startUnit = (svc, { run = systemctl } = {}) => {
    run(['reset-failed', svc.unit])
    check(run(['restart', svc.unit]), `restart ${svc.unit}`)
}

/** Stop it for good — systemd never restarts a unit it was asked to stop. */
export const stopUnit = async (svc, { run = systemctl } = {}) => {
    const was = unitStatus(svc, { run }).active
    if (was) check(run(['stop', svc.unit]), `stop ${svc.unit}`)
    await fsp.rm(svc.startEnv, { force: true })
    return was
}

export const journalTail = (svc, lines = 20, { spawn = spawnSync } = {}) => {
    try {
        const out = spawn('journalctl', ['--user', '-u', svc.unit, '-n', String(lines), '--no-pager', '-o', 'short-iso'], { encoding: 'utf8' })
        return String(out?.stdout || '').trimEnd()
    } catch {
        return ''
    }
}

// ── install / remove ──────────────────────────────────────────────────────

/** Record the unit and enable it at login. Does not start it — the caller decides. */
export const installService = async ({ home, name = DEFAULT_UNIT, node, serverEnv, run = systemctl, env = process.env }) => {
    const svc = { name, ...servicePaths(home, name, env) }
    await writeUnit({ svc, home, node, serverEnv, run })
    check(run(['daemon-reload']), 'daemon-reload')
    check(run(['enable', svc.unit]), `enable ${svc.unit}`)
    await writeState(home, { service: { name, unitFile: svc.unitFile, node } })
    return svc
}

/** Undo `installService` exactly: stop, disable, delete what it wrote, forget the name. */
export const removeService = async ({ home, run = systemctl, env = process.env }) => {
    const name = readState(home).service?.name
    if (!validUnitName(name)) return null
    const svc = { name, ...servicePaths(home, name, env) }
    run(['disable', '--now', svc.unit])
    for (const file of [svc.unitFile, svc.startEnv, svc.serverEnv]) await fsp.rm(file, { force: true })
    run(['daemon-reload'])
    run(['reset-failed', svc.unit])
    await writeState(home, { service: null })
    return svc
}
