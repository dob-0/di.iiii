// @vitest-environment node
// Regression guard for the stray-database bug class (known-fixes, 2026-10-02):
// serverXR in a git checkout must refuse a relative or unset DATA_ROOT.

import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { evaluateDataRoot } = require('./dataRootGuard.js')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const checkout = (env) => evaluateDataRoot({ env, repoRoot: '/work/tree', exists: (p) => p === '/work/tree/.git' })
const notCheckout = (env) => evaluateDataRoot({ env, repoRoot: '/opt/di', exists: () => false })

describe('evaluateDataRoot', () => {
    it('refuses an unset DATA_ROOT in a checkout, naming all three fixes', () => {
        const r = checkout({})
        expect(r.action).toBe('refuse')
        expect(r.message).toContain('absolute DATA_ROOT')
        expect(r.message).toContain('DI_SCRATCH=1')
        expect(r.message).toContain('di-dev up <tree>')
    })

    it('refuses a relative DATA_ROOT in a checkout', () => {
        expect(checkout({ DATA_ROOT: './data' }).action).toBe('refuse')
        expect(checkout({ DATA_ROOT: 'data' }).action).toBe('refuse')
        expect(checkout({ DATA_ROOT: '  ' }).action).toBe('refuse')
    })

    it('lets an absolute DATA_ROOT through (the installed di, Docker, cPanel)', () => {
        expect(checkout({ DATA_ROOT: '/home/u/.local/share/di.iiii/data' }).action).toBe('ok')
        expect(checkout({ DATA_ROOT: '/data', NODE_ENV: 'production' }).action).toBe('ok')
    })

    it('does not fire outside a git checkout (installed bundle, prebuilt release)', () => {
        expect(notCheckout({}).action).toBe('ok')
        expect(notCheckout({ DATA_ROOT: './data' }).action).toBe('ok')
    })

    it('does not fire under test', () => {
        expect(checkout({ NODE_ENV: 'test' }).action).toBe('ok')
        expect(checkout({ VITEST: 'true' }).action).toBe('ok')
    })

    it('DI_SCRATCH=1 warns with the path and goes on', () => {
        const r = checkout({ DI_SCRATCH: '1' })
        expect(r.action).toBe('scratch')
        expect(r.message).toBe('SCRATCH database at /work/tree/serverXR/data')
    })

    it('DI_SCRATCH other than 1 does not count', () => {
        expect(checkout({ DI_SCRATCH: 'true' }).action).toBe('refuse')
    })
})

// The real processes. Skipped when this checkout's serverXR/.env(.local) pins a
// DATA_ROOT itself (dotenv would feed it to the child and change the outcome).
const pinned = ['.env', '.env.local'].some((f) => {
    try { return /^\s*DATA_ROOT\s*=/m.test(fs.readFileSync(path.join(repoRoot, 'serverXR', f), 'utf8')) } catch { return false }
})
const bareEnv = () => {
    // PORT=0: if the guard ever regresses, the child must not bind a port that matters.
    const env = { ...process.env, PORT: '0' }
    for (const k of ['NODE_ENV', 'VITEST', 'VITEST_WORKER_ID', 'VITEST_POOL_ID', 'DATA_ROOT', 'DI_SCRATCH']) delete env[k]
    return env
}

describe.skipIf(pinned || !fs.existsSync(path.join(repoRoot, '.git')))('the real entry points in this checkout', () => {
    it('serverXR/src/index.js exits 1 with the fix named, before touching any database', () => {
        const run = spawnSync(process.execPath, ['serverXR/src/index.js'], { cwd: repoRoot, env: bareEnv(), encoding: 'utf8', timeout: 20000 })
        expect(run.status).toBe(1)
        expect(run.stderr).toContain('serverXR refuses to start')
        expect(run.stderr).toContain('di-dev up <tree>')
    })

    it('npm run dev (scripts/dev-stack.mjs) refuses the same way and starts nothing', () => {
        const env = { ...bareEnv(), VITE_API_BASE_URL: 'http://127.0.0.1:4391/serverXR' }
        const run = spawnSync(process.execPath, ['scripts/dev-stack.mjs'], { cwd: repoRoot, env, encoding: 'utf8', timeout: 30000 })
        expect(run.status).toBe(1)
        expect(run.stderr).toContain('serverXR refuses to start')
        expect(run.stdout).not.toContain('Starting ServerXR')
    })
})

// dev-stack must not attach to a server on its port that is not this checkout's.
describe.skipIf(!fs.existsSync(path.join(repoRoot, '.git')))('npm run dev and a foreign server on its port', () => {
    it('refuses to attach, exits 1, starts nothing', async () => {
        const foreign = http.createServer((req, res) => {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, serverRoot: '/somewhere/else/serverXR', dataRoot: '/somewhere/else/data' }))
        })
        await new Promise((r) => foreign.listen(0, '127.0.0.1', r))
        const { port } = foreign.address()
        try {
            const env = { ...bareEnv(), DATA_ROOT: '/tmp/never-used', VITE_API_BASE_URL: `http://127.0.0.1:${port}/serverXR` }
            const run = await new Promise((resolve) => {
                const child = spawn(process.execPath, ['scripts/dev-stack.mjs'], { cwd: repoRoot, env })
                let err = ''; let out = ''
                child.stderr.on('data', (d) => { err += d }); child.stdout.on('data', (d) => { out += d })
                const t = setTimeout(() => child.kill('SIGTERM'), 25000)
                child.on('exit', (status) => { clearTimeout(t); resolve({ status, err, out }) })
            })
            expect(run.status).toBe(1)
            expect(run.err).toContain('Refusing to attach')
            expect(run.err).toContain('/somewhere/else/serverXR')
            expect(run.out).not.toContain('Starting front-end')
        } finally {
            foreign.close()
        }
    }, 40000)
})

describe('/api/health says whose server it is, to a direct loopback caller only', () => {
    const { registerStatusRoutes } = require('./routes/statusRoutes.js')
    const { config } = require('./config.js')
    const health = (req) => {
        const routes = {}
        registerStatusRoutes({ get: (p, h) => { routes[p] = h } }, { recentEvents: [], startedAt: 0, releaseInfo: {} })
        let body
        routes['/api/health'](req, { json: (b) => { body = b } })
        return body
    }
    it('names serverRoot and dataRoot on loopback', () => {
        const b = health({ socket: { remoteAddress: '127.0.0.1' }, headers: {} })
        expect(b.serverRoot).toBe(config.root)
        expect(b.dataRoot).toBe(config.dataDir)
    })
    it('keeps paths out of a proxied or remote answer', () => {
        expect(health({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '1.2.3.4' } }).serverRoot).toBeUndefined()
        expect(health({ socket: { remoteAddress: '10.0.0.5' }, headers: {} }).serverRoot).toBeUndefined()
    })
})
