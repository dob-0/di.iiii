import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
    collectDependencyDrift,
    collectMissingSpaces,
    formatDependencyDriftWarning,
    formatFetchAgeNote,
    formatSpaceDriftWarning,
} from './dev-stack-lib.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const serverRoot = path.join(repoRoot, 'serverXR')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const HEALTH_TIMEOUT_MS = 25000
const HEALTH_POLL_MS = 500

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

const parseEnvFile = async (filePath) => {
    try {
        const raw = await readFile(filePath, 'utf8')
        return raw
            .split(/\r?\n/)
            .reduce((acc, line) => {
                const trimmed = line.trim()
                if (!trimmed || trimmed.startsWith('#')) return acc
                const separatorIndex = trimmed.indexOf('=')
                if (separatorIndex === -1) return acc
                const key = trimmed.slice(0, separatorIndex).trim()
                const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '')
                if (key) acc[key] = value
                return acc
            }, {})
    } catch {
        return {}
    }
}

const normalizeBasePath = (value = '') => {
    const trimmed = String(value || '').trim()
    if (!trimmed || trimmed === '/') return ''
    return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const canReachHealth = async (healthUrl) => {
    try {
        const response = await fetch(healthUrl, {
            signal: AbortSignal.timeout(1500)
        })
        return response.ok
    } catch {
        return false
    }
}

const waitForHealth = async (healthUrl, timeoutMs = HEALTH_TIMEOUT_MS) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (await canReachHealth(healthUrl)) {
            return true
        }
        await sleep(HEALTH_POLL_MS)
    }
    return false
}

const parseApiBase = (value) => {
    try {
        const url = new URL(value)
        return {
            apiBaseUrl: `${url.origin}${normalizeBasePath(url.pathname)}`,
            basePath: normalizeBasePath(url.pathname),
            hostname: url.hostname,
            isLoopback: LOOPBACK_HOSTS.has(url.hostname),
            port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
            protocol: url.protocol
        }
    } catch {
        return null
    }
}

const spawnProcess = (command, args, options = {}) => {
    return spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: 'inherit',
        // On Windows the npm launcher is `npm.cmd`; recent Node releases refuse to
        // spawn `.cmd` files directly (`spawn EINVAL`) unless run through a shell.
        shell: process.platform === 'win32'
    })
}

console.log('\n[dev-stack] First time here? Run: cat CHEATSHEET.md\n')

// Read-only, no fetch (offline is a real case) — counts against the local origin/dev
// ref. Exists because this checkout once served a merged branch 115 commits behind
// origin/dev for two days with nothing saying so. Degrades to silence if git is unusable.
const gitRead = (args) => {
    try {
        return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    } catch {
        return ''
    }
}

const headSha = gitRead(['rev-parse', '--short', 'HEAD'])
if (headSha) {
    const branch = gitRead(['branch', '--show-current'])
    const behindDev = gitRead(['rev-list', '--count', 'HEAD..origin/dev'])
    const devTip = gitRead(['rev-parse', 'origin/dev'])
    const upstreamGone = Boolean(branch) && gitRead(['for-each-ref', '--format=%(upstream:track)', `refs/heads/${branch}`]) === '[gone]'
    console.log(`[dev-stack] Tree: ${branch || 'detached'} @ ${headSha}${behindDev && behindDev !== '0' ? ` (${behindDev} behind origin/dev)` : ''}`)
    const fetchedAt = (() => {
        try {
            return statSync(path.join(repoRoot, '.git', 'FETCH_HEAD')).mtimeMs
        } catch {
            return 0
        }
    })()
    const fetchNote = formatFetchAgeNote(fetchedAt, Date.now())
    if (fetchNote) console.log(fetchNote)

    // Read-only and degrades to silence, like every other check up here: a
    // missing or unreadable lockfile means we simply do not know.
    try {
        const lock = JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'))
        const drift = collectDependencyDrift(lock.packages, (dir) => {
            try {
                return JSON.parse(readFileSync(path.join(repoRoot, dir, 'package.json'), 'utf8')).version || null
            } catch {
                return null
            }
        })
        for (const line of formatDependencyDriftWarning(drift)) console.log(line)
    } catch {
        // no lockfile, or unreadable — say nothing rather than guess
    }
    if ((devTip && gitRead(['rev-parse', 'HEAD']) !== devTip) || upstreamGone) {
        const why = upstreamGone
            ? `branch "${branch}" tracks an upstream that is GONE (merged and deleted?)`
            : `HEAD is not at the origin/dev tip (${behindDev || '?'} behind)`
        console.log('\n[dev-stack] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
        console.log(`[dev-stack] !!! STALE/DRIFTED TREE — ${why}.`)
        console.log('[dev-stack] !!! What you are about to look at may be OLD code.')
        console.log('[dev-stack] !!! Fix: git fetch && git checkout --detach origin/dev')
        console.log('[dev-stack] !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n')
    }
}

const CHROMIUM_PROFILE_DIR = path.join(
    process.env.HOME || '',
    '.var/app/org.chromium.Chromium/data/dev-profile'
)

const wipeAndLaunchBrowser = async (url) => {
    const { rm } = await import('node:fs/promises')
    await rm(CHROMIUM_PROFILE_DIR, { recursive: true, force: true }).catch(() => {})
    try {
        return spawn('flatpak', ['run', 'org.chromium.Chromium', `--user-data-dir=${CHROMIUM_PROFILE_DIR}`, url], {
            detached: false,
            stdio: 'ignore'
        })
    } catch {
        console.log('[dev-stack] DEV_BROWSER requested but flatpak Chromium is not available — skipping.')
        return null
    }
}

const serverEnvFile = await parseEnvFile(path.join(serverRoot, '.env'))
const defaultServerPort = Number(serverEnvFile.PORT || 4000)
const defaultServerBasePath = normalizeBasePath(serverEnvFile.APP_BASE_PATH || '/serverXR')
const defaultLocalApiBase = `http://localhost:${defaultServerPort}${defaultServerBasePath}`

const requestedApiBase = (process.env.VITE_API_BASE_URL || defaultLocalApiBase).trim()
const parsedApiBase = parseApiBase(requestedApiBase)
const shouldAutoStartLocalServer = Boolean(parsedApiBase?.isLoopback && parsedApiBase?.protocol === 'http:')

let serverChild = null
let clientChild = null
let browserChild = null
let isShuttingDown = false

const shutdown = (exitCode = 0) => {
    if (isShuttingDown) return
    isShuttingDown = true
    if (browserChild?.exitCode === null) {
        browserChild.kill('SIGTERM')
    }
    if (clientChild?.exitCode === null) {
        clientChild.kill('SIGTERM')
    }
    if (serverChild?.exitCode === null) {
        serverChild.kill('SIGTERM')
    }
    setTimeout(() => process.exit(exitCode), 100)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

if (shouldAutoStartLocalServer) {
    const healthUrl = `${parsedApiBase.apiBaseUrl}/api/health`
    const serverReachable = await canReachHealth(healthUrl)

    if (serverReachable) {
        console.log(`[dev-stack] ServerXR already reachable at ${parsedApiBase.apiBaseUrl}`)
    } else {
        console.log(`[dev-stack] Starting ServerXR at ${parsedApiBase.apiBaseUrl}`)
        const serverEnv = {
            ...process.env,
            PORT: String(parsedApiBase.port),
            APP_BASE_PATH: parsedApiBase.basePath,
            CORS_ORIGINS: process.env.CORS_ORIGINS || '*'
        }
        serverChild = spawnProcess(npmCommand, ['run', 'dev'], {
            cwd: serverRoot,
            env: serverEnv
        })
        serverChild.on('exit', (code, signal) => {
            if (isShuttingDown) return
            console.error(`[dev-stack] ServerXR exited early (${signal || code || 0}).`)
            shutdown(typeof code === 'number' ? code : 1)
        })

        const healthy = await waitForHealth(healthUrl)
        if (!healthy) {
            console.error(`[dev-stack] ServerXR did not become healthy at ${healthUrl}`)
            shutdown(1)
        }
    }
} else {
    console.log(`[dev-stack] Using external API base ${requestedApiBase}; ServerXR auto-start skipped.`)
}

const clientEnv = {
    ...process.env,
    VITE_API_BASE_URL: shouldAutoStartLocalServer
        ? (parsedApiBase?.basePath || '/serverXR')
        : requestedApiBase
}

if (shouldAutoStartLocalServer && parsedApiBase) {
    clientEnv.VITE_PROXY_API_TARGET = `${parsedApiBase.protocol}//${parsedApiBase.hostname}:${parsedApiBase.port}`
}

if (!process.env.VITE_API_TOKEN && serverEnvFile.API_TOKEN) {
    clientEnv.VITE_API_TOKEN = serverEnvFile.API_TOKEN
}

console.log(`[dev-stack] Starting front-end with VITE_API_BASE_URL=${clientEnv.VITE_API_BASE_URL}`)
if (clientEnv.VITE_PROXY_API_TARGET) {
    console.log(`[dev-stack] Proxying ${clientEnv.VITE_API_BASE_URL} to ${clientEnv.VITE_PROXY_API_TARGET}`)
}
clientChild = spawnProcess(npmCommand, ['run', 'dev:client'], {
    cwd: repoRoot,
    env: clientEnv
})

const clientPort = Number(process.env.VITE_PORT || 5173)
const clientUrl = `http://localhost:${clientPort}/`

if (process.env.DEV_BROWSER) {
    waitForHealth(clientUrl, HEALTH_TIMEOUT_MS).then(async (ready) => {
        if (isShuttingDown) return
        if (!ready) {
            console.log(`[dev-stack] DEV_BROWSER set but ${clientUrl} never became reachable — skipping browser launch.`)
            return
        }
        console.log(`[dev-stack] DEV_BROWSER: wiping dev Chromium profile and opening ${clientUrl}`)
        browserChild = await wipeAndLaunchBrowser(clientUrl)
    })
}

// The tree warning above answers "is this code current". This answers the other
// half nobody was asking: "is this DATA current". The local DB is its own
// SQLite file that nothing keeps in step, `spaces:audit` reports the local
// tier's drift and still exits 0 (it is declared `governed: false`), and a
// space that is simply absent looks exactly like a space that was never made —
// so the miss reads as "the tool worked" and costs a deep dig to find. Same
// rules as the tree check: read-only, short timeouts, and silent on any
// failure, because this desktop goes offline and a dev stack must still start.
const noteSpaceDrift = async () => {
    const CACHE_DIR = path.join(repoRoot, 'node_modules', '.cache')
    const MARKER = path.join(CACHE_DIR, 'di-space-drift-check')
    const THROTTLE_MS = 12 * 60 * 60 * 1000
    const { mkdir, stat, writeFile } = await import('node:fs/promises')

    try {
        const last = await stat(MARKER).then((s) => s.mtimeMs).catch(() => 0)
        if (Date.now() - last < THROTTLE_MS) return
    } catch { return }

    // serverXR/.env.local is where the tokens actually live; process.env wins so
    // the check can be pointed elsewhere (or muted) without editing a file.
    const fileEnv = { ...(await parseEnvFile(path.join(serverRoot, '.env.local'))), ...serverEnvFile }
    const env = new Proxy({}, { get: (_, key) => process.env[key] ?? fileEnv[key] })
    const listSpaces = async (base, token) => {
        try {
            const response = await fetch(`${base.replace(/\/+$/, '')}/api/spaces`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                signal: AbortSignal.timeout(5000),
            })
            if (!response.ok) return null
            const body = await response.json()
            return (body?.spaces || []).map((s) => s.id)
        } catch {
            return null
        }
    }

    const local = await listSpaces(parsedApiBase.apiBaseUrl, env.API_TOKEN)
    if (!local) return

    const tiers = []
    for (const [tier, base, token] of [
        ['prod', env.PROD_API_URL || 'https://di-studio.xyz/serverXR', env.PROD_API_TOKEN],
        ['staging', env.LIVE_API_URL || 'https://staging.di-studio.xyz/serverXR', env.LIVE_API_TOKEN],
    ]) {
        tiers.push({ tier, ids: await listSpaces(base, token) })
    }
    const missing = collectMissingSpaces(local, tiers)

    // Only record a completed comparison — a failed one should retry next boot,
    // not go quiet for half a day.
    await mkdir(CACHE_DIR, { recursive: true }).catch(() => {})
    await writeFile(MARKER, new Date().toISOString(), 'utf8').catch(() => {})

    if (isShuttingDown) return
    for (const line of formatSpaceDriftWarning(missing)) console.log(line)
}

if (shouldAutoStartLocalServer && parsedApiBase) {
    waitForHealth(`${parsedApiBase.apiBaseUrl}/api/health`, HEALTH_TIMEOUT_MS)
        .then((ready) => (ready && !isShuttingDown ? noteSpaceDrift() : null))
        .catch(() => {})
}

clientChild.on('exit', (code, signal) => {
    if (!isShuttingDown) {
        if (serverChild?.exitCode === null) {
            serverChild.kill('SIGTERM')
        }
        if (browserChild?.exitCode === null) {
            browserChild.kill('SIGTERM')
        }
    }
    if (signal) {
        process.exit(0)
    }
    process.exit(typeof code === 'number' ? code : 0)
})
