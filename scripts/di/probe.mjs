/**
 * Everything the CLI needs to ask the machine. All the I/O lives here so
 * detect.mjs can stay pure and exhaustively testable.
 *
 * Every probe answers, or gives up on a short timer. A stranger's first
 * install must not hang on a DNS lookup behind a captive portal.
 */

import { execFile, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

import { NODE_FLOOR, parseVersion, satisfiesFloor } from './detect.mjs'
import { isWindows, paths } from './paths.mjs'

const execFileAsync = promisify(execFile)

const GHCR_IMAGE = 'dob-0/dii-server'
const NET_TIMEOUT_MS = 3000

const quiet = async (fn, fallback = null) => {
    try {
        return await fn()
    } catch {
        return fallback
    }
}

/** Does `docker info` succeed — the daemon is up, not merely installed. */
export const probeDocker = async () => quiet(async () => {
    await execFileAsync('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 8000 })
    return true
}, false)

/**
 * Can an anonymous client actually pull the images. False today: the GHCR
 * packages are private and return 403 without a token. Probing rather than
 * assuming means the docker path lights up by itself the day they are made
 * public, with no new release.
 */
export const probeImagesPullable = async () => quiet(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), NET_TIMEOUT_MS)
    try {
        const tokenResponse = await fetch(
            `https://ghcr.io/token?scope=repository:${GHCR_IMAGE}:pull&service=ghcr.io`,
            { signal: controller.signal }
        )
        if (!tokenResponse.ok) return false
        const { token } = await tokenResponse.json()
        if (!token) return false
        const manifest = await fetch(`https://ghcr.io/v2/${GHCR_IMAGE}/manifests/latest`, {
            method: 'HEAD',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json'
            },
            signal: controller.signal
        })
        return manifest.ok
    } finally {
        clearTimeout(timer)
    }
}, false)

export const probeSystemNode = () => {
    // Not process.version — the CLI may be running under a Node we vendored,
    // which says nothing about what is on the artist's PATH.
    const result = spawnSync(isWindows ? 'node.exe' : 'node', ['-v'], { encoding: 'utf8', timeout: 5000 })
    if (result.status !== 0) return null
    const version = String(result.stdout || '').trim()
    return version || null
}

export const probeVendoredNode = (home) => {
    const p = paths(home)
    const binary = isWindows
        ? path.join(p.nodeRuntime, 'node.exe')
        : path.join(p.nodeRuntime, 'bin', 'node')
    if (!fs.existsSync(binary)) return null
    const result = spawnSync(binary, ['-v'], { encoding: 'utf8', timeout: 5000 })
    if (result.status !== 0) return null
    return String(result.stdout || '').trim() || null
}

export const probeNodeOrg = async () => quiet(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), NET_TIMEOUT_MS)
    try {
        const response = await fetch('https://nodejs.org/dist/index.json', {
            method: 'HEAD',
            signal: controller.signal
        })
        return response.ok
    } finally {
        clearTimeout(timer)
    }
}, false)

/**
 * Is there a `di` on PATH that is not ours. Debian and Fedora package a disk
 * information utility by that name; taking it out from under someone is not
 * a decision an installer gets to make silently.
 */
export const probeForeignDi = (home) => {
    const which = isWindows ? 'where' : 'which'
    const result = spawnSync(which, ['di'], { encoding: 'utf8', timeout: 5000 })
    if (result.status !== 0) return { found: false, foreign: false, path: null }
    const resolved = String(result.stdout || '').split('\n')[0].trim()
    if (!resolved) return { found: false, foreign: false, path: null }
    const ours = path.resolve(resolved).startsWith(path.resolve(paths(home).home))
    return { found: true, foreign: !ours, path: resolved }
}

/** Is something already listening there. */
export const probePort = async (port, host = '127.0.0.1') => quiet(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    try {
        await fetch(`http://${host}:${port}/`, { signal: controller.signal })
        return true
    } finally {
        clearTimeout(timer)
    }
}, false)

/** Is the thing on that port ours, and healthy. */
export const probeHealth = async (port, host = '127.0.0.1', basePath = '/serverXR') => quiet(async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2000)
    try {
        const response = await fetch(`http://${host}:${port}${basePath}/api/health`, { signal: controller.signal })
        return response.ok
    } finally {
        clearTimeout(timer)
    }
}, false)

/** Everything decideMode needs, gathered concurrently. */
export const probeAll = async ({ home, forcedMode = null } = {}) => {
    const [dockerRunning, imagesPullable, canReachNodeOrg] = await Promise.all([
        probeDocker(),
        probeImagesPullable(),
        probeNodeOrg()
    ])
    return {
        dockerRunning,
        imagesPullable,
        canReachNodeOrg,
        systemNode: probeSystemNode(),
        vendoredNode: probeVendoredNode(home),
        forcedMode
    }
}

export { NODE_FLOOR, parseVersion, satisfiesFloor }
