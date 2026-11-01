// @vitest-environment node
//
// Continue, never recreate (owner 2026-11-02, N1880), against the REAL server:
// a second space or project under the same stem is refused with the existing id,
// `newAnyway` with a reason passes, unrelated names pass. Loopback only.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawnServerUntilReady } from './testSupport/spawnServer.mjs'

vi.setConfig({ testTimeout: 40_000, hookTimeout: 40_000 })

const SERVER_ENTRY = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'src/index.js')
const cleanups = []
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c() })

const start = async () => {
    const base = await mkdtemp(path.join(os.tmpdir(), 'dii-continue-'))
    const client = path.join(base, 'dist')
    await mkdir(client, { recursive: true })
    await writeFile(path.join(client, 'index.html'), '<div id="root"></div>')
    const data = path.join(base, 'data')
    await mkdir(data)
    const env = { ...process.env }
    delete env.TLS_CERT
    delete env.TLS_KEY
    const { child, port } = await spawnServerUntilReady({
        entry: SERVER_ENTRY,
        cwd: base,
        env: {
            ...env, NODE_ENV: 'production', DI_LOCAL: '1', HOST: '127.0.0.1', APP_BASE_PATH: '/serverXR', CLIENT_DIR: client,
            DATA_ROOT: data, REQUIRE_AUTH: 'false', AUTH_SESSION_SECRET: 'test-session-secret', AUTH_SESSION_COOKIE_SECURE: 'false', DI_RIG: '0'
        }
    })
    cleanups.push(async () => {
        if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise((r) => { child.once('exit', r); setTimeout(r, 3000) }) }
        await rm(base, { recursive: true, force: true })
    })
    const post = async (route, body) => {
        const res = await fetch(`http://127.0.0.1:${port}/serverXR${route}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        })
        return { status: res.status, body: await res.json().catch(() => ({})) }
    }
    return { post }
}

describe('continue, never recreate — server doors', () => {
    it('refuses a similar space with the existing id, lets newAnyway and unrelated names through', async () => {
        const { post } = await start()
        expect((await post('/api/spaces', { label: 'Cinema House', permanent: true })).status).toBe(201)

        const twin = await post('/api/spaces', { label: 'cinema-house-3d', permanent: true })
        expect(twin.status).toBe(409)
        expect(twin.body.error).toBe('space_exists_similar')
        expect(twin.body.existing).toBe('cinema-house')
        expect(twin.body.hint).toMatch(/continue it/)

        // the exact id keeps its own refusal
        const exact = await post('/api/spaces', { label: 'Cinema House', permanent: true })
        expect(exact.status).toBe(409)
        expect(exact.body.error).toBe('Space already exists.')

        // an explicit id is compared by id too
        const byId = await post('/api/spaces', { slug: 'cinema-house-v2', label: 'Something Else' })
        expect(byId.status).toBe(409)
        expect(byId.body.existing).toBe('cinema-house')

        const anyway = await post('/api/spaces', { label: 'cinema-house-3d', permanent: true, newAnyway: 'a different building' })
        expect(anyway.status).toBe(201)

        expect((await post('/api/spaces', { label: 'Hayfilm', permanent: true })).status).toBe(201)
    })

    it('refuses a similar project title in a space, with the existing id', async () => {
        const { post } = await start()
        expect((await post('/api/spaces', { label: 'Hall Space', permanent: true })).status).toBe(201)
        const first = await post('/api/spaces/hall-space/projects', { title: 'Hall Scene' })
        expect(first.status).toBe(201)

        const again = await post('/api/spaces/hall-space/projects', { title: 'Hall Scene v2' })
        expect(again.status).toBe(409)
        expect(again.body.error).toBe('project_exists_similar')
        expect(again.body.existing).toBe(first.body.project.id)
        expect(again.body.hint).toMatch(/new version of/)

        expect((await post('/api/spaces/hall-space/projects', { title: 'Hall Scene v2', newAnyway: 'a rebuilt layout' })).status).toBe(201)
        expect((await post('/api/spaces/hall-space/projects', { title: 'Lobby' })).status).toBe(201)
    })
})
