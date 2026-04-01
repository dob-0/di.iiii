import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

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
        stdio: 'inherit'
    })
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
let isShuttingDown = false

const shutdown = (exitCode = 0) => {
    if (isShuttingDown) return
    isShuttingDown = true
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
    VITE_API_BASE_URL: requestedApiBase
}

if (!process.env.VITE_API_TOKEN && serverEnvFile.API_TOKEN) {
    clientEnv.VITE_API_TOKEN = serverEnvFile.API_TOKEN
}

console.log(`[dev-stack] Starting front-end with VITE_API_BASE_URL=${clientEnv.VITE_API_BASE_URL}`)
clientChild = spawnProcess(npmCommand, ['run', 'dev:client'], {
    cwd: repoRoot,
    env: clientEnv
})

clientChild.on('exit', (code, signal) => {
    if (!isShuttingDown && serverChild?.exitCode === null) {
        serverChild.kill('SIGTERM')
    }
    if (signal) {
        process.exit(0)
    }
    process.exit(typeof code === 'number' ? code : 0)
})
