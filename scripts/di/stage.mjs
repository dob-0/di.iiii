/**
 * `di stage` — this machine becomes the one under the projector.
 *
 * The owner's stage box was hand-made: a hosts-file line, a .cmd with two
 * Chrome kiosks at fixed positions, a powercfg change, and an every-minute
 * keep-alive task. `docs/architecture/RIG.md` called it "hand-made on asuz, not
 * in the product". This is the product.
 *
 *   di stage join <space> --from <url>   one autostart entry, one supervisor
 *   di stage leave                       exactly that, undone
 *   di stage status                      the server, the follow, the screen
 *   di stage run                         the supervisor (what autostart calls)
 *   di stage restart                     put the supervisor back
 *
 * THE MANIFEST IS THE CONTRACT. `<DI_HOME>/stage/stage.json` records every
 * single thing join created — every file, every directory, the one env line,
 * the follow, the autostart entry and the commands that take it away. `leave`
 * replays that list and touches nothing else, ever. stageAutostart.test.js
 * proves a temp HOME comes back byte-identical.
 *
 * Everything decided rather than done lives in stagePlan.mjs, pure, so the
 * Windows and macOS entries this Linux CI cannot install are still tested.
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { readFollows, removeFollow, setFollow } from './follows.mjs'
import { followSpace } from './follow.mjs'
import { isWindows, paths } from './paths.mjs'
import * as docker from './runner-docker.mjs'
import * as node from './runner-node.mjs'
import {
    DEBUG_PORT, RECONCILE_MS, STAGE,
    autostartSpec, browserArgs, browserCandidates, chooseTarget, envTextRestore, envTextWith,
    fallbackKind, holdPage, leavePlan, manifestFor, SESSION_FILES, outUrl, pidFromSingletonLock, preferencesPatch,
    readOutTitle, reconcile, statusRows, versionVerdict, wakeCommand
} from './stagePlan.mjs'
import { alive, apiBase, installedVersion, publicUrl, readState, resolvePort } from './state.mjs'
import { probeDisplays } from './displayProbe.mjs'
import { displayDiff, placementVerdict, planDisplays, toWindowUnits } from './stageDisplays.mjs'

const runnerFor = (home) => (readState(home).mode === 'docker' ? docker : node)

export const stagePaths = (home) => {
    const p = paths(home)
    const root = path.join(home, 'stage')
    return {
        ...p,
        stage: root,
        manifest: path.join(root, 'stage.json'),
        hold: path.join(root, 'hold.html'),
        profile: path.join(root, 'browser'),
        autostartDir: path.join(root, 'autostart'),
        stageStatus: path.join(p.run, 'stage-status.json'),
        stagePid: path.join(p.run, 'stage.pid'),
        stageLog: path.join(p.logs, 'stage.log')
    }
}

export const readManifest = (home) => {
    try {
        const parsed = JSON.parse(fs.readFileSync(stagePaths(home).manifest, 'utf8'))
        return (parsed && parsed.format === STAGE.format) ? parsed : null
    } catch {
        return null
    }
}

const writeManifest = async (home, manifest) => {
    const sp = stagePaths(home)
    await fsp.mkdir(sp.stage, { recursive: true })
    await fsp.writeFile(sp.manifest, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
    return manifest
}

/** Has this machine joined a stage? Asked by `di down` and `di uninstall`. */
export const isStageMachine = (home) => Boolean(readManifest(home))

// ── small truths about processes ──────────────────────────────────────────

const pidAlive = (pid) => {
    if (!pid) return false
    try { process.kill(pid, 0); return true } catch { return false }
}

const readPidFile = (file) => {
    try {
        const pid = Number(String(fs.readFileSync(file, 'utf8')).trim())
        return Number.isFinite(pid) && pid > 0 ? pid : null
    } catch {
        return null
    }
}

const stopPid = (pid) => {
    if (!pidAlive(pid)) return false
    try {
        if (isWindows) spawnSync('taskkill', ['/pid', String(pid), '/t', '/f'])
        else process.kill(pid, 'SIGTERM')
    } catch { /* already gone */ }
    return true
}

const exists = (file) => { try { fs.accessSync(file); return true } catch { return false } }

/** Which of these is on this machine — a path, or a name on PATH. */
const findBrowser = (candidates) => {
    for (const candidate of candidates) {
        if (candidate.includes('/') || candidate.includes('\\')) {
            if (exists(candidate)) return candidate
            continue
        }
        const found = spawnSync(isWindows ? 'where' : 'which', [candidate], { encoding: 'utf8' })
        const first = String(found.stdout || '').split('\n')[0].trim()
        if (found.status === 0 && first) return first
    }
    return null
}

/**
 * The CLI the autostart entry calls: always through `current`, never the
 * version directory behind it. An update moves that symlink, and an entry
 * naming the old directory would keep starting a version that is no longer
 * installed — or nothing at all, after `di update` pruned it.
 */
export const cliEntry = (home) => path.join(home, 'current', 'cli', 'cli.mjs')

const nodeBinary = (home) => node.nodeBinary(home)

// ── asking the kiosk what it is showing ───────────────────────────────────

/**
 * The out page's own `document.title` — `out · <project> · ok|empty|all-off`.
 *
 * Over CDP's HTTP side (`/json/list`), which is a plain GET and needs no
 * websocket library in a CLI that ships without dependencies. It is a read, and
 * the only one `status` needs: the page already says why a wall is black, and
 * repeating that is better than guessing at it from here.
 */
export const readPages = async (debugPort = DEBUG_PORT, { timeoutMs = 1500 } = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: controller.signal })
        if (!response.ok) return []
        const list = await response.json()
        return (Array.isArray(list) ? list : [])
            .filter((target) => target?.type === 'page' && !String(target.url || '').startsWith('devtools://'))
            .map((target) => ({ id: String(target.id || ''), url: String(target.url || ''), title: String(target.title || ''), ws: String(target.webSocketDebuggerUrl || '') }))
    } catch {
        return []
    } finally {
        clearTimeout(timer)
    }
}

// ── which project this one screen shows ───────────────────────────────────

const askJson = async (url, { timeoutMs = 4000, token = null } = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
        })
        if (!response.ok) return null
        return await response.json()
    } catch {
        return null
    } finally {
        clearTimeout(timer)
    }
}

/**
 * The single-kiosk target: the space's one map project, or `--project`.
 *
 * There is no "kind" on a project row and there must not be one (see
 * serverXR/src/routes/projectRoutes.js) — a mapping is an ordinary document
 * with surfaces in it. So the only honest way to find the mapping is to read
 * the documents and count surfaces, which is what readMapProjects does, and
 * why naming one with `--project` is the fast path. The supervisor itself
 * goes through planDisplays, which applies this same rule when no mapping
 * names this machine.
 */
export const resolveTarget = async ({ home, port, spaceId, project = null }) => {
    if (project) return chooseTarget({ project })
    const projects = await readMapProjects({ home, port, spaceId })
    if (!projects.length) return { projectId: null, error: 'none', ids: [] }
    return chooseTarget({ projects })
}

// ── join ──────────────────────────────────────────────────────────────────

const autostartFor = (home, kind = null) => autostartSpec({
    platform: process.platform,
    kind,
    home,
    node: nodeBinary(home),
    cli: cliEntry(home),
    configHome: process.env.XDG_CONFIG_HOME
        ? path.resolve(process.env.XDG_CONFIG_HOME)
        : path.join(os.homedir(), '.config'),
    userHome: os.homedir(),
    startupDir: path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
        'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
    user: process.env.USERNAME || process.env.USER || os.userInfo().username,
    uid: typeof process.getuid === 'function' ? process.getuid() : 501,
    logFile: stagePaths(home).stageLog,
    join: (...parts) => path.join(...parts.filter(Boolean))
})

const runStep = ({ command, args }) => {
    const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true })
    return {
        ok: result.status === 0,
        output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
        error: result.error ? String(result.error.message || result.error) : null
    }
}

/**
 * Write the autostart entry and make the OS notice it.
 *
 * `run` is injected so the tests can record the commands instead of running
 * them — that is how the Windows scheduled task and the macOS LaunchAgent are
 * covered on a Linux CI, and it is why this function does not know what an OS
 * is.
 */
export const installAutostart = async ({ home, kind = null, run = runStep }) => {
    const preferred = autostartFor(home, kind)
    if (!preferred) return { spec: null, fallback: false, reason: 'no autostart entry exists for this platform' }
    const tried = []
    for (const spec of [preferred, kind ? null : (fallbackKind(process.platform) ? autostartFor(home, fallbackKind(process.platform)) : null)].filter(Boolean)) {
        // The entry lives outside DI_HOME — `~/.config/systemd/user`,
        // `~/Library/LaunchAgents`, the Startup folder. Whatever of that path
        // did not exist is written down, so leave takes back the folders it
        // made and leaves alone the ones it found.
        const madeDirs = missingAncestors(path.dirname(spec.path))
        await fsp.mkdir(path.dirname(spec.path), { recursive: true })
        await fsp.writeFile(spec.path, spec.content, spec.encoding === 'utf16le' ? { encoding: 'utf16le' } : {})
        if (spec.kind === 'windows-startup' || spec.kind === 'xdg-autostart') {
            try { await fsp.chmod(spec.path, 0o755) } catch { /* a filesystem without modes */ }
        }
        let ok = true
        let why = null
        for (const command of spec.install) {
            const result = run(command)
            if (!result.ok) { ok = false; why = result.output || result.error || `${command.command} refused`; break }
        }
        if (ok) return { spec, madeDirs, fallback: spec.kind !== preferred.kind, tried }
        tried.push({ kind: spec.kind, why })
        // It did not take. Take the file back off the machine before trying the
        // next one, or `leave` would have one entry recorded and two on disk.
        for (const command of spec.remove) run(command)
        await fsp.rm(spec.path, { force: true })
        for (const dir of [...madeDirs].reverse()) await fsp.rm(dir, { recursive: true, force: true })
    }
    return { spec: null, fallback: false, reason: tried[0]?.why || 'the OS refused every autostart entry', tried }
}

/**
 * The directories `mkdir -p` would create, and only those. Recorded one by one
 * so `leave` removes `<config>/systemd/user` without ever touching a
 * `<config>/systemd` that was already there.
 */
const missingAncestors = (dir) => {
    const made = []
    let cursor = path.resolve(dir)
    while (!exists(cursor)) {
        made.unshift(cursor)
        const parent = path.dirname(cursor)
        if (parent === cursor) break
        cursor = parent
    }
    return made
}

const dirNeeded = async (dir, created) => {
    const made = missingAncestors(dir)
    if (!made.length) return
    await fsp.mkdir(dir, { recursive: true })
    for (const path_ of made) created.push({ kind: 'dir', path: path_ })
}

/** One env line, set and written down so `leave` can put the exact line back. */
const setEnvLine = async (home, key, value, envSet) => {
    const file = paths(home).env
    const had = exists(file)
    const raw = had ? await fsp.readFile(file, 'utf8') : ''
    const { text, previous } = envTextWith(raw, key, value)
    await fsp.mkdir(home, { recursive: true })
    await fsp.writeFile(file, text, { mode: 0o600 })
    try { await fsp.chmod(file, 0o600) } catch { /* a filesystem without modes */ }
    envSet.push({ key, previous, fileExisted: had })
}

/**
 * What `join` would do, said before it does it — and the whole of `--dry-run`.
 * Pure enough to print on any machine, including the two whose autostart entry
 * this one cannot install.
 */
export const joinPlan = ({ home, spaceId, from, at = null, project = null, browser = null, name = null }) => {
    const sp = stagePaths(home)
    const spec = autostartFor(home)
    return {
        follow: { spaceId, from, at },
        writes: [sp.stage, sp.hold, sp.profile, sp.stageLog, sp.stageStatus, sp.stagePid].map((file) => file),
        env: [['DI_PART', 'stage'], ...(name ? [['DI_MACHINE_NAME', name]] : [])],
        autostart: spec ? { kind: spec.kind, path: spec.path, restartsOnFailure: spec.restartsOnFailure, note: spec.note } : null,
        browser: browser || findBrowser(browserCandidates(process.platform)),
        project,
        supervisor: [nodeBinary(home), cliEntry(home), 'stage', 'run']
    }
}

/**
 * The join itself. Everything it creates is appended to `installed[]` and the
 * manifest is rewritten after each step, so a join interrupted halfway still
 * leaves a manifest that describes exactly what is on the machine.
 */
export const joinStage = async ({
    home, spaceId, from, key = null, at = null, into = null,
    project = null, browser = null, lan = false, name = null, run = runStep
}) => {
    const sp = stagePaths(home)
    const port = resolvePort(home)

    const chosenBrowser = browser || findBrowser(browserCandidates(process.platform))
    if (!chosenBrowser) return { ok: false, reason: 'no-browser' }

    const followed = await followSpace({ home, spaceId, from, key, into, address: at, port })
    if (!followed.ok) return { ok: false, reason: 'follow', why: followed.reason }

    const installed = []
    const envSet = []
    let manifest = manifestFor({
        spaceId, from, at, into, project, browser: chosenBrowser, lan, name,
        port, version: installedVersion(home),
        follow: { spaceId, previous: followed.previous, hadFile: followed.hadFile },
        installed, envSet
    })
    await dirNeeded(sp.stage, installed)
    await writeManifest(home, manifest)

    await dirNeeded(sp.logs, installed)
    await dirNeeded(sp.run, installed)
    await dirNeeded(sp.profile, installed)
    for (const file of [sp.hold, sp.stageLog, sp.stageStatus, sp.stagePid]) {
        if (!file.startsWith(sp.stage)) installed.push({ kind: 'file', path: file })
    }
    await fsp.writeFile(sp.hold, holdPage({ spaceId, waitingFor: hostOf(followed.base) }))
    manifest = { ...manifest, installed }
    await writeManifest(home, manifest)

    await setEnvLine(home, 'DI_PART', 'stage', envSet)
    if (name) await setEnvLine(home, 'DI_MACHINE_NAME', name, envSet)
    manifest = { ...manifest, envSet }
    await writeManifest(home, manifest)

    const autostart = await installAutostart({ home, run })
    if (autostart.spec) {
        for (const dir of autostart.madeDirs || []) installed.push({ kind: 'dir', path: dir })
        installed.push({ kind: 'file', path: autostart.spec.path })
        manifest = {
            ...manifest,
            installed,
            autostart: {
                kind: autostart.spec.kind,
                path: autostart.spec.path,
                remove: autostart.spec.remove,
                restartsOnFailure: autostart.spec.restartsOnFailure,
                note: autostart.spec.note,
                fallback: autostart.fallback
            }
        }
    }
    await writeManifest(home, manifest)

    // Nothing is STARTED here. The supervisor's first tick starts the server
    // through the runner — one path to a running server, not two — and the
    // caller starts the supervisor. That also makes this function the whole of
    // what `leave` has to undo, which is what stageAutostart.test.js tests.
    return {
        ok: true,
        manifest,
        base: followed.base,
        browser: chosenBrowser,
        autostart: manifest.autostart || null,
        autostartWhy: autostart.spec ? null : autostart.reason,
        port,
        url: publicUrl(home, port)
    }
}

const hostOf = (value) => { try { return new URL(value).host } catch { return String(value || '') } }

/** The supervisor, detached: it outlives the terminal that typed `join`. */
export const startSupervisor = (home) => {
    const sp = stagePaths(home)
    try { fs.mkdirSync(sp.logs, { recursive: true }) } catch { /* already there */ }
    const log = fs.openSync(sp.stageLog, 'a')
    const child = spawn(nodeBinary(home), [cliEntry(home), 'stage', 'run'], {
        detached: true,
        windowsHide: true,
        stdio: ['ignore', log, log],
        env: { ...process.env, DI_HOME: home }
    })
    child.unref()
    return child.pid
}

// ── leave ─────────────────────────────────────────────────────────────────

/**
 * Exactly what join did, undone — and nothing else.
 *
 * Every step comes off the manifest. A path that is not written down is a path
 * this never touches, which is what makes the byte-identical test in
 * stageAutostart.test.js possible at all.
 */
export const leaveStage = async ({ home, keepSpace = false, run = runStep }) => {
    const manifest = readManifest(home)
    if (!manifest) return { ok: false, reason: 'not-joined' }
    const sp = stagePaths(home)
    const done = []

    for (const step of leavePlan(manifest, { keepSpace })) {
        if (step.do === 'stop-supervisor') {
            const pid = readPidFile(sp.stagePid)
            if (stopPid(pid)) done.push(`stopped the supervisor (pid ${pid})`)
            continue
        }
        if (step.do === 'run') {
            const result = run({ command: step.command, args: step.args })
            done.push(`${step.command} ${step.args.join(' ')}${result.ok ? '' : ' (already gone)'}`)
            continue
        }
        if (step.do === 'restore-follow') {
            if (step.previous) {
                await setFollow(paths(home).data, step.spaceId, step.previous)
                done.push(`put the earlier follow of ${step.spaceId} back`)
            } else {
                const { removed } = await removeFollow(paths(home).data, step.spaceId)
                if (removed) done.push(`stopped following ${step.spaceId}`)
                // follows.json holding nothing but our entry did not exist
                // before the join either. Byte-identical means gone.
                if (removed && !Object.keys(readFollows(paths(home).data)).length && !manifest.follow?.hadFile) {
                    await fsp.rm(path.join(paths(home).data, 'follows.json'), { force: true })
                }
            }
            continue
        }
        if (step.do === 'restore-env') {
            const file = paths(home).env
            if (!exists(file)) continue
            if (!step.fileExisted) { await fsp.rm(file, { force: true }); done.push('removed di.env'); continue }
            const raw = await fsp.readFile(file, 'utf8')
            await fsp.writeFile(file, envTextRestore(raw, step.key, step.previous), { mode: 0o600 })
            done.push(`${step.key} put back`)
            continue
        }
        if (step.do === 'rm-file') { await fsp.rm(step.path, { force: true }); continue }
        if (step.do === 'rm-dir') { await fsp.rm(step.path, { recursive: true, force: true }); continue }
    }

    return { ok: true, manifest, done }
}

// ── the supervisor ────────────────────────────────────────────────────────

const urlOfFile = (file) => pathToFileURL(file).href

/**
 * This install's own machine id — the one serverXR mints into
 * `<data>/machine.json` and hands every page through the machines hub, and
 * the one a mapping's `output.show.machine` names. Read off the disk rather
 * than asked over HTTP: the file is beside the server this supervisor runs,
 * the machine routes need an editor session this process does not have, and
 * a server that has not started yet still has (or will mint) the same id.
 */
export const readMachineId = (home) => {
    try {
        const parsed = JSON.parse(fs.readFileSync(path.join(paths(home).data, 'machine.json'), 'utf8'))
        return parsed?.format === 'di.machine' && typeof parsed.id === 'string' && parsed.id ? parsed.id : null
    } catch {
        return null
    }
}

/** Every project in the space with how many surfaces it maps and where it asks to be shown. */
export const readMapProjects = async ({ home, port, spaceId }) => {
    const base = apiBase(home, port)
    const listed = await askJson(`${base}/api/spaces/${encodeURIComponent(spaceId)}/projects`)
    const projects = []
    for (const row of listed?.projects || []) {
        if (!row?.id) continue
        const doc = await askJson(`${base}/api/projects/${encodeURIComponent(row.id)}/document`)
        const mapping = doc?.document?.mappingState
        const surfaces = mapping?.surfaces
        projects.push({
            id: row.id,
            mapSurfaces: Array.isArray(surfaces) ? surfaces.length : 0,
            show: mapping?.output?.show || null
        })
    }
    return projects
}

// ── asking the kiosk WHERE it is ──────────────────────────────────────────
//
// `readPages` is a plain GET on CDP's HTTP side. Window bounds are not: they
// need the browser's websocket endpoint and two calls on it. Node 22 has a
// WebSocket of its own, so this stays a CLI with no dependencies — one short
// round trip, then the socket is closed.

const browserEndpoint = async (debugPort, timeoutMs) => {
    try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: controller.signal })
        clearTimeout(timer)
        return (await response.json())?.webSocketDebuggerUrl || null
    } catch {
        return null
    }
}

const cdp = async (endpoint, method, params = {}, { timeoutMs = 2500 } = {}) => {
    if (typeof WebSocket !== 'function' || !endpoint) return null
    return new Promise((resolve) => {
        let socket = null
        const done = (value) => { try { socket?.close() } catch { /* already */ } resolve(value) }
        const timer = setTimeout(() => done(null), timeoutMs)
        try {
            socket = new WebSocket(endpoint)
        } catch {
            clearTimeout(timer)
            resolve(null)
            return
        }
        socket.onopen = () => socket.send(JSON.stringify({ id: 1, method, params }))
        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(String(event.data))
                if (message.id !== 1) return
                clearTimeout(timer)
                done(message.error ? null : (message.result || {}))
            } catch { /* not ours */ }
        }
        socket.onerror = () => { clearTimeout(timer); done(null) }
    })
}

/**
 * The page's own `devicePixelRatio` — the one number that turns the probe's
 * device pixels into the CSS pixels Chromium places windows in. Asked of
 * the page, not guessed from the OS. See toWindowUnits in stageDisplays.mjs.
 */
export const pageScale = async (page) => {
    const answer = await cdp(page?.ws, 'Runtime.evaluate', { expression: 'window.devicePixelRatio', returnByValue: true })
    const value = Number(answer?.result?.value)
    return Number.isFinite(value) && value > 0 ? value : null
}

/** Where the kiosk's window is, as Chromium sees it: `{ left, top, width, height, windowState }` or null. */
export const windowBounds = async (debugPort, targetId) => {
    const found = await cdp(await browserEndpoint(debugPort, 2500), 'Browser.getWindowForTarget', { targetId })
    return found?.bounds || null
}

/**
 * Put the window on the bounds it was asked for, in Chromium's units. A
 * fullscreen window will not move, so it is taken back to normal, moved,
 * and made fullscreen again — three calls, one correction.
 */
export const placeWindow = async (debugPort, targetId, bounds) => {
    const endpoint = await browserEndpoint(debugPort, 2500)
    const found = await cdp(endpoint, 'Browser.getWindowForTarget', { targetId })
    if (!found?.windowId) return false
    const { windowId } = found
    if (!await cdp(endpoint, 'Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } })) return false
    if (!await cdp(endpoint, 'Browser.setWindowBounds', { windowId, bounds: { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height } })) return false
    await cdp(endpoint, 'Browser.setWindowBounds', { windowId, bounds: { windowState: 'fullscreen' } })
    return true
}

/**
 * `di stage run` — what the autostart entry calls, and the only long-lived
 * thing `di stage` starts.
 *
 * It keeps the server up, keeps one kiosk alive per assigned display, holds
 * the machine awake for as long as it is itself alive, and writes what it
 * found to `<DI_HOME>/run/stage-status.json` on every tick. It never changes
 * a setting on the OS: everything it holds is dropped the moment it exits,
 * so `leave` has nothing to restore and a crash leaves no residue.
 *
 * DISPLAYS ARE DATA. Each tick asks the OS what displays there are
 * (displayProbe.mjs), reads which machine and screen every mapping in the
 * space asks for (`output.show`), and `planDisplays` turns the two into one
 * kiosk per assigned display — its own profile, its own debugging port, its
 * own black hold page. A display that goes away closes its kiosk; one that
 * appears gets its kiosk; cloned displays are told, never flipped. A mapping
 * that names a display this machine does not have is one dim line in the
 * status, not a crash. When no mapping names this machine at all, it is the
 * one kiosk #513 shipped, unchanged.
 */
export const runSupervisor = async ({ home, once = false, everyMs = RECONCILE_MS, log = () => {}, probe = probeDisplays }) => {
    const manifest = readManifest(home)
    if (!manifest) return { ok: false, reason: 'not-joined' }
    const sp = stagePaths(home)
    const port = manifest.port || resolvePort(home)
    const runner = runnerFor(home)

    await fsp.mkdir(sp.run, { recursive: true })
    await fsp.writeFile(sp.stagePid, String(process.pid))

    // One entry per kiosk, keyed by the plan's window key (a display id, or
    // 'screen 1' in single mode). `holdShowing` is the target the hold page ON
    // SCREEN was written with — a loaded page does not notice its file
    // changing. `verified`/`corrected` are the placement: checked over CDP
    // once the window answers, corrected once, then reported as found.
    const kiosks = new Map()
    let wake = null
    let stopping = false
    let lastDisplays = null
    let lastPlan = null
    let clonedSaid = null
    // Chromium's unit, learned from the first kiosk that answers: device
    // pixels from the probe ÷ this = the CSS pixels a window is placed in.
    let scale = 1

    // The kiosk is not necessarily OUR child: a supervisor that was restarted
    // finds a browser it did not start, and a second launch into the same
    // profile would only have opened a tab in it. So it is ended by the pid
    // Chromium itself wrote into the profile, and our own handle is a
    // shortcut, not the truth.
    const stopKiosk = (kiosk) => {
        if (kiosk.browser && kiosk.browser.exitCode === null) { try { kiosk.browser.kill('SIGTERM') } catch { /* gone */ } }
        const pid = runningBrowserPid(kiosk.profileDir)
        if (pid) stopPid(pid)
        kiosk.browser = null
        kiosk.verified = false
        kiosk.corrected = false
    }
    const stopChildren = () => {
        for (const kiosk of kiosks.values()) stopKiosk(kiosk)
        if (wake && wake.exitCode === null) { try { wake.kill('SIGTERM') } catch { /* gone */ } }
        wake = null
    }
    const finish = () => {
        if (stopping) return
        stopping = true
        stopChildren()
        try { fs.rmSync(sp.stagePid, { force: true }) } catch { /* gone */ }
        process.exit(0)
    }
    if (!once) {
        process.on('SIGINT', finish)
        process.on('SIGTERM', finish)
        process.on('exit', () => stopChildren())
    }

    const startServer = async () => {
        log('the server is down — starting it')
        try {
            await runner.start({ home, port, host: manifest.lan ? '0.0.0.0' : '127.0.0.1', guests: false })
        } catch (error) {
            log(`could not start the server: ${String(error?.message || error)}`)
        }
    }
    const startWake = () => {
        const command = wakeCommand(process.platform, { pid: process.pid })
        if (!command) return
        try {
            wake = spawn(command.command, command.args, { stdio: 'ignore', windowsHide: true })
            wake.on('error', () => { wake = null })
            log(`holding this machine awake with ${command.command}`)
        } catch { wake = null }
    }

    const tick = async () => {
        const serverAlive = await alive(home, port)

        // The displays, and what changed since last time. Said on the tick it
        // happens; acted on below, where the plan no longer has the window.
        const probed = probe()
        const diff = displayDiff(lastDisplays || [], probed.displays)
        if (lastDisplays) {
            for (const display of diff.gone) log(`display ${display.label} went away — closing its kiosk`)
            for (const display of diff.appeared) log(`display ${display.label} appeared${display.width ? ` (${display.width}×${display.height} at ${display.x},${display.y})` : ''}`)
        }
        lastDisplays = probed.displays
        if (probed.cloned && clonedSaid !== probed.why) {
            log(`cloned displays: ${probed.why} — di stage does not change display settings; un-mirror them in the OS to use both`)
            clonedSaid = probed.why
        }
        if (!probed.cloned) clonedSaid = null

        const machineId = readMachineId(home)
        const projects = serverAlive ? await readMapProjects({ home, port, spaceId: manifest.space }) : []
        // With the server down the plan is whatever it was: the kiosks stay
        // where they are and go black, rather than being closed and reopened
        // on the single screen while the server restarts.
        const plan = serverAlive
            ? planDisplays({ projects, machineId, displays: probed.displays, project: manifest.project, debugPort: DEBUG_PORT })
            : (lastPlan || planDisplays({ projects: [], machineId: null, displays: probed.displays, project: manifest.project, debugPort: DEBUG_PORT }))
        if (serverAlive) lastPlan = plan
        const target = plan.mode === 'single' ? plan.target : null
        const targetError = !serverAlive ? 'server-down' : (target?.error || null)

        // Kiosks whose display, or whose assignment, is no longer in the plan.
        for (const [key, kiosk] of kiosks) {
            if (plan.windows.some((window) => window.key === key)) continue
            log(`no longer showing on ${kiosk.label} — closing its kiosk`)
            stopKiosk(kiosk)
            kiosks.delete(key)
        }

        let serverStarted = false
        const screens = []
        for (const window of plan.windows) {
            const kiosk = kiosks.get(window.key) || {
                key: window.key, label: window.label, profileDir: path.join(sp.stage, window.profile), holdFile: path.join(sp.stage, window.hold),
                browser: null, holdContent: null, holdShowing: null, verified: false, corrected: false, placedAt: null, units: null
            }
            kiosks.set(window.key, kiosk)
            const projectId = serverAlive ? window.projectId : (window.projectId || null)
            const targetUrl = serverAlive && projectId
                ? outUrl({ base: publicUrl(home, port), spaceId: manifest.space, projectId })
                : null

            // The hold page carries the target inside it, so it is rewritten
            // whenever the target moves — and it is always black either way.
            const wanted = holdPage({
                spaceId: manifest.space,
                waitingFor: targetUrl ? hostOf(publicUrl(home, port)) : (targetError === 'none' ? 'a mapping in this space' : hostOf(String(manifest.from))),
                targetUrl,
                healthUrl: targetUrl ? `${publicUrl(home, port)}/serverXR/api/health` : null
            })
            if (wanted !== kiosk.holdContent) {
                await fsp.writeFile(kiosk.holdFile, wanted)
                kiosk.holdContent = wanted
            }
            const holdUrl = urlOfFile(kiosk.holdFile)

            const pages = await readPages(window.debugPort)
            const page = pages[0] || null
            // The kiosk is alive when it ANSWERS, not when a child handle says
            // so. Launching into a profile that already has a browser returns
            // immediately with exit code 0, which read as "dead" and opened a
            // fresh tab on every tick until the screen was a stack of them.
            const browserAlive = pages.length > 0
            const wakeAlive = Boolean(wake) && wake.exitCode === null

            const { actions } = reconcile({
                serverAlive, browserAlive, wakeAlive, holdUrl, targetUrl,
                pageUrl: page?.url || null,
                holdCarriesTarget: kiosk.holdShowing === targetUrl
            })

            for (const action of actions) {
                if (action.do === 'start-server' && !serverStarted) { serverStarted = true; await startServer() }
                if (action.do === 'start-wake' && !(wake && wake.exitCode === null)) startWake()
                if (action.do === 'start-browser' || action.do === 'restart-browser') {
                    if (action.do === 'restart-browser') {
                        log(`putting the kiosk on ${window.label} back on the hold page — ${action.why}`)
                        stopKiosk(kiosk)
                        await waitFor(1500)
                    }
                    await patchPreferences(kiosk.profileDir)
                    const args = browserArgs({
                        profileDir: kiosk.profileDir, url: action.url || holdUrl, debugPort: window.debugPort,
                        window: window.display ? toWindowUnits(window.display, scale) : null
                    })
                    try {
                        kiosk.browser = spawn(manifest.browser, args, { stdio: 'ignore', windowsHide: true })
                        kiosk.holdShowing = targetUrl
                        kiosk.verified = false
                        kiosk.corrected = false
                        kiosk.placedAt = null
                        kiosk.browser.on('error', () => { kiosk.browser = null })
                        log(`kiosk up on ${window.label}${window.display ? ` at ${window.display.x},${window.display.y} ${window.display.width}×${window.display.height}${scale !== 1 ? ` (÷${scale} for Chromium)` : ''}` : ''} — ${action.url || holdUrl}`)
                    } catch (error) {
                        log(`could not start the browser: ${String(error?.message || error)}`)
                        kiosk.browser = null
                    }
                }
            }

            // Did it land where it was sent? Asked once the window answers,
            // corrected ONCE, and after that reported rather than fought —
            // a window that will not sit on its display is a fact for the
            // status line, not a loop. Bounds are compared in both the
            // probe's unit and Chromium's (see toWindowUnits), and the one
            // that matched is written down.
            let placement = null
            if (window.display && browserAlive && page?.id) {
                if (!kiosk.verified) {
                    const dpr = await pageScale(page)
                    if (dpr) scale = dpr
                    const bounds = await windowBounds(window.debugPort, page.id)
                    const verdict = placementVerdict(bounds, window.display, scale)
                    if (bounds && verdict.ok) {
                        kiosk.verified = true
                        kiosk.placedAt = bounds
                        kiosk.units = verdict.units
                        log(`${window.label}: the kiosk sits on ${bounds.left},${bounds.top} ${bounds.width}×${bounds.height} — as asked (${verdict.units})`)
                    } else if (bounds && !kiosk.corrected) {
                        kiosk.corrected = true
                        kiosk.placedAt = bounds
                        const wanted = toWindowUnits(window.display, scale)
                        log(`${window.label}: the kiosk is at ${bounds.left},${bounds.top} ${bounds.width}×${bounds.height}, asked for ${wanted.x},${wanted.y} ${wanted.width}×${wanted.height} (CSS pixels at ×${scale}) — moving it once`)
                        await placeWindow(window.debugPort, page.id, wanted)
                    } else if (bounds) {
                        kiosk.placedAt = bounds
                    }
                }
                placement = kiosk.verified
                    ? { ok: true, units: kiosk.units || null, scale }
                    : { ok: false, actual: kiosk.placedAt, scale, why: kiosk.corrected ? 'corrected once, still off' : 'not checked yet' }
            }

            const out = readOutTitle(page?.title)
            const onTarget = Boolean(targetUrl) && page?.url === targetUrl
            const misplaced = placement && !placement.ok && kiosk.corrected && kiosk.placedAt
            screens.push({
                label: window.label,
                projectId: projectId || null,
                debugPort: window.debugPort,
                display: window.display ? { x: window.display.x, y: window.display.y, width: window.display.width, height: window.display.height } : null,
                placed: placement,
                url: page?.url || null,
                title: page?.title || null,
                showing: onTarget && out.showing && !misplaced,
                reason: out.reason,
                why: !targetUrl
                    ? (targetError === 'none' ? 'no mapping in this space yet'
                        : targetError === 'many' ? `more than one mapping — name one with --project, or say which screen shows which on the desk (${(target?.ids || []).join(', ')})`
                            : 'the server is down')
                    : misplaced ? `the kiosk is at ${kiosk.placedAt.left},${kiosk.placedAt.top} ${kiosk.placedAt.width}×${kiosk.placedAt.height}, not on ${window.label} — corrected once, still off`
                        : onTarget ? (out.reason ? `the page says ${out.reason}` : 'the page has not said yet')
                            : 'holding'
            })
        }
        for (const entry of plan.unplaced) {
            screens.push({ label: entry.projectId, projectId: entry.projectId, debugPort: null, display: null, placed: null, url: null, title: null, showing: false, reason: null, why: entry.why })
        }
        // Nothing to show at all still needs the server and the wake hold.
        if (!plan.windows.length) {
            if (!serverAlive && !serverStarted) { serverStarted = true; await startServer() }
            if (!(wake && wake.exitCode === null)) startWake()
        }

        await fsp.writeFile(sp.stageStatus, `${JSON.stringify({
            at: new Date().toISOString(),
            pid: process.pid,
            space: manifest.space,
            machine: machineId,
            server: { alive: serverAlive, url: publicUrl(home, port) },
            target: { projectId: target?.projectId || null, error: targetError, url: target?.projectId ? outUrl({ base: publicUrl(home, port), spaceId: manifest.space, projectId: target.projectId }) : null },
            displays: { list: probed.displays, cloned: probed.cloned, why: probed.why, assumed: probed.assumed, note: probed.note, mode: plan.mode, scale },
            wake: { held: Boolean(wake) && wake.exitCode === null, how: wakeCommand(process.platform)?.command || null },
            screens
        }, null, 2)}\n`)

        return { serverAlive, plan, screens }
    }

    if (once) {
        const result = await tick()
        stopChildren()
        try { fs.rmSync(sp.stagePid, { force: true }) } catch { /* gone */ }
        return { ok: true, ...result }
    }
    while (true) {
        try { await tick() } catch (error) { log(`tick failed: ${String(error?.message || error)}`) }
        await waitFor(everyMs)
    }
}

const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * `exit_type: "Normal"` before every launch. A power cut otherwise comes back
 * as "Restore pages?" across the top of the projection, with nobody there.
 */
/** The kiosk already running out of this profile, whoever started it. */
export const runningBrowserPid = (profileDir) => {
    try {
        return pidFromSingletonLock(fs.readlinkSync(path.join(profileDir, 'SingletonLock')))
    } catch {
        return null
    }
}

export const patchPreferences = async (profileDir) => {
    const file = path.join(profileDir, 'Default', 'Preferences')
    try {
        await fsp.mkdir(path.dirname(file), { recursive: true })
        const raw = exists(file) ? await fsp.readFile(file, 'utf8') : ''
        await fsp.writeFile(file, preferencesPatch(raw))
        // And the session itself, or the browser restores last week's tabs
        // without ever asking.
        for (const entry of SESSION_FILES) {
            await fsp.rm(path.join(profileDir, entry), { recursive: true, force: true })
        }
        return true
    } catch {
        return false
    }
}

export const restartSupervisor = async (home) => {
    const sp = stagePaths(home)
    const pid = readPidFile(sp.stagePid)
    const was = stopPid(pid)
    if (was) await waitFor(600)
    return { was, pid: startSupervisor(home) }
}

// ── status ────────────────────────────────────────────────────────────────

export const stageStatus = async (home) => {
    const manifest = readManifest(home)
    if (!manifest) return statusRows({ joined: false })
    const sp = stagePaths(home)
    const port = manifest.port || resolvePort(home)
    const serverAlive = await alive(home, port)

    const supervisorPid = readPidFile(sp.stagePid)
    let file = null
    try { file = JSON.parse(fs.readFileSync(sp.stageStatus, 'utf8')) } catch { file = null }

    const followed = readFollows(paths(home).data)[manifest.space] || null
    const live = serverAlive
        ? (await askJson(`${apiBase(home, port)}/api/follows`))?.follows || []
        : []
    const liveFollow = live.find((entry) => entry.spaceId === manifest.space) || null

    const autostart = manifest.autostart
        ? { ...manifest.autostart, present: exists(manifest.autostart.path) }
        : { kind: null, present: false, restartsOnFailure: false }

    // One row per kiosk the supervisor last planned — each on its own
    // debugging port — asked live, plus the mappings it could not place, as
    // the supervisor wrote them. A supervisor that never ran leaves the one
    // screen #513 had, so the report is never empty.
    const planned = Array.isArray(file?.screens) && file.screens.length
        ? file.screens
        : [{ label: 'screen 1', debugPort: DEBUG_PORT, projectId: file?.target?.projectId || null, why: null }]
    const screens = []
    for (const entry of planned) {
        if (!entry.debugPort) {
            screens.push({ label: entry.label, url: null, title: null, showing: false, reason: null, why: entry.why || 'not placed' })
            continue
        }
        const page = (await readPages(entry.debugPort))[0] || null
        const out = readOutTitle(page?.title)
        const targetUrl = entry.projectId
            ? outUrl({ base: publicUrl(home, port), spaceId: manifest.space, projectId: entry.projectId })
            : (file?.target?.url || null)
        const misplaced = entry.placed && entry.placed.ok === false && entry.placed.why === 'corrected once, still off'
        screens.push({
            label: entry.label,
            url: page?.url || null,
            title: page?.title || null,
            showing: Boolean(page) && Boolean(targetUrl) && page.url === targetUrl && out.showing && !misplaced,
            reason: out.reason,
            why: !page ? 'no kiosk answering' : entry.why || 'holding'
        })
    }

    const rows = statusRows({
        joined: true,
        server: { alive: serverAlive, url: publicUrl(home, port) },
        supervisor: { alive: pidAlive(supervisorPid), pid: supervisorPid },
        follow: followed ? {
            spaceId: manifest.space,
            remote: String(followed.remote || '').replace(/\/serverXR$/, ''),
            status: liveFollow?.status || null,
            carriedIn: liveFollow?.carriedIn,
            carriedOut: liveFollow?.carriedOut,
            lastError: liveFollow?.lastError || null
        } : null,
        autostart,
        wake: pidAlive(supervisorPid) ? (file?.wake || { held: false }) : { held: false },
        screens
    })
    return {
        ...rows,
        space: manifest.space,
        from: manifest.from,
        at: manifest.at,
        target: file?.target || null,
        version: versionVerdict({ here: installedVersion(home), there: manifest.diVersion })
    }
}
