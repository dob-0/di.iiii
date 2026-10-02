/**
 * di autostart — di.iiii comes back by itself.
 *
 * The one-line install opens di.iiii in the browser, and from then on the
 * page is where the work happens. A page needs its server, and nobody should
 * have to open a terminal after a restart to bring it back. So the install
 * leaves one autostart entry — the same four OS shapes the stage machine uses
 * (stagePlan.mjs `autostartSpec`), under di.iiii's own names (`DI_ENTRY`) — and
 * that entry runs `di autostart run`: a small loop that starts the server when it is not
 * running and leaves it alone when it is.
 *
 * Three rules, each a test in autostart.test.js:
 *
 *   1. `di down` is obeyed. It leaves a `run/stopped` mark; the loop sees it and
 *      waits. `di up` takes the mark away. Without this, stopping di.iiii would
 *      be a fight the person loses five seconds later.
 *   2. A login is a fresh start. The mark is cleared when the loop itself starts,
 *      so a di.iiii stopped yesterday is running again after today's restart —
 *      which is the whole point of the entry.
 *   3. On a stage machine the loop does nothing: the stage supervisor already owns
 *      the server there, and two loops starting one server race for its port.
 *
 * The service manager supervises the loop (Restart=always, KeepAlive, a
 * scheduled task's restart-on-failure); the loop supervises the server. The
 * server is its own detached process, so a restarted loop finds it alive and
 * moves on.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { paths } from './paths.mjs'
import { cliEntry, installAutostart, isStageMachine, runStep } from './stage.mjs'
import { DI_ENTRY } from './stagePlan.mjs'
import { alive, readState, resolvePort, writeState } from './state.mjs'

/** How often the loop looks. The same tick as the stage supervisor. */
export const KEEP_MS = 5000

export const stoppedFile = (home) => path.join(paths(home).run, 'stopped')
export const isStopped = (home) => fs.existsSync(stoppedFile(home))

/** `di down`: the person stopped it on purpose, and the loop must not undo that. */
export const markStopped = async (home) => {
    await fsp.mkdir(paths(home).run, { recursive: true })
    await fsp.writeFile(stoppedFile(home), `${new Date().toISOString()}\n`)
}

/** `di up`, and the loop at login: running is what is wanted again. */
export const clearStopped = (home) => fsp.rm(stoppedFile(home), { force: true })

/** One tick, decided with no I/O. */
export const keepDecision = ({ alive: up, stopped, stage }) => {
    if (stage) return 'stage'
    if (stopped) return 'stopped'
    if (up) return 'running'
    return 'start'
}

/** Start the server the way a person would: through `up`, so every rule of a start holds. */
const startServer = (home) => {
    const result = spawnSync(process.execPath, [cliEntry(home), 'up', '--no-open'], {
        encoding: 'utf8',
        windowsHide: true,
        env: { ...process.env, DI_HOME: home }
    })
    return { ok: result.status === 0, output: `${result.stdout || ''}${result.stderr || ''}`.trim() }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The loop. Everything it touches is injectable, so the tests run it for a
 * few ticks without a server, a clock or an OS.
 */
export const runAutostartLoop = async ({
    home,
    isAlive = () => alive(home, resolvePort(home)),
    start = () => startServer(home),
    stage = () => isStageMachine(home),
    sleep = pause,
    log = () => {},
    ticks = Infinity
} = {}) => {
    await clearStopped(home)
    log('keeping di.iiii running')
    let last = null
    for (let tick = 0; tick < ticks; tick += 1) {
        const decision = keepDecision({ alive: await isAlive(), stopped: isStopped(home), stage: stage() })
        if (decision !== last && decision !== 'start') log(decision === 'stopped' ? 'stopped with di down — waiting for di up' : decision === 'stage' ? 'a stage machine — the stage supervisor keeps the server' : 'running')
        if (decision === 'start') {
            const result = start()
            log(result.ok ? 'started' : `did not start: ${result.output.split('\n').slice(-3).join(' / ')}`)
        }
        last = decision
        await sleep(KEEP_MS)
    }
}

/** The words each OS shows for the entry. */
export const DI_ENTRY_WORDS = {
    task: 'di.iiii — starts at logon and keeps it running (di autostart run). Remove with: di autostart off',
    startup: 'di.iiii — written by the install, removed by: di autostart off',
    unit: 'di.iiii — starts at login and keeps it running (di autostart run)',
    desktop: 'di.iiii',
    comment: 'Starts di.iiii at login. Remove with: di autostart off'
}

/**
 * Write the entry and remember exactly what was written, so `off` and
 * `uninstall` take back that and nothing else.
 */
export const turnOnAutostart = async ({ home, run = runStep } = {}) => {
    const result = await installAutostart({
        home,
        run,
        entry: { names: DI_ENTRY, args: ['autostart', 'run'], words: DI_ENTRY_WORDS, logFile: path.join(paths(home).logs, 'autostart.log') }
    })
    if (result.spec) {
        const { kind, path: file, remove, restartsOnFailure, note } = result.spec
        await writeState(home, { autostart: { kind, path: file, remove, madeDirs: result.madeDirs || [], restartsOnFailure, note } })
    }
    return result
}

export const autostartState = (home) => readState(home).autostart || null

export const turnOffAutostart = async ({ home, run = runStep } = {}) => {
    const entry = autostartState(home)
    if (!entry) return { was: false }
    for (const command of entry.remove || []) run(command)
    if (entry.path) await fsp.rm(entry.path, { force: true })
    for (const dir of [...(entry.madeDirs || [])].reverse()) await fsp.rm(dir, { recursive: true, force: true })
    await writeState(home, { autostart: null })
    return { was: true, kind: entry.kind }
}
