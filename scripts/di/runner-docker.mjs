/**
 * Running di.iiii as containers — chosen only when the daemon is up AND the
 * GHCR images are anonymously pullable, so this path can never 403 halfway
 * through a stranger's first install.
 *
 * Data lives in the `data` named volume, not in ~/.di/data. Bind-mounting the
 * host directory looks tidier and is a trap: serverXR/Dockerfile runs `USER
 * app`, so a host directory owned by another uid gives an opaque
 * SQLITE_CANTOPEN on first boot, differently on each of the three OSes. The
 * honest consequence is that `di where` must print the real location, and
 * `di backup` is how you move between machines or modes.
 */

import { execFile, spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

import { paths, versionLayout } from './paths.mjs'
import { currentVersionDir, readEnv, readState } from './state.mjs'

const execFileAsync = promisify(execFile)

export const PROJECT = 'di-local'

/**
 * Base file THEN override, exactly as CI runs it (install-matrix.yml's
 * docker job). The .di file is only an override: it leans on `!reset` /
 * `!override` tags and defines no volumes, so composed alone the named
 * `di-local_data` volume never exists — work lands in an anonymous volume
 * while `di where` points at the named one. The base's extra services
 * (tunnel, caddy) sit behind compose profiles and do not start.
 *
 * Exported for the guard test: this pairing is the bug class.
 */
export const composeFiles = (home) => {
    const versionDir = currentVersionDir(home)
    if (!versionDir) throw new Error('not installed')
    const layout = versionLayout(versionDir)
    return [layout.composeBase, layout.compose]
}

const compose = async (home, args, { verbose = false } = {}) => {
    const files = composeFiles(home)
    const full = ['compose', '-p', PROJECT, ...files.flatMap((file) => ['-f', file]), ...args]
    if (verbose) process.stdout.write(`[di] docker ${full.join(' ')}\n`)
    return execFileAsync('docker', full, {
        cwd: path.dirname(files[0]),
        env: { ...process.env, ...readEnv(home) },
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
    })
}

export const isRunning = async (home) => {
    try {
        const { stdout } = await compose(home, ['ps', '--status', 'running', '--format', '{{.Name}}'])
        return String(stdout || '').trim().length > 0
    } catch {
        return false
    }
}

export const start = async ({ home, port, verbose = false }) => {
    await compose(home, ['up', '-d'], { verbose })
    return { port }
}

export const stop = async ({ home, verbose = false }) => {
    await compose(home, ['down'], { verbose })
    return true
}

export const readLog = async (home, lines = 200) => {
    try {
        const { stdout } = await compose(home, ['logs', '--tail', String(lines)])
        return stdout
    } catch {
        return ''
    }
}

export const followLog = (home) => {
    const files = composeFiles(home)
    return spawn('docker', ['compose', '-p', PROJECT, ...files.flatMap((file) => ['-f', file]), 'logs', '-f', '--tail', '200'], {
        stdio: 'inherit'
    })
}

export const describe = (home) => ({
    mode: 'docker',
    version: readState(home).version || null,
    // Not ~/.di/data — say the true thing, even when it is the less tidy thing.
    dataDir: `docker volume ${PROJECT}_data`
})

export { paths }
