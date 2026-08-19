/**
 * Installing and updating — the only two things that touch the network.
 *
 * The contract `di update` makes, and the reason for every step below: an
 * update either works or leaves the artist exactly where they were. So a new
 * version is built up in a `.partial` directory, verified, its dependencies
 * installed, and health-checked on a scratch port BEFORE anything running is
 * stopped. `current` is flipped last. Nothing here can reach ~/.di/data.
 */

import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { isWindows, paths, versionLayout } from './paths.mjs'
import { probeHealth } from './probe.mjs'
import { currentVersionDir, writeState } from './state.mjs'

const REPO = 'dob-0/di.iiii'

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.verbose ? 'inherit' : 'ignore', ...options })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))))
})

// timeoutMs is optional because the two callers want different things: `di
// install` / `di update` are network operations the artist asked for and can
// wait on, while the once-a-day notice after `di up` must never hold the
// terminal. Unbounded is the default only because that is what an explicit
// install already was; nothing should call it unbounded from a start path.
// Is `candidate` actually newer than `current`?
//
// The once-a-day notice compared the two strings for inequality, so any machine
// whose version was not the latest release — including one AHEAD of it — was
// told an update was available, and `di update` would have walked it backwards.
// That is not hypothetical: the doc's own USB-stick path installs from a
// `file://` artifact that no release feed knows about, and every test install is
// in the same position.
//
// Numeric parts compare numerically; a prerelease loses to its own release
// (0.4.0-rc is older than 0.4.0, newer than 0.3.1). Anything unparseable
// compares as not-newer — a notice we cannot justify is one we do not print.
export const isNewerVersion = (candidate, current) => {
    const parse = (value) => {
        const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(String(value || '').trim())
        return match ? { nums: [+match[1], +match[2], +match[3]], pre: match[4] || null } : null
    }
    const a = parse(candidate)
    const b = parse(current)
    if (!a || !b) return false
    for (let i = 0; i < 3; i += 1) {
        if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i]
    }
    if (a.pre === b.pre) return false
    // Same numbers: the one without a prerelease tag is the released one.
    if (!a.pre) return true
    if (!b.pre) return false
    return a.pre > b.pre
}

export const latestRelease = async ({ timeoutMs = 0 } = {}) => {
    const controller = timeoutMs > 0 ? new AbortController() : null
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null
    let response
    try {
        response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
            headers: { Accept: 'application/vnd.github+json' },
            ...(controller ? { signal: controller.signal } : {})
        })
    } finally {
        if (timer) clearTimeout(timer)
    }
    if (!response.ok) throw new Error(`could not reach the release feed (${response.status})`)
    const body = await response.json()
    const version = String(body.tag_name || '').replace(/^v/, '')
    if (!version) throw new Error('the latest release has no version tag')
    const asset = (body.assets || []).find(item => item.name === `di-runtime-${version}.tar.gz`)
    const checksums = (body.assets || []).find(item => item.name === 'checksums.txt')
    if (!asset) throw new Error(`release ${version} has no runtime artifact`)
    return {
        version,
        url: asset.browser_download_url,
        checksumsUrl: checksums?.browser_download_url || null
    }
}

/**
 * Which tar to run, and with what.
 *
 * On Windows there are usually two. Windows ships bsdtar at
 * System32\tar.exe, which understands `C:\...`. Git for Windows ships GNU tar,
 * which is often first on PATH and reads a leading `C:` as a REMOTE HOST — the
 * extract fails with `tar (child): Cannot connect to C: resolve failed`, which
 * names neither tar nor the drive letter as the problem. Prefer bsdtar; if only
 * GNU tar is there, `--force-local` tells it a colon is just a colon.
 */
export const tarCommand = () => {
    if (!isWindows) return { command: 'tar', args: [] }
    const bsd = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    if (fs.existsSync(bsd)) return { command: bsd, args: [] }
    return { command: 'tar', args: ['--force-local'] }
}

const sha256 = async (file) => {
    const hash = crypto.createHash('sha256')
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
    return hash.digest('hex')
}

const download = async (url, target) => {
    // A file:// source is how CI drives a real update without a published
    // release, and how an update can be applied from a USB stick at a venue with
    // no network. Node's fetch does not speak file:, so copy instead.
    if (String(url).startsWith('file://')) {
        await fsp.copyFile(fileURLToPath(url), target)
        return
    }
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok) throw new Error(`download failed (${response.status})`)
    await fsp.writeFile(target, Buffer.from(await response.arrayBuffer()))
}

/**
 * A release described by a file on this machine, for `di update --from`.
 *
 * The capability was always there — `download()` speaks file:// precisely so a
 * venue with no network can update from a USB stick, and the docs said so — but
 * nothing exposed it, so the only way to reach it was to call stageVersion by
 * hand. A promise no command keeps is not a feature.
 *
 * The version comes from the artifact's own name, which is what the packer
 * writes and what stageVersion lays out on disk.
 */
export const releaseFromFile = async (file) => {
    const resolved = path.resolve(file)
    if (!fs.existsSync(resolved)) throw new Error(`no such file: ${resolved}`)
    const match = /^di-runtime-(.+)\.tar\.gz$/.exec(path.basename(resolved))
    if (!match) {
        throw new Error(`${path.basename(resolved)} is not a di.iiii runtime — expected di-runtime-<version>.tar.gz`)
    }
    // No checksum: there is no feed to compare against, and inventing one from
    // the file itself would only prove the file equals itself.
    return { version: match[1], url: pathToFileURL(resolved).href, checksumsUrl: null }
}

/**
 * Fetch, verify, unpack and prepare a version — without disturbing anything
 * that is currently installed or running.
 */
export const stageVersion = async ({ home, release, verbose = false }) => {
    const p = paths(home)
    const finalDir = p.versionDir(release.version)
    const partialDir = `${finalDir}.partial`

    await fsp.rm(partialDir, { recursive: true, force: true })
    await fsp.mkdir(partialDir, { recursive: true })

    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-runtime-'))
    const archive = path.join(tmp, `di-runtime-${release.version}.tar.gz`)
    try {
        await download(release.url, archive)

        if (release.checksumsUrl) {
            const sums = path.join(tmp, 'checksums.txt')
            await download(release.checksumsUrl, sums)
            const expected = (await fsp.readFile(sums, 'utf8'))
                .split('\n')
                .map(line => line.trim().split(/\s+/))
                .find(([, name]) => name && name.endsWith(path.basename(archive)))?.[0]
            if (!expected) throw new Error('the checksums file does not mention this artifact')
            const actual = await sha256(archive)
            if (actual !== expected) {
                throw new Error(`checksum mismatch — refusing to install\n  expected ${expected}\n  got      ${actual}`)
            }
        }

        const tar = tarCommand()
        await run(tar.command, [...tar.args, '-xzf', archive, '-C', partialDir, '--strip-components', '1'], { verbose })

        // serverXR only, and production deps only. The artist never needs Vite
        // or the root dependency tree — dist/ arrived already built.
        const layout = versionLayout(partialDir)
        await run(isWindows ? 'npm.cmd' : 'npm', ['ci', '--omit=dev'], {
            cwd: layout.server,
            verbose,
            shell: isWindows
        })
    } finally {
        await fsp.rm(tmp, { recursive: true, force: true })
    }

    return { partialDir, finalDir }
}

/**
 * Boot the staged version on a throwaway port and make sure it answers.
 *
 * `dataRoot` decides WHAT it answers about. Left out, the server gets an empty
 * scratch directory and the test proves the new build starts — which is not the
 * question an update actually asks. The question is whether it can open YOUR
 * spaces, and the only honest way to ask that is to let it try, on a copy.
 * `rehearseAgainst()` below makes the copy.
 */
export const smokeTest = async ({ home, versionDir, nodeBinary, dataRoot = null }) => {
    const layout = versionLayout(versionDir)
    const port = 40000 + Math.floor((Date.now() % 20000))
    const child = spawn(nodeBinary, [layout.serverEntry], {
        cwd: layout.server,
        stdio: 'ignore',
        env: {
            ...process.env,
            PORT: String(port),
            HOST: '127.0.0.1',
            APP_BASE_PATH: '/serverXR',
            CLIENT_DIR: layout.client,
            // Never the real one. Either a copy of it (a rehearsal — see
            // rehearseAgainst) or an empty scratch directory.
            DATA_ROOT: dataRoot || await fsp.mkdtemp(path.join(os.tmpdir(), 'di-smoke-')),
            REQUIRE_AUTH: 'false',
            NODE_ENV: 'production'
        }
    })
    try {
        const deadline = Date.now() + 30000
        while (Date.now() < deadline) {
            if (await probeHealth(port)) return true
            if (child.exitCode !== null) return false
            await new Promise(resolve => setTimeout(resolve, 300))
        }
        return false
    } finally {
        try { child.kill('SIGKILL') } catch { /* already gone */ }
    }
}

/**
 * Remove a link without ever following it.
 *
 * `fs.rm(path, { recursive: true })` on a junction is the way to delete the
 * artist's installed version by accident — and `current` points at it. So:
 * lstat, unlink if it is a link (a Windows junction lstats as one), rmdir only
 * if it is an empty directory, and refuse anything else out loud. A real
 * directory sitting where a link belongs means something is wrong that deleting
 * it recursively would only hide.
 */
export const unlinkLink = async (target) => {
    let stat
    try {
        stat = await fsp.lstat(target)
    } catch {
        return
    }
    if (stat.isSymbolicLink()) { await fsp.unlink(target); return }
    if (stat.isDirectory()) {
        // Throws if it is not empty, which is the point.
        await fsp.rmdir(target)
        return
    }
    await fsp.rm(target, { force: true })
}

const linkDir = async (link, target) => {
    await unlinkLink(link)
    // Windows needs an explicit junction; a plain symlink there requires either
    // admin rights or developer mode, and this installer promises neither.
    await fsp.symlink(target, link, isWindows ? 'junction' : 'dir')
}

/** Promote a staged version: rename into place, move `current`, keep `previous`. */
export const activate = async ({ home, partialDir, finalDir, version, mode }) => {
    const p = paths(home)
    const previousDir = currentVersionDir(home)

    await fsp.rm(finalDir, { recursive: true, force: true })
    await fsp.rename(partialDir, finalDir)

    if (previousDir && previousDir !== finalDir) await linkDir(p.previous, previousDir)
    await linkDir(p.current, finalDir)

    await writeState(home, {
        version,
        mode,
        previousVersion: previousDir ? path.basename(previousDir) : null,
        updatedAt: new Date().toISOString()
    })
}

export const rollback = async ({ home }) => {
    const p = paths(home)
    let target = null
    try { target = await fsp.realpath(p.previous) } catch { return null }
    if (!target) return null
    await linkDir(p.current, target)
    const version = path.basename(target)
    await writeState(home, { version, updatedAt: new Date().toISOString() })
    return version
}

/** Keep the current version and the one before it. Older ones are dead weight. */
export const pruneVersions = async ({ home, keep = [] }) => {
    const p = paths(home)
    let entries = []
    try { entries = await fsp.readdir(p.versions) } catch { return }
    await Promise.all(entries
        .filter(name => !keep.includes(name))
        .map(name => fsp.rm(path.join(p.versions, name), { recursive: true, force: true })))
}

/**
 * A copy of the artist's data, for the new version to open before anything is
 * committed to.
 *
 * The health check used to boot the staged build on an empty directory, which
 * proves it starts and nothing else. A migration that cannot read THIS
 * database — the one with three years of a space's op-log in it — failed after
 * the flip, with the old version already stopped. So: copy, let the new build
 * open the copy and run its migrations there, and only then touch anything
 * real.
 *
 * The copy is a rehearsal and is thrown away. Whatever the migration did to it
 * is discarded; the real database is migrated afterwards by the version that
 * has now proved it can.
 *
 * Returns null when there is nothing to rehearse (a first install), which the
 * caller treats as "no objection" rather than as a pass.
 */
export const rehearseAgainst = async ({ home }) => {
    const p = paths(home)
    if (!fs.existsSync(p.data)) return null
    const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'di-rehearsal-'))
    // The whole data root, not just di.db: the server opens assets and space
    // directories on boot too, and a rehearsal that copied only the database
    // would pass on an install whose real start would not.
    await fsp.cp(p.data, scratch, { recursive: true })
    return scratch
}

const withoutExperimentalWarning = (fn) => {
    const original = process.emitWarning
    process.emitWarning = (warning, ...rest) => {
        const name = typeof warning === 'object' && warning !== null ? warning.name : rest[0]
        if (String(name) === 'ExperimentalWarning') return
        return original.call(process, warning, ...rest)
    }
    try {
        return fn()
    } finally {
        process.emitWarning = original
    }
}

/**
 * What the artist's database says about itself, without opening the app.
 *
 * Reads `PRAGMA user_version` — the number serverXR stamps after migrating (see
 * SCHEMA_VERSION in serverXR/src/db.js). Returns 0 for a database that has
 * never been stamped and null when there is no database at all, so the caller
 * can tell "fresh install" from "old data".
 */
export const dataSchemaVersion = (home) => {
    const p = paths(home)
    const file = path.join(p.data, 'di.db')
    if (!fs.existsSync(file)) return null
    try {
        // Required here rather than imported at the top: this module is loaded
        // by specs that run in a browser-shaped environment, where bundling a
        // node: builtin fails outright. The one function that needs sqlite is
        // the only place that should pay for it.
        //
        // And quietly: node prints an ExperimentalWarning the first time
        // node:sqlite is loaded, which would land in the middle of `di update`
        // as four lines of Node internals an artist cannot act on. Scoped to
        // this one call and to that one warning — everything else still prints.
        const { DatabaseSync } = withoutExperimentalWarning(() => createRequire(import.meta.url)('node:sqlite'))
        const db = new DatabaseSync(file, { readOnly: true })
        try {
            return Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0)
        } finally {
            db.close()
        }
    } catch {
        // An unreadable database is not a reason to block an update — the
        // update may be the thing that fixes it. Unknown, not zero.
        return null
    }
}

/** What schema a staged or installed build can read, from its release.json. */
export const buildSchemaVersion = (versionDir) => {
    try {
        const release = JSON.parse(fs.readFileSync(path.join(versionDir, 'release.json'), 'utf8'))
        return Number.isInteger(release?.schemaVersion) ? release.schemaVersion : null
    } catch {
        // Every build before 2026-08-19 predates the field. Unknown, and the
        // caller warns rather than pretending it checked.
        return null
    }
}

/**
 * Copy the artist's work somewhere update cannot reach, and say where.
 *
 * Taken before an update that moves the schema forward, because that is the
 * update `--rollback` cannot undo on its own: it restores the app, and the
 * database has moved. Cheap — a local install's data is small, and the whole
 * artifact is 3 MB now.
 */
export const snapshotData = async ({ home, label }) => {
    const p = paths(home)
    if (!fs.existsSync(p.data)) return null
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dir = path.join(p.snapshots, `${label}-${stamp}`)
    await fsp.mkdir(p.snapshots, { recursive: true })
    await fsp.cp(p.data, dir, { recursive: true })
    return dir
}

/** The snapshots on this machine, newest first. */
export const listSnapshots = (home) => {
    const p = paths(home)
    if (!fs.existsSync(p.snapshots)) return []
    return fs.readdirSync(p.snapshots)
        .map((name) => ({ name, dir: path.join(p.snapshots, name) }))
        .filter((entry) => fs.statSync(entry.dir).isDirectory())
        .sort((a, b) => (a.name < b.name ? 1 : -1))
}

/**
 * Put a snapshot back. The data it replaces is itself moved aside first, under
 * `replaced-<stamp>` — restoring the wrong snapshot must not be the end of the
 * story either.
 */
export const restoreSnapshot = async ({ home, dir }) => {
    const p = paths(home)
    if (!fs.existsSync(dir)) throw new Error(`no such snapshot: ${dir}`)
    if (fs.existsSync(p.data)) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-')
        await fsp.mkdir(p.snapshots, { recursive: true })
        await fsp.cp(p.data, path.join(p.snapshots, `replaced-${stamp}`), { recursive: true })
        await fsp.rm(p.data, { recursive: true, force: true })
    }
    await fsp.cp(dir, p.data, { recursive: true })
    return p.data
}
