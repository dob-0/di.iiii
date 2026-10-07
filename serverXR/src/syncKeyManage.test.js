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
import { DatabaseSync } from 'node:sqlite'
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

// A signed-in admin, the way a browser session arrives: a real account row
// (seeded below — accounts come from an OAuth callback a fixture cannot run)
// and the cookie the server's own signer would mint. A manage key is minted
// only by such a person (§13.4; review H1).
const OWNER_ID = 'owner-under-test'
const ownerCookie = `dii_serverxr_session=${createAuthSessionValue({
    secret: SESSION_SECRET,
    session: { subject: 'owner-under-test', label: 'Owner', role: 'admin', spaces: [], tokenVersion: 0 }
}).value}`

const call = async (route, { method = 'GET', body = null, token = null, cookie = null, also = null } = {}) => {
    // The second key of a move rides in the body (review L4), never a header.
    const sent = also ? { ...(body || {}), alsoSyncKey: also } : body
    const response = await fetch(`${server.baseUrl}${route}`, {
        method,
        headers: {
            Accept: 'application/json',
            ...(sent ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(cookie ? { Cookie: cookie } : {})
        },
        ...(sent ? { body: JSON.stringify(sent) } : {})
    })
    return { status: response.status, payload: await response.json().catch(() => null), setCookie: response.headers.get('set-cookie') || '' }
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
/** A space whose owner is OWNER_ID — a key may move projects only between two spaces of one owner (review C1). */
const ownedSpace = async (id, { isPublic = false } = {}) => {
    const made = await asAdmin('/api/spaces', { method: 'POST', body: { slug: id, label: id, permanent: true } })
    expect(made.status, JSON.stringify(made.payload)).toBe(201)
    const owned = await asAdmin(`/api/spaces/${id}`, { method: 'PATCH', body: { ownerUserId: OWNER_ID, ...(isPublic ? { isPublic: true } : {}) } })
    expect(owned.status, JSON.stringify(owned.payload)).toBe(200)
    expect(owned.payload.space?.ownerUserId ?? OWNER_ID).toBe(OWNER_ID)
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
    const db = new DatabaseSync(path.join(sandbox.data, 'di.db'))
    const now = Date.now()
    db.prepare('INSERT INTO users (id, provider, provider_id, email, display_name, role, spaces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(OWNER_ID, 'github', OWNER_ID, `${OWNER_ID}@example.com`, 'Owner', 'admin', '[]', now, now)
    db.close()
    for (const id of ['space-a', 'space-b']) await ownedSpace(id)
    await ownedSpace('open-c', { isPublic: true })
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

    it('a token never can through a session made from it, and a manage key lives 90 days, an edit key a year', async () => {
        const session = await call('/api/auth/session', { method: 'POST', body: { token: ADMIN_TOKEN } })
        expect(session.status).toBe(200)
        const cookie = /dii_serverxr_session=[^;]+/.exec(session.setCookie || '')?.[0]
        expect(cookie).toBeTruthy()
        const minted = await call('/api/spaces/space-a/sync-keys', { method: 'POST', cookie, body: { label: 'from a token', manage: true } })
        expect(minted.status).toBe(403)
        expect(minted.payload.code).toBe('manage_needs_session')
        const day = 24 * 60 * 60 * 1000
        const manage = (await mint('space-a', { manage: true })).payload.key
        const edit = (await mint('space-a')).payload.key
        expect(Math.round((manage.expiresAt - manage.createdAt) / day)).toBe(90)
        expect(Math.round((edit.expiresAt - edit.createdAt) / day)).toBe(365)
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

    beforeAll(async () => {
        manageA = tokenOf(await mint('space-a', { manage: true, label: 'aylmo follow space-a' }))
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

    it('moves a project between two spaces only with a manage key of BOTH, of one owner, where nobody new can see it', async () => {
        // Two spaces of one owner, each with only the follow's manage key out.
        await ownedSpace('move-from')
        await ownedSpace('move-to')
        const keyFrom = tokenOf(await mint('move-from', { manage: true, label: 'aylmo follow move-from' }))
        const keyTo = tokenOf(await mint('move-to', { manage: true }))
        const project = await makeProject('move-from', 'manage-move')
        const alone = await call(`/api/projects/${project.id}/move`, { method: 'POST', token: keyFrom, body: { toSpace: 'move-to' } })
        expect(alone.status).toBe(403)
        expect(alone.payload.code).toBe('sync_key_needs_both')
        // The old header is not read at all: only the body carries a second key.
        const viaHeader = await fetch(`${server.baseUrl}/api/projects/${project.id}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keyFrom}`, 'X-Di-Sync-Key-Also': keyTo }, body: JSON.stringify({ toSpace: 'move-to' }) })
        expect(viaHeader.status).toBe(403)
        // An edit key of the other space is not enough — and a bad second key fails the request closed.
        const editTo = await mint('move-to')
        expect((await call(`/api/projects/${project.id}/move`, { method: 'POST', token: keyFrom, also: editTo.payload.token, body: { toSpace: 'move-to' } })).status).toBe(401)
        expect((await call(`/api/projects/${project.id}/move`, { method: 'POST', token: keyFrom, also: 'dii_sync_mnothing.wrong', body: { toSpace: 'move-to' } })).status).toBe(401)
        // That edit key is one more holder who would newly see the project: refused, until it is taken back.
        const widened = await call(`/api/projects/${project.id}/move`, { method: 'POST', token: keyFrom, also: keyTo, body: { toSpace: 'move-to' } })
        expect(widened.status).toBe(403)
        expect(widened.payload.code).toBe('sync_key_never_public')
        expect(widened.payload.error).toMatch(/other sync keys out.*do this signed in/)
        expect((await asOwner(`/api/spaces/move-to/sync-keys/${editTo.payload.key.id}`, { method: 'DELETE' })).status).toBe(200)
        // The keys the wrong way round: the bearer must reach the space the project is in.
        expect((await call(`/api/projects/${project.id}/move`, { method: 'POST', token: keyTo, also: keyFrom, body: { toSpace: 'move-to' } })).status).toBe(403)
        expect(await liveIn('move-from', project.id)).toBeTruthy()
        // A second key widens nothing but the move: it is no editor right on its space.
        const toProject = await makeProject('move-to', 'to-only')
        expect((await call(`/api/projects/${toProject.id}`, { method: 'PATCH', token: keyFrom, also: keyTo, body: { title: 'not yours' } })).status).toBe(403)

        const moved = await call(`/api/projects/${project.id}/move`, { method: 'POST', token: keyFrom, also: keyTo, body: { toSpace: 'move-to' } })
        expect(moved.status, JSON.stringify(moved.payload)).toBe(200)
        expect(await liveIn('move-to', project.id)).toBeTruthy()
        expect(await liveIn('move-from', project.id)).toBe(null)
        // Moves INTO a space are in that space's log too, with the second key named.
        const into = (await asOwner('/api/spaces/move-to/sync-keys/actions')).payload.actions
        expect(into.some(row => row.action === 'move' && row.toSpaceId === 'move-to' && row.outcome === 'done' && row.alsoKeyId)).toBe(true)
    })

    it('never moves where somebody new could see it: another owner, an account the source is not shared with, an open space', async () => {
        await ownedSpace('closed-src')
        await ownedSpace('shared-dst')
        await ownedSpace('open-dst', { isPublic: true })
        const src = tokenOf(await mint('closed-src', { manage: true }))
        const shared = tokenOf(await mint('shared-dst', { manage: true }))
        const open = tokenOf(await mint('open-dst', { manage: true }))
        // shared-dst is shared with one more account than closed-src.
        const db = new DatabaseSync(path.join(sandbox.data, 'di.db'))
        const now = Date.now()
        db.prepare('INSERT INTO users (id, provider, provider_id, email, display_name, role, spaces, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run('friend-under-test', 'github', 'friend-under-test', 'friend@example.com', 'Friend', 'editor', JSON.stringify(['shared-dst']), now, now)
        db.close()
        const project = await makeProject('closed-src', 'stays-closed')
        const toShared = await call(`/api/projects/${project.id}/move`, { method: 'POST', token: src, also: shared, body: { toSpace: 'shared-dst' } })
        expect(toShared.status).toBe(403)
        expect(toShared.payload.error).toMatch(/shared with 1 account/)
        const toOpen = await call(`/api/projects/${project.id}/move`, { method: 'POST', token: src, also: open, body: { toSpace: 'open-dst' } })
        expect(toOpen.status).toBe(403)
        expect(toOpen.payload.code).toBe('sync_key_never_public')
        const unpublish = await call(`/api/projects/${project.id}/move`, { method: 'POST', token: src, also: open, body: { toSpace: 'open-dst', unpublish: true } })
        expect(unpublish.status).toBe(403)
        // Spaces with no owner (made by the admin token) never take a key's move: fail closed.
        expect((await asAdmin('/api/spaces', { method: 'POST', body: { slug: 'no-owner', label: 'no-owner', permanent: true } })).status).toBe(201)
        const ownerless = tokenOf(await mint('no-owner', { manage: true }))
        const notSame = await call(`/api/projects/${project.id}/move`, { method: 'POST', token: src, also: ownerless, body: { toSpace: 'no-owner' } })
        expect(notSame.status).toBe(403)
        expect(notSame.payload.code).toBe('sync_key_not_same_owner')
        expect(await liveIn('closed-src', project.id)).toBeTruthy()
        // Private first, then into the open space: visitors still do not see it.
        expect((await call(`/api/projects/${project.id}`, { method: 'PATCH', token: src, body: { visibility: 'private' } })).status).toBe(200)
        expect((await call(`/api/projects/${project.id}/move`, { method: 'POST', token: src, also: open, body: { toSpace: 'open-dst' } })).status).toBe(200)
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
        expect(seen).toContain('trash:refused')
        expect(mine.every(row => typeof row.at === 'number' && row.keyId)).toBe(true)
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

    it('caps a key\'s refusals, oldest first, and never pushes its done actions out of the owner\'s view', async () => {
        await ownedSpace('flood-me')
        const issued = await mint('flood-me', { manage: true, label: 'flooder' })
        const key = tokenOf(issued)
        const ids = []
        for (let i = 0; i < 3; i += 1) ids.push((await makeProject('flood-me', `flood-${i}`)).id)
        for (const id of ids) expect((await call(`/api/projects/${id}`, { method: 'DELETE', token: key })).status).toBe(200)
        const target = await makeProject('flood-me', 'flood-target')
        for (let i = 0; i < 130; i += 1) expect((await call(`/api/projects/${target.id}`, { method: 'PATCH', token: key, body: { visibility: 'public' } })).status).toBe(403)
        const rows = (await asOwner(`/api/spaces/flood-me/sync-keys/actions?key=${issued.payload.key.id}&limit=1000`)).payload.actions
        expect(rows.filter(row => row.action === 'trash' && row.outcome === 'done')).toHaveLength(3)
        expect(rows.filter(row => row.outcome === 'refused')).toHaveLength(100)
        // With a small page, done rows are still there.
        const page = (await asOwner('/api/spaces/flood-me/sync-keys/actions?limit=5')).payload.actions
        expect(page.filter(row => row.outcome === 'done')).toHaveLength(3)
    })

    it('undo revokes the key and restores, un-hides and moves back what it did — from a session only', async () => {
        await ownedSpace('undo-a')
        await ownedSpace('undo-b')
        const minted = await mint('undo-a', { manage: true, label: 'undo me' })
        const key = tokenOf(minted)
        const keyId = minted.payload.key.id
        const keyB = tokenOf(await mint('undo-b', { manage: true }))
        const trashed = await makeProject('undo-a', 'undo-trashed')
        const hidden = await makeProject('undo-a', 'undo-hidden')
        const moved = await makeProject('undo-a', 'undo-moved')
        const rehidden = await makeProject('undo-a', 'undo-rehidden')
        expect((await call(`/api/projects/${trashed.id}`, { method: 'DELETE', token: key })).status).toBe(200)
        expect((await call(`/api/projects/${hidden.id}`, { method: 'PATCH', token: key, body: { visibility: 'private' } })).status).toBe(200)
        expect((await call(`/api/projects/${moved.id}/move`, { method: 'POST', token: key, also: keyB, body: { toSpace: 'undo-b' } })).status).toBe(200)
        // The owner re-decides one: public, then private again on purpose. The undo leaves it private (review M1).
        expect((await call(`/api/projects/${rehidden.id}`, { method: 'PATCH', token: key, body: { visibility: 'private' } })).status).toBe(200)
        expect((await asOwner(`/api/projects/${rehidden.id}`, { method: 'PATCH', body: { visibility: 'public' } })).status).toBe(200)
        expect((await asOwner(`/api/projects/${rehidden.id}`, { method: 'PATCH', body: { visibility: 'private' } })).status).toBe(200)

        expect((await asAdmin(`/api/spaces/undo-a/sync-keys/${keyId}/undo`, { method: 'POST' })).status).toBe(403)
        const undo = await asOwner(`/api/spaces/undo-a/sync-keys/${keyId}/undo`, { method: 'POST' })
        expect(undo.status).toBe(200)
        expect(undo.payload.revoked).toBe(true)
        expect(undo.payload.restored).toEqual([trashed.id])
        expect(undo.payload.madePublic).toEqual([hidden.id])
        expect(undo.payload.movedBack).toEqual([moved.id])
        expect(undo.payload.notUndone).toEqual([{ projectId: rehidden.id, action: 'private', why: expect.stringMatching(/changed after the key/) }])

        expect(await liveIn('undo-a', trashed.id)).toBeTruthy()
        expect((await liveIn('undo-a', hidden.id)).visibility).toBe('public')
        expect((await liveIn('undo-a', rehidden.id)).visibility).toBe('private')
        expect(await liveIn('undo-a', moved.id)).toBeTruthy()
        // The key is dead.
        expect((await call('/api/sync-keys/self', { token: key })).status).toBe(404)
        expect((await call(`/api/projects/${hidden.id}`, { method: 'DELETE', token: key })).status).toBe(401)
    })
})
