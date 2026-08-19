#!/usr/bin/env node
/**
 * `di` — di.iiii on your own machine.
 *
 * Offline is the default state, not a degraded one. Nothing here reaches the
 * network except `di update`, the one-time install, and the explicitly online
 * pair `di link`/`di sync`; a laptop at a venue with no wifi runs exactly the
 * same as one at a desk.
 *
 *   di up · down · status · open · logs · doctor · where
 *   di backup · restore · update · uninstall
 *   di link · sync
 *
 * Design rule: this file only routes. What to run is decided in detect.mjs
 * (pure), how to ask the machine in probe.mjs, how to run it in runner-*.mjs,
 * and every artist-facing word in ui.mjs.
 */

import { spawn } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { decideMode } from './detect.mjs'
import { activate, isNewerVersion, latestRelease, pruneVersions, rollback, smokeTest, stageVersion } from './install.mjs'
import { isWindows, paths } from './paths.mjs'
import { probeAll, probeHealth } from './probe.mjs'
import * as docker from './runner-docker.mjs'
import * as node from './runner-node.mjs'
import {
    currentVersionDir, dirSize, humanSize, installedVersion, isInstalled,
    localUrl, readState, resolvePort, writeEnv, writeState
} from './state.mjs'
import { readLink, writeLink } from './credentialsStore.mjs'
import { createLedger, ensureInstallId, readLedger, writeLedger } from './ledger.mjs'
import { buildSyncAudit } from './sync-plan.mjs'
import { gatherLocalSide, gatherSide, verifyLink } from './sync.mjs'
import { CMD, fail, say, style, ui } from './ui.mjs'

const parseArgs = (argv) => {
    const args = { _: [], flags: {} }
    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i]
        if (!token.startsWith('--')) { args._.push(token); continue }
        const name = token.slice(2)
        if (name === 'port') { args.flags.port = argv[++i]; continue }
        if (name === 'out') { args.flags.out = argv[++i]; continue }
        if (name === 'remote') { args.flags.remote = argv[++i]; continue }
        if (name === 'key') { args.flags.key = argv[++i]; continue }
        args.flags[name] = true
    }
    return args
}

const HOME = () => {
    const override = String(process.env.DI_HOME || '').trim()
    return override ? path.resolve(override) : paths().home
}

/** Which runner this install uses. Recorded once, at install time. */
const runnerFor = (home) => (readState(home).mode === 'docker' ? docker : node)

const requireInstalled = (home) => {
    if (isInstalled(home)) return true
    say(ui.notInstalled())
    process.exitCode = 1
    return false
}

const openBrowser = (url) => {
    const [command, args] = isWindows
        ? ['cmd', ['/c', 'start', '', url]]
        : process.platform === 'darwin'
            ? ['open', [url]]
            : ['xdg-open', [url]]
    try {
        spawn(command, args, { stdio: 'ignore', detached: true }).unref()
    } catch {
        // A machine with no browser (a server, a bare WSL) is not an error —
        // the URL is already printed.
    }
}

const spaceNames = async (port) => {
    try {
        const response = await fetch(`${localUrl(port)}/serverXR/api/spaces`)
        if (!response.ok) return []
        const body = await response.json()
        return (body?.spaces || []).map(space => space.id).slice(0, 6)
    } catch {
        return []
    }
}

// ── commands ──────────────────────────────────────────────────────────────

const cmdUp = async (args) => {
    const home = HOME()
    if (!requireInstalled(home)) return
    const port = resolvePort(home, args.flags.port)
    const runner = runnerFor(home)

    if (await probeHealth(port)) { say(ui.alreadyRunning(localUrl(port))); return }

    say(ui.starting())
    try {
        await runner.start({ home, port, verbose: Boolean(args.flags.verbose) })
    } catch (error) {
        fail(String(error.message || error))
        process.exitCode = 1
        return
    }
    await writeEnv(home, { PORT: String(port) })

    say(ui.running(localUrl(port), await spaceNames(port)))
    if (!args.flags['no-open']) openBrowser(localUrl(port))
    await noticeNewVersion(home)
}

/**
 * Mention a newer version, once a day, and never get in the way.
 *
 * `di up` must not become a thing that needs the network: the whole product is
 * that a laptop at a venue behaves the same as one at a desk. So this runs after
 * the app is already up and printed, swallows every failure, and remembers when
 * it last looked so an offline machine is not retrying on every start. It only
 * ever prints one dim line — installing is still something the artist types.
 */
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000
const UPDATE_CHECK_TIMEOUT_MS = 3000
const noticeNewVersion = async (home) => {
    try {
        const state = readState(home)
        const last = Date.parse(state.lastUpdateCheck || '') || 0
        if (Date.now() - last < CHECK_EVERY_MS) return
        // Recorded BEFORE the request, not after it. Written after, a failed
        // check never records — so the machine that has no network is exactly
        // the machine that retries on every single start, which is the opposite
        // of what the comment above promises. "We looked" is the fact worth
        // remembering; whether anyone answered is not.
        await writeState(home, { lastUpdateCheck: new Date().toISOString() })
        // Bounded, like every other network probe in this CLI (probe.mjs's
        // NET_TIMEOUT_MS). Without it a captive portal — the normal state of
        // venue wifi — holds `di up` for the OS TCP timeout, after the app is
        // already running and printed.
        const release = await latestRelease({ timeoutMs: UPDATE_CHECK_TIMEOUT_MS })
        const current = installedVersion(home)
        if (release.version && current && isNewerVersion(release.version, current)) {
            say(ui.updateAvailable(current, release.version))
        }
    } catch {
        // No network, a rate limit, a captive portal — none of that is the
        // artist's problem while their di.iiii is already running.
    }
}

const cmdDown = async () => {
    const home = HOME()
    if (!requireInstalled(home)) return
    const runner = runnerFor(home)
    const was = await runner.stop({ home })
    say(was ? ui.stopped(runner.describe(home).dataDir) : ui.notRunning())
}

const cmdStatus = async () => {
    const home = HOME()
    if (!isInstalled(home)) { say(ui.notInstalled()); return }
    const port = resolvePort(home)
    const runner = runnerFor(home)
    const info = runner.describe(home)
    const healthy = await probeHealth(port)

    if (!healthy) {
        say(`${ui.notRunning()}  ${style.dim(`${info.version || '?'} · ${info.dataDir}`)}`)
        return
    }
    const size = info.mode === 'node' ? humanSize(await dirSize(paths(home).data)) : null
    say([
        `running (${info.mode})`,
        info.version,
        localUrl(port),
        `data ${info.dataDir}${size ? ` (${size})` : ''}`
    ].filter(Boolean).join(style.dim(' · ')))
}

const cmdOpen = async (args) => {
    const home = HOME()
    if (!requireInstalled(home)) return
    const port = resolvePort(home)
    if (!(await probeHealth(port))) { await cmdUp({ ...args, flags: { ...args.flags, 'no-open': false } }); return }
    say(localUrl(port))
    openBrowser(localUrl(port))
}

const cmdLogs = async (args) => {
    const home = HOME()
    if (!requireInstalled(home)) return
    const runner = runnerFor(home)
    if (args.flags.f || args._.includes('-f')) {
        const child = runner.followLog(home)
        await new Promise(resolve => child.on('exit', resolve))
        return
    }
    say(await runner.readLog(home, 200))
}

const cmdWhere = () => {
    const home = HOME()
    const p = paths(home)
    const runner = runnerFor(home)
    say([
        `app    ${currentVersionDir(home) || style.dim('not installed')}`,
        `work   ${isInstalled(home) ? runner.describe(home).dataDir : p.data}`,
        `di     ${p.shim}`
    ].join('\n'))
}

/**
 * Must work when nothing is installed — an artist who cannot get a report
 * because the report needs an install has no way back.
 */
const cmdDoctor = async () => {
    const home = HOME()
    const probes = await probeAll({ home })
    const decision = decideMode(probes)
    const tick = (ok) => (ok ? style.cyan('ok  ') : style.dim('--  '))

    say([
        `${tick(probes.dockerRunning)}docker        ${probes.dockerRunning ? 'running' : 'not running'}`,
        `${tick(probes.imagesPullable)}images        ${probes.imagesPullable ? 'pullable' : 'not public — docker path skipped'}`,
        `${tick(Boolean(probes.systemNode))}node (system) ${probes.systemNode || 'none'}`,
        `${tick(Boolean(probes.vendoredNode))}node (di)     ${probes.vendoredNode || 'none'}`,
        `${tick(probes.canReachNodeOrg)}nodejs.org    ${probes.canReachNodeOrg ? 'reachable' : 'unreachable'}`,
        '',
        `${tick(isInstalled(home))}installed     ${installedVersion(home) || 'no'}`,
        `${tick(true)}home          ${home}`,
        '',
        decision.mode === 'none'
            ? ui.noRuntime()
            : style.dim(`would run in ${decision.mode} mode — ${decision.reason}`)
    ].join('\n'))
}

const cmdBackup = async (args) => {
    const home = HOME()
    if (!requireInstalled(home)) return
    const versionDir = currentVersionDir(home)
    const script = path.join(versionDir, 'scripts', 'install-bundle.mjs')
    const stamp = new Date().toISOString().slice(0, 10)
    const out = path.resolve(args.flags.out || `di-backup-${stamp}.tar.gz`)

    const child = spawn(node.nodeBinary(home), [script, 'export', '--out', out], {
        stdio: args.flags.verbose ? 'inherit' : 'ignore',
        env: { ...process.env, DATA_ROOT: paths(home).data }
    })
    const code = await new Promise(resolve => child.on('exit', resolve))
    if (code !== 0) { fail('backup failed — run again with --verbose'); process.exitCode = 1; return }

    let size = null
    try { size = humanSize((await fsp.stat(out)).size) } catch { /* printed without it */ }
    say(ui.backed(out, size))
}

const cmdRestore = async (args) => {
    const home = HOME()
    if (!requireInstalled(home)) return
    const file = args._[1]
    if (!file) { fail('which file? — di restore my-backup.tar.gz'); process.exitCode = 1; return }

    say(ui.restoreWarning(paths(home).data))
    if (!args.flags.yes) { say(style.dim('add --yes when you are sure.')); return }

    const versionDir = currentVersionDir(home)
    const script = path.join(versionDir, 'scripts', 'install-bundle.mjs')
    const child = spawn(node.nodeBinary(home), [script, 'import', path.resolve(file), '--force'], {
        stdio: 'inherit',
        env: { ...process.env, DATA_ROOT: paths(home).data }
    })
    const code = await new Promise(resolve => child.on('exit', resolve))
    process.exitCode = code === 0 ? 0 : 1
}

const cmdUninstall = async (args) => {
    const home = HOME()
    const p = paths(home)
    if (isInstalled(home)) { try { await runnerFor(home).stop({ home }) } catch { /* already down */ } }

    // credentials.json holds live editor keys — secrets are not "your work"
    // and must not outlive the install that minted their links
    for (const target of [p.versions, p.current, p.previous, p.bin, p.runtime, p.run, p.state, p.env, p.credentials]) {
        await fsp.rm(target, { recursive: true, force: true })
    }
    if (args.flags['with-data']) {
        await fsp.rm(p.data, { recursive: true, force: true })
        say('removed di.iiii, and your work with it.')
        return
    }
    say(ui.uninstalled(p.data))
}

const cmdUpdate = async (args) => {
    const home = HOME()
    if (!requireInstalled(home)) return
    const verbose = Boolean(args.flags.verbose)
    const from = installedVersion(home)

    if (args.flags.rollback) {
        const to = await rollback({ home })
        say(to ? ui.rolledBack(to) : ui.noPrevious())
        if (!to) process.exitCode = 1
        return
    }

    let release
    try {
        release = await latestRelease()
    } catch (error) {
        fail(String(error.message || error))
        process.exitCode = 1
        return
    }
    if (release.version === from) { say(ui.upToDate(from)); return }

    say(ui.installing(release.version))
    let staged
    try {
        staged = await stageVersion({ home, release, verbose })
        const healthy = await smokeTest({ home, versionDir: staged.partialDir, nodeBinary: node.nodeBinary(home) })
        if (!healthy) throw new Error('the new version did not answer on a test port')
    } catch (error) {
        // Nothing has been stopped and `current` has not moved, so the artist
        // is exactly where they were — say so plainly rather than leaving them
        // to wonder what state their work is in.
        if (staged?.partialDir) await fsp.rm(staged.partialDir, { recursive: true, force: true })
        fail(String(error.message || error))
        say(ui.updateFailed(from))
        process.exitCode = 1
        return
    }

    const runner = runnerFor(home)
    const wasRunning = await probeHealth(resolvePort(home))
    try { await runner.stop({ home }) } catch { /* already down */ }

    await activate({ home, ...staged, version: release.version, mode: readState(home).mode })
    await pruneVersions({ home, keep: [release.version, from].filter(Boolean) })

    say(ui.updated(from, release.version))
    if (wasRunning) await cmdUp({ _: [], flags: { 'no-open': true } })
}

/**
 * Connect one local space to the same space on an online di.iiii.
 *
 * Writes two local files and nothing else: the key into credentials.json
 * (0600), and an empty ledger whose null cursors make every later audit
 * answer "unknown" until a real sync establishes a baseline. The key is
 * verified against the remote before either write — including that the remote
 * can serve a verbatim scene, because a peer that cannot is one no future
 * sync may safely copy from.
 */
const cmdLink = async (args) => {
    const home = HOME()
    if (!requireInstalled(home)) return
    const spaceId = args._[1]
    if (!spaceId) { fail(`which space? — ${CMD} link my-space --remote https://staging.di-studio.xyz`); process.exitCode = 1; return }
    const remote = args.flags.remote
    if (!remote) { fail(`where is it online? — add --remote <url>`); process.exitCode = 1; return }
    const key = args.flags.key || await promptSecret(ui.askForKey())
    if (!key) { fail('a sync key is required — mint one in the space settings online'); process.exitCode = 1; return }

    say(ui.checkingKey())
    const verified = await verifyLink({ remote, spaceId, key })
    if (!verified.ok) {
        fail(ui.linkRefused(verified.reason, spaceId))
        process.exitCode = 1
        return
    }

    writeLink(home, spaceId, { remote: verified.base, key })
    const installId = await ensureInstallId(home)
    if (!readLedger(home, verified.base, spaceId)) {
        writeLedger(home, verified.base, spaceId, createLedger({ installId, remote: verified.base, spaceId }))
    }
    say(ui.linked(spaceId, verified.base))
}

/**
 * The audit `di sync <space>` — reads both sides, prints what it can prove,
 * and writes NOTHING. There is no default direction because there is no
 * correct one; --push/--pull are later PRs and each will refuse every case
 * this report marks unprovable.
 */
const cmdSync = async (args) => {
    const home = HOME()
    if (!requireInstalled(home)) return
    const spaceId = args._[1]
    if (!spaceId) { fail(`which space? — ${CMD} sync my-space`); process.exitCode = 1; return }

    const link = readLink(home, spaceId)
    if (!link) { say(ui.notLinked(spaceId)); process.exitCode = 1; return }

    const port = resolvePort(home, args.flags.port)
    const local = (await probeHealth(port))
        ? await gatherLocalSide({ port, spaceId, token: link.key })
        : { reachable: false }
    const remote = await gatherSide({ base: link.remote, spaceId, token: link.key })
    const ledger = readLedger(home, link.remote, spaceId)

    const audit = buildSyncAudit({ local, remote, ledger })
    say(ui.syncReport({ spaceId, remote: link.remote, local, remote_: remote, audit }))
    if (audit.refusals.length) process.exitCode = 1
}

const promptSecret = (question) => new Promise((resolve) => {
    process.stdout.write(question)
    const chunks = []
    process.stdin.resume()
    process.stdin.once('data', (data) => {
        chunks.push(data)
        process.stdin.pause()
        resolve(String(Buffer.concat(chunks)).trim())
    })
})

const cmdVersion = () => { say(installedVersion(HOME()) || 'not installed') }

// ── routing ───────────────────────────────────────────────────────────────

const COMMANDS = {
    up: cmdUp,
    down: cmdDown,
    stop: cmdDown,
    status: cmdStatus,
    open: cmdOpen,
    logs: cmdLogs,
    doctor: cmdDoctor,
    where: cmdWhere,
    backup: cmdBackup,
    restore: cmdRestore,
    link: cmdLink,
    sync: cmdSync,
    update: cmdUpdate,
    uninstall: cmdUninstall,
    version: cmdVersion,
    help: () => say(ui.help())
}

const main = async () => {
    const args = parseArgs(process.argv.slice(2))
    const name = args._[0]

    // Bare `di` starts it if it can, and explains itself if it cannot.
    if (!name) {
        if (isInstalled(HOME())) { await cmdUp(args); return }
        say(ui.help())
        return
    }
    const command = COMMANDS[name]
    if (!command) {
        fail(`no such command: ${name}`)
        say(ui.help())
        process.exitCode = 1
        return
    }
    await command(args)
}

main().catch((error) => {
    fail(String(error?.stack || error?.message || error))
    process.exitCode = 1
})

export { COMMANDS, parseArgs }
