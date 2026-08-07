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

import { isWindows, paths, versionLayout } from './paths.mjs'
import { probeHealth } from './probe.mjs'
import { currentVersionDir, writeState } from './state.mjs'

const REPO = 'dob-0/di.iiii'

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: options.verbose ? 'inherit' : 'ignore', ...options })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))))
})

export const latestRelease = async () => {
    const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' }
    })
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

const sha256 = async (file) => {
    const hash = crypto.createHash('sha256')
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
    return hash.digest('hex')
}

const download = async (url, target) => {
    const response = await fetch(url, { redirect: 'follow' })
    if (!response.ok) throw new Error(`download failed (${response.status})`)
    await fsp.writeFile(target, Buffer.from(await response.arrayBuffer()))
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

        await run('tar', ['-xzf', archive, '-C', partialDir, '--strip-components', '1'], { verbose })

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

/** Boot the staged version on a throwaway port and make sure it answers. */
export const smokeTest = async ({ home, versionDir, nodeBinary }) => {
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
            // A scratch data root: the smoke test must never touch the real one.
            DATA_ROOT: await fsp.mkdtemp(path.join(os.tmpdir(), 'di-smoke-')),
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

const linkDir = async (link, target) => {
    await fsp.rm(link, { recursive: false, force: true })
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
