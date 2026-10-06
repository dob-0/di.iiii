// @vitest-environment node
//
// The `manage` scope on a sync key (docs/architecture/SPEC_space_sync_keys.md
// §13), against one real serverXR with auth on. Every assertion here is a
// security property: what an ordinary key still cannot do, what a manage key
// may do on its ONE space and nothing more, that only a person mints one, the
// host's own per-key limits, the key log, and the owner's one-action undo.
// Deterministic: no sleeps, no retries; each case reads the server's answer.

import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { spawnServerUntilReady } from './testSupport/spawnServer.mjs'

const require = createRequire(import.meta.url)
const { createAuthSessionValue } = require('./authSession.js')

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 })

const SERVER_ENTRY = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'src/index.js')
const ADMIN_TOKEN = 'manage-scope-admin-token'
const SESSION_SECRET = 'manage-scope-session-secret'

let server = null
let sandbox = null

// A signed-in admin, the way a browser session arrives (the cookie the server
// itself mints; no account row is needed for an admin role).
const ownerCookie = `dii_serverxr_session=${createAuthSessionValue({
    secret: SESSION_SECRET,
    session: { subject: 'owner-under-test', label: 'Owner', role: 'admin', spaces: [], tokenVersion: 0 }
}).value}`

const call = async (route, { method = 'GET', body = null, token = null, cookie = null, also = null } = {}) => {
    const response = await fetch(`${server.baseUrl}${route}`, {
        method,
        headers: {
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...(also ? { 'X-Di-Sync-Key-Also': also } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    })
    return { status: response.status, payload: await response.json().catch(() => null) }
}
const asAdmin = (route, options = {}) => call(route, { ...options, token: ADMIN_TOKEN })
const asOwner = (route, options = {}) => call(route, { ...options, cookie: ownerCookie })

const mint = async (spaceId, { manage = false, by = 'owner', label = null } = {}) => {
    const route = `/api/spaces/${spaceId}/sync-keys`
    const body = { label: label || `${manage ? 'manage' : 'edit'} ${spaceId}`, ...(manage ? { manage: true } : {}) }
    return by === 'owner' ? asOwner(route, { method: 'POST', body }) : call(route, { method: 'POST', body, token: by })
}
const tokenOf = (answer) => {
    expect(answer.status).toBe(201)
    return answer.payload.token
}
const makeProject = async (spaceId, slug) => {
    const made = await asAdmin(`/api/spaces/${spaceId}/projects`, { method: 'POST', body: { slug, title: slug } })
    expect(made.status).toBe(201)
    return made.payload.project
}
const liveIn = async (spaceId, id) => ((await asAdmin(`/api/spaces/${spaceId}/projects`)).payload?.projects || []).find(row => row.id === id) || null
const inTrash = async (spaceId, id) => ((await asAdmin(`/api/trash?space=${spaceId}`)).payload?.projects || []).some(row => row.id === id)

beforeAll(async () => {
    sandbox = {
        cwd: await mkdtemp(path.join(os.tmpdir(), 'dii-manage-cwd-')),
        data: await mkdtemp(path.join(os.tmpdir(), 'dii-manage-data-'))
    }
    const { child, port } = await spawnServerUntilReady({
        entry: SERVER_ENTRY,
        cwd: sandbox.cwd,
        env: {
            ...process.env,
            NODE_ENV: 'test',
            APP_BASE_PATH: '/serverXR',
            DATA_ROOT: sandbox.data,
            API_TOKEN: ADMIN_TOKEN,
            REQUIRE_AUTH: 'true',
            AUTH_SESSION_SECRET: SESSION_SECRET,
            AUTH_SESSION_COOKIE_SECURE: 'false',
            AUTH_HUB_URL: 'off',
            CORS_ORIGINS: '*',
            DI_LOCAL: ''
        }
    })
    server = { baseUrl: `http://127.0.0.1:${port}/serverXR`, child }
    for (const id of ['space-a', 'space-b', 'open-c']) {
        const made = await asAdmin('/api/spaces', { method: 'POST', body: { slug: id, label: id, permanent: true } })
        expect(made.status, JSON.stringify(made.payload)).toBe(201)
    }
    expect((await asAdmin('/api/spaces/open-c', { method: 'PATCH', body: { isPublic: true } })).status).toBe(200)
})

afterAll(async () => {
    if (server?.child && server.child.exitCode === null) {
        server.child.kill('SIGTERM')
        await new Promise(resolve => server.child.once('exit', resolve))
    }
    if (sandbox) {
        await rm(sandbox.cwd, { recursive: true, force: true })
        await rm(sandbox.data, { recursive: true, force: true })
    }
})

describe('who can mint a manage key', () => {
    it('a signed-in owner session can; the key says its scope, and an ordinary mint stays edit', async () => {
        const manage = await mint('space-a', { manage: true })
        expect(manage.status).toBe(201)
        expect(manage.payload.key.scope).toBe('manage')
        const edit = await mint('space-a')
        expect(edit.payload.key.scope).toBe('edit')
        const listed = (await asOwner('/api/spaces/space-a/sync-keys')).payload.keys
        expect(listed.map(key => key.scope).sort()).toEqual(['edit', 'manage'])
        // The list never carries a secret.
        expect(JSON.stringify(listed)).not.toMatch(/dii_sync_/)
    })

    it('a bearer token never can — the static admin token included', async () => {
        const answer = await mint('space-a', { manage: true, by: ADMIN_TOKEN })
        expect(answer.status).toBe(403)
        expect(answer.payload.code).toBe('manage_needs_session')
        // The admin token still mints an ordinary key, as before.
        expect((await mint('space-a', { by: ADMIN_TOKEN })).payload.key.scope).toBe('edit')
    })

    it('a sync key never can, not even a manage key of the same space', async () => {
        const manageKey = tokenOf(await mint('space-a', { manage: true }))
        expect((await mint('space-a', { manage: true, by: manageKey })).status).toBe(403)
        expect((await mint('space-a', { by: manageKey })).status).toBe(403)
    })

    it('a key can read its own scope, and nothing else answers that route', async () => {
        const manageKey = tokenOf(await mint('space-a', { manage: true }))
        const editKey = tokenOf(await mint('space-a'))
        expect((await call('/api/sync-keys/self', { token: manageKey })).payload.key).toMatchObject({ spaceId: 'space-a', scope: 'manage' })
        expect((await call('/api/sync-keys/self', { token: editKey })).payload.key).toMatchObject({ spaceId: 'space-a', scope: 'edit' })
        expect((await call('/api/sync-keys/self', { token: editKey })).payload.key.token).toBeUndefined()
        expect((await asAdmin('/api/sync-keys/self')).status).toBe(404)
    })
})

describe('an ordinary (edit) key keeps exactly its rights', () => {
    it('cannot trash, hide or move a project; can still rename and restore', async () => {
        const editKey = tokenOf(await mint('space-a'))
        const project = await makeProject('space-a', 'edit-key-target')
        expect((await call(`/api/projects/${project.id}`, { method: 'DELETE', token: editKey })).status).toBe(403)
        expect((await call(`/api/projects/${project.id}`, { method: 'PATCH', token: editKey, body: { visibility: 'private' } })).status).toBe(403)
        expect((await call(`/api/projects/${project.id}/move`, { method: 'POST', token: editKey, body: { toSpace: 'space-b' } })).status).toBe(403)
        expect((await call(`/api/projects/${project.id}`, { method: 'PATCH', token: editKey, body: { title: 'Renamed by key' } })).status).toBe(200)
        expect(await liveIn('space-a', project.id)).toBeTruthy()
        // Restore was an editor's before this change and stays one (§13.2 item 2).
        expect((await asAdmin(`/api/projects/${project.id}`, { method: 'DELETE' })).status).toBe(200)
        expect((await call(`/api/projects/${project.id}/restore`, { method: 'POST', token: editKey })).status).toBe(200)
        expect(await liveIn('space-a', project.id)).toBeTruthy()
    })
})

describe('a manage key, on its one space only', () => {
    let manageA = null
    let manageB = null
    let editB = null

    beforeAll(async () => {
        manageA = tokenOf(await mint('space-a', { manage: true, label: 'aylmo follow space-a' }))
        manageB = tokenOf(await mint('space-b', { manage: true }))
        editB = tokenOf(await mint('space-b'))
    })

    it('moves a project of its space to the trash — the soft delete, restorable', async () => {
        const project = await makeProject('space-a', 'manage-trash')
        expect((await call(`/api/projects/${project.id}`, { method: 'DELETE', token: manageA })).status).toBe(200)
        expect(await inTrash('space-a', project.id)).toBe(true)
        expect((await call(`/api/projects/${project.id}/restore`, { method: 'POST', token: manageA })).status).toBe(200)
        expect(await liveIn('space-a', project.id)).toBeTruthy()
    })

    it('cannot touch a project of another space', async () => {
        const other = await makeProject('space-b', 'not-alphas')
        expect((await call(`/api/projects/${other.id}`, { method: 'DELETE', token: manageA })).status).toBe(403)
        expect((await call(`/api/projects/${other.id}`, { method: 'PATCH', token: manageA, body: { visibility: 'private' } })).status).toBe(403)
        expect(await liveIn('space-b', other.id)).toBeTruthy()
    })

    it('makes a project private, never public', async () => {
        const project = await makeProject('space-a', 'manage-hide')
        const hidden = await call(`/api/projects/${project.id}`, { method: 'PATCH', token: manageA, body: { visibility: 'private' } })
        expect(hidden.status).toBe(200)
        expect(hidden.payload.project.visibility).toBe('private')
        const shown = await call(`/api/projects/${project.id}`, { method: 'PATCH', token: manageA, body: { visibility: 'public' } })
        expect(shown.status).toBe(403)
        expect(shown.payload.code).toBe('sync_key_never_public')
        expect((await asAdmin(`/api/projects/${project.id}`)).payload.project.visibility).toBe('private')
    })

    it('never touches the space itself, its keys, or the trash beyond the soft delete', async () => {
        expect((await call('/api/spaces/space-a', { method: 'PATCH', token: manageA, body: { label: 'taken over' } })).status).toBe(403)
        expect((await call('/api/spaces/space-a', { method: 'PATCH', token: manageA, body: { isPublic: true } })).status).toBe(403)
        expect((await call('/api/spaces/space-a', { method: 'DELETE', token: manageA })).status).toBe(403)
        expect((await call('/api/spaces/space-a/sync-keys', { token: manageA })).status).toBe(403)
        expect((await call('/api/spaces/space-a/sync-keys/actions', { token: manageA })).status).toBe(403)
        expect((await call('/api/spaces/space-a/invites', { method: 'POST', token: manageA, body: { label: 'x' } })).status).toBe(403)
        // Purge is admin's: a manage key gets no further than the soft delete.
        expect((await call('/api/admin/sandboxes/purge', { method: 'POST', token: manageA, body: {} })).status).toBe(403)
        expect(await liveIn('space-a', 'manage-hide')).toBeTruthy()
    })

    it('does not move the space\'s front door to the trash', async () => {
        const door = await makeProject('space-a', 'front-door')
        expect((await asAdmin('/api/spaces/space-a', { method: 'PATCH', body: { publishedProjectId: door.id } })).status).toBe(200)
        const answer = await call(`/api/projects/${door.id}`, { method: 'DELETE', token: manageA })
        expect(answer.status).toBe(409)
        expect(answer.payload.code).toBe('sync_key_front_door')
        expect(await liveIn('space-a', door.id)).toBeTruthy()
        expect((await asAdmin('/api/spaces/space-a', { method: 'PATCH', body: { publishedProjectId: null } })).status).toBe(200)
    })

    it('moves a project between two spaces only with a manage key of BOTH', async () => {
        const project = await makeProject('space-a', 'manage-move')
        const alone = await call(`/api/projects/${project.id}/move`, { method: 'POST', token: manageA, body: { toSpace: 'space-b' } })
        expect(alone.status).toBe(403)
        expect(alone.payload.code).toBe('sync_key_needs_both')
        // An edit key of the other space is not enough — and a bad second key fails the request closed.
        expect((await call(`/api/projects/${project.id}/move`, { method: 'POST', token: manageA, also: editB, body: { toSpace: 'space-b' } })).status).toBe(401)
        expect((await call(`/api/projects/${project.id}/move`, { method: 'POST', token: manageA, also: 'dii_sync_nothing.wrong', body: { toSpace: 'space-b' } })).status).toBe(401)
        // The keys the wrong way round: the bearer must reach the space the project is in.
        expect((await call(`/api/projects/${project.id}/move`, { method: 'POST', token: manageB, also: manageA, body: { toSpace: 'space-b' } })).status).toBe(403)
        expect(await liveIn('space-a', project.id)).toBeTruthy()
        // A second key widens nothing but the move: it is no editor right on its space.
        const betaProject = await makeProject('space-b', 'beta-only')
        expect((await call(`/api/projects/${betaProject.id}`, { method: 'PATCH', token: manageA, also: manageB, body: { title: 'not yours' } })).status).toBe(403)

        const moved = await call(`/api/projects/${project.id}/move`, { method: 'POST', token: manageA, also: manageB, body: { toSpace: 'space-b' } })
        expect(moved.status).toBe(200)
        expect(await liveIn('space-b', project.id)).toBeTruthy()
        expect(await liveIn('space-a', project.id)).toBe(null)
    })

    it('never moves a project that is not private into a space open to every visitor, nor unpublishes', async () => {
        const manageGamma = tokenOf(await mint('open-c', { manage: true }))
        const project = await makeProject('space-a', 'stays-closed')
        const open = await call(`/api/projects/${project.id}/move`, { method: 'POST', token: manageA, also: manageGamma, body: { toSpace: 'open-c' } })
        expect(open.status).toBe(403)
        expect(open.payload.code).toBe('sync_key_never_public')
        const unpublish = await call(`/api/projects/${project.id}/move`, { method: 'POST', token: manageA, also: manageB, body: { toSpace: 'space-b', unpublish: true } })
        expect(unpublish.status).toBe(403)
        expect(await liveIn('space-a', project.id)).toBeTruthy()
        // Private first, then it may go: nobody new sees it.
        expect((await call(`/api/projects/${project.id}`, { method: 'PATCH', token: manageA, body: { visibility: 'private' } })).status).toBe(200)
        expect((await call(`/api/projects/${project.id}/move`, { method: 'POST', token: manageA, also: manageGamma, body: { toSpace: 'open-c' } })).status).toBe(200)
    })

    it('every action is in the space\'s key log, with the key\'s label — and the owner reads it', async () => {
        const log = await asOwner('/api/spaces/space-a/sync-keys/actions')
        expect(log.status).toBe(200)
        const mine = log.payload.actions.filter(row => row.keyLabel === 'aylmo follow space-a')
        const seen = mine.map(row => `${row.action}:${row.outcome}`)
        expect(seen).toContain('trash:done')
        expect(seen).toContain('restore:done')
        expect(seen).toContain('private:done')
        expect(seen).toContain('private:refused')
        expect(seen).toContain('move:done')
        expect(seen).toContain('move:refused')
        expect(seen).toContain('trash:refused')
        expect(mine.every(row => typeof row.at === 'number' && row.keyId)).toBe(true)
        // Moves INTO a space are in that space's log too.
        expect((await asOwner('/api/spaces/space-b/sync-keys/actions')).payload.actions.some(row => row.action === 'move' && row.toSpaceId === 'space-b' && row.outcome === 'done')).toBe(true)
        expect(JSON.stringify(log.payload)).not.toMatch(/dii_sync_/)
    })
})

describe('the host limits each key, and the owner undoes it all in one action', () => {
    it('stops a key at 10 trashes an hour, says why, and logs the refusal', async () => {
        const leaked = await mint('space-a', { manage: true, label: 'leaked key' })
        const key = tokenOf(leaked)
        const ids = []
        for (let i = 0; i < 11; i += 1) ids.push((await makeProject('space-a', `bulk-${i}`)).id)
        for (const id of ids.slice(0, 10)) expect((await call(`/api/projects/${id}`, { method: 'DELETE', token: key })).status).toBe(200)
        const eleventh = await call(`/api/projects/${ids[10]}`, { method: 'DELETE', token: key })
        expect(eleventh.status).toBe(429)
        expect(eleventh.payload).toMatchObject({ code: 'sync_key_limit', action: 'trash', limit: 10, window: 'hour' })
        expect(eleventh.payload.error).toMatch(/moved 10 projects to the trash in the last hour/)
        expect(eleventh.payload.retryAfterMs).toBeGreaterThan(0)
        expect(await liveIn('space-a', ids[10])).toBeTruthy()
        // Another key of the same space has its own count; the owner is not limited.
        const other = tokenOf(await mint('space-a', { manage: true }))
        expect((await call(`/api/projects/${ids[10]}`, { method: 'DELETE', token: other })).status).toBe(200)
        expect((await asOwner(`/api/projects/${ids[10]}/restore`, { method: 'POST' })).status).toBe(200)

        const log = (await asOwner(`/api/spaces/space-a/sync-keys/actions?key=${leaked.payload.key.id}`)).payload.actions
        expect(log.filter(row => row.action === 'trash' && row.outcome === 'done')).toHaveLength(10)
        expect(log.filter(row => row.action === 'trash' && row.outcome === 'refused')).toHaveLength(1)
    })

    it('undo revokes the key and restores, un-hides and moves back what it did — from a session only', async () => {
        const minted = await mint('space-a', { manage: true, label: 'undo me' })
        const key = tokenOf(minted)
        const keyId = minted.payload.key.id
        const manageB = tokenOf(await mint('space-b', { manage: true }))
        const trashed = await makeProject('space-a', 'undo-trashed')
        const hidden = await makeProject('space-a', 'undo-hidden')
        const moved = await makeProject('space-a', 'undo-moved')
        expect((await call(`/api/projects/${trashed.id}`, { method: 'DELETE', token: key })).status).toBe(200)
        expect((await call(`/api/projects/${hidden.id}`, { method: 'PATCH', token: key, body: { visibility: 'private' } })).status).toBe(200)
        expect((await call(`/api/projects/${moved.id}/move`, { method: 'POST', token: key, also: manageB, body: { toSpace: 'space-b' } })).status).toBe(200)

        expect((await asAdmin(`/api/spaces/space-a/sync-keys/${keyId}/undo`, { method: 'POST' })).status).toBe(403)
        const undo = await asOwner(`/api/spaces/space-a/sync-keys/${keyId}/undo`, { method: 'POST' })
        expect(undo.status).toBe(200)
        expect(undo.payload.revoked).toBe(true)
        expect(undo.payload.restored).toEqual([trashed.id])
        expect(undo.payload.madePublic).toEqual([hidden.id])
        expect(undo.payload.movedBack).toEqual([moved.id])
        expect(undo.payload.notUndone).toEqual([])

        expect(await liveIn('space-a', trashed.id)).toBeTruthy()
        expect((await liveIn('space-a', hidden.id)).visibility).toBe('public')
        expect(await liveIn('space-a', moved.id)).toBeTruthy()
        // The key is dead.
        expect((await call('/api/sync-keys/self', { token: key })).status).toBe(404)
        expect((await call(`/api/projects/${hidden.id}`, { method: 'DELETE', token: key })).status).toBe(401)
    })
})
