// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { spawnServerUntilReady } from './testSupport/spawnServer.mjs'

vi.setConfig({ testTimeout: 25_000, hookTimeout: 40_000 })

// The Still and Recorder nodes (stream.still, stream.recorder) save a project
// file through POST /api/projects/:id/assets. Their registry entries no longer
// carry `authoringOnly`, which is only a palette hint and never gated anything.
// The gate is the server's: a visitor (no sign-in, or a viewer) must not be
// able to put a file into a PUBLIC project, the way Still's upload does.

const SERVER_ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'index.js')
const ADMIN = 'gate-admin-token'
const EDITOR = 'gate-editor-token' // editor of the space
const VIEWER = 'gate-viewer-token' // signed-in viewer of the space

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let server = null

const as = (token) => (token ? { Authorization: `Bearer ${token}` } : {})

// One PNG-named upload, exactly the shape the Still window sends.
const stillUpload = (token) => {
    const form = new FormData()
    form.append('asset', new Blob([Uint8Array.from([1, 2, 3, 4])], { type: 'application/octet-stream' }), 'still-scene-2026-10-21T14-03-07.bin')
    return fetch(`${server.baseUrl}/api/projects/door/assets`, { method: 'POST', headers: as(token), body: form })
}

beforeAll(async () => {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'dii-gate-cwd-'))
    const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'dii-gate-data-'))
    const { child, port } = await spawnServerUntilReady({ entry: SERVER_ENTRY, cwd, env: {
        ...process.env,
        NODE_ENV: 'production',
        APP_BASE_PATH: '/serverXR',
        DATA_ROOT: dataRoot,
        API_TOKEN: ADMIN,
        EDITOR_API_TOKEN: EDITOR,
        EDITOR_ALLOWED_SPACES: 'show',
        VIEWER_API_TOKEN: VIEWER,
        VIEWER_ALLOWED_SPACES: 'show',
        REQUIRE_AUTH: 'true',
        CORS_ORIGINS: '*',
        AUTH_SESSION_SECRET: 'gate-session-secret',
        AUTH_SESSION_COOKIE_SECURE: 'false',
        AUTH_HUB_URL: 'off'
    } })
    server = {
        baseUrl: `http://127.0.0.1:${port}/serverXR`,
        stop: async () => {
            if (child.exitCode === null) {
                child.kill('SIGTERM')
                await Promise.race([new Promise((r) => child.once('exit', r)), wait(3000)])
                if (child.exitCode === null) child.kill('SIGKILL')
            }
            await rm(cwd, { recursive: true, force: true })
            await rm(dataRoot, { recursive: true, force: true })
        }
    }
    const post = (url, body) => fetch(`${server.baseUrl}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...as(ADMIN) },
        body: JSON.stringify(body)
    })
    expect((await post('/api/spaces', { label: 'The Show', slug: 'show' })).status).toBe(201)
    expect((await post('/api/spaces/show/projects', { title: 'The Door', slug: 'door' })).status).toBe(201)
})

afterAll(async () => { await server?.stop() })

describe('a project file written the way Still writes it', () => {
    it('is refused for a visitor with no sign-in', async () => {
        expect((await stillUpload(null)).status).toBe(401)
    })

    it('is refused for a viewer of the space', async () => {
        expect((await stillUpload(VIEWER)).status).toBe(403)
    })

    it('is accepted for an editor of the space and for an admin', async () => {
        expect((await stillUpload(EDITOR)).status).toBe(200)
        expect((await stillUpload(ADMIN)).status).toBe(200)
    })
})
