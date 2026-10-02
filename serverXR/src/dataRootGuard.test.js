// @vitest-environment node
// Regression guard for the stray-database bug class (known-fixes, 2026-10-02):
// serverXR in a git checkout must refuse a relative or unset DATA_ROOT.

import { spawnSync } from 'node:child_process'
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
