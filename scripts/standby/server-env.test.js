// @vitest-environment node
//
// server-env.mjs derives a standby tier's server env from the compose files that tier ran on the
// VPS, so it cannot drift from them. Two tiers: prod = docker-compose.yml; dev = docker-compose.yml
// then docker-compose.dev.yml, whose DEV_* names replace the base keys the way `docker compose -f a
// -f b` merges a service's environment. These run the script as the deploy runs it (a child node
// process, fixtures on disk) against the repo's REAL compose files, with a synthetic .env: every
// value is its own name, so no secret is involved and every mapping is visible.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCRIPT = path.join(ROOT_DIR, 'scripts', 'standby', 'server-env.mjs')
const BASE = path.join(ROOT_DIR, 'docker-compose.yml')
const DEV = path.join(ROOT_DIR, 'docker-compose.dev.yml')

const dirs = []
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }) })
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'server-env-')); dirs.push(d); return d }

// every ${NAME...} the given compose files reference, each set to "v-NAME"
const fakeEnv = (files, drop = []) => {
    const names = new Set()
    for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(m[1])
    for (const d of drop) names.delete(d)
    const p = path.join(tmp(), '.env')
    fs.writeFileSync(p, [...names].map((n) => `${n}=v-${n}`).join('\n') + '\n')
    return p
}
const run = (composes, env, extra = []) => {
    const args = [SCRIPT, ...composes.flatMap((c) => ['--compose', c]), '--env', env, '--data-root', '/srv/data', ...extra]
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
    const out = {}
    for (const line of r.stdout.split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) out[m[1]] = m[2] }
    return { status: r.status, stderr: r.stderr, env: out }
}

describe('server-env.mjs', () => {
    it('prod: the base file alone, host facts replaced, hosted mode only', () => {
        const { status, env } = run([BASE], fakeEnv([BASE]), ['--set', 'MAX_UPLOAD_MB=95'])
        expect(status).toBe(0)
        expect(env.NODE_ENV).toBe('production')
        expect(env.HOST).toBe('127.0.0.1')
        expect(env.DATA_ROOT).toBe('/srv/data')
        expect(env.PORT).toBe('4000')
        expect(env.AUTH_SESSION_SECRET).toBe('v-AUTH_SESSION_SECRET')
        expect(env.MAX_UPLOAD_MB).toBe('95')
        expect(env).not.toHaveProperty('DI_LOCAL')
    })

    it('dev: docker-compose.dev.yml replaces the base keys with its DEV_* names, as Compose merges them', () => {
        const env = fakeEnv([BASE, DEV])
        const { status, env: out } = run([BASE, DEV], env, ['--set', 'PORT=4001'])
        expect(status).toBe(0)
        expect(out.AUTH_SESSION_SECRET).toBe('v-DEV_AUTH_SESSION_SECRET')
        expect(out.GOOGLE_CLIENT_ID).toBe('v-DEV_GOOGLE_CLIENT_ID')
        expect(out.OAUTH_CALLBACK_BASE_URL).toBe('v-DEV_OAUTH_CALLBACK_BASE_URL')
        expect(out.PORT).toBe('4001')
        // no key of the dev tier's server may carry a prod-named value where the dev file set one
        const devKeys = [...fs.readFileSync(DEV, 'utf8').matchAll(/^ {6}([A-Z0-9_]+): \$\{(DEV_[A-Z0-9_]+)/gm)]
        expect(devKeys.length).toBeGreaterThan(10)
        for (const [, key, devName] of devKeys) expect(out[key]).toBe(`v-${devName}`)
    })

    it('dev: refuses, with Compose\'s own message, when a ${VAR:?} the dev file demands is empty', () => {
        const env = fakeEnv([BASE, DEV], ['DEV_AUTH_SESSION_SECRET'])
        const r = run([BASE, DEV], env)
        expect(r.status).toBe(1)
        expect(r.stderr).toContain('DEV_AUTH_SESSION_SECRET is required')
        expect(r.env).toEqual({})
    })

    it('refuses to let --set turn hosted mode local', () => {
        for (const k of ['NODE_ENV', 'DI_LOCAL', 'HOST']) {
            const r = run([BASE], fakeEnv([BASE]), ['--set', `${k}=x`])
            expect(r.status).toBe(2)
        }
    })
})
