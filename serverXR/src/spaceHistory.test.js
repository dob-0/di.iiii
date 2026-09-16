// @vitest-environment node

// The safety net's store half: restore points for every space (retention,
// listing, reading one by id, asset manifests coming back), bursts, the
// change summary, and the signed notice to the inner bot. The HTTP half —
// actor stamping from the session, the routes, the inbound Undo — is pinned
// in httpContracts.test.js.

import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { createSpaceStore } = require('./spaceStore.js')
const { initDb, closeDb, getDb } = require('./db.js')
const projectStore = require('./projectStore.js')
const { createSpaceHistory, describeCounts } = require('./spaceHistory.js')
const { actorFromAuthState, serverActor } = require('./opActor.js')

const DAY = 24 * 60 * 60 * 1000
const EMILYA = actorFromAuthState({ type: 'session', subject: 'user-emilya', label: 'Emilya', role: 'editor' })
const OWNER = actorFromAuthState({ type: 'session', subject: 'user-owner', label: 'Owner', role: 'editor' })

let tmpDir
let spacesDir
let store

beforeEach(async () => {
    initDb(':memory:')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacehistory-'))
    spacesDir = path.join(tmpDir, 'spaces')
    fs.mkdirSync(spacesDir, { recursive: true })
    store = createSpaceStore({ spacesDir, blankScene: { objects: [] } })
    await store.upsertSpaceMeta('wcc', { label: 'WCC', ownerUserId: 'user-owner', sceneVersion: 1 })
    await store.ensureSpaceScene('wcc')
    fs.writeFileSync(path.join(spacesDir, 'wcc', 'scene.json'), JSON.stringify({ objects: [{ id: 'floor' }] }))
})

afterEach(() => {
    closeDb()
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('restore points', () => {
    it('records why and by whom, and lists newest first', async () => {
        const t0 = Date.parse('2026-09-16T10:00:00.000Z')
        await store.takeRestorePoint('wcc', { reason: 'before-change', actor: EMILYA, now: t0 })
        await store.takeRestorePoint('wcc', { reason: 'before-scene-replace', actor: OWNER, now: t0 + 1000 })
        const list = await store.listSpaceSnapshots('wcc')
        expect(list.map((s) => s.reason)).toEqual(['before-scene-replace', 'before-change'])
        expect(list[1]).toMatchObject({
            id: '2026-09-16T10-00-00-000Z',
            takenAt: '2026-09-16T10:00:00.000Z',
            actor: { subject: 'user-emilya', type: 'session', label: 'Emilya' },
            objects: 1
        })
    })

    it('gives two restore points in one millisecond two ids', async () => {
        const t = Date.parse('2026-09-16T10:00:00.000Z')
        const a = await store.takeRestorePoint('wcc', { now: t })
        const b = await store.takeRestorePoint('wcc', { now: t })
        expect(a.id).not.toBe(b.id)
        expect(store.isValidSnapshotId(b.id)).toBe(true)
        expect((await store.listSpaceSnapshots('wcc'))).toHaveLength(2)
    })

    it('reads one by id and refuses an id that is not the shape it writes', async () => {
        const point = await store.takeRestorePoint('wcc', { reason: 'x' })
        expect((await store.readSpaceSnapshot('wcc', point.id)).scene.objects[0].id).toBe('floor')
        expect(await store.readSpaceSnapshot('wcc', '../../etc/passwd')).toBeNull()
        expect(await store.readSpaceSnapshot('wcc', '2026-01-01T00-00-00-000Z')).toBeNull()
    })

    it('keeps the newest 30 plus the newest of each day for 30 days', async () => {
        const now = Date.parse('2026-09-16T12:00:00.000Z')
        // One point a day at noon for 40 days back (40 files), then 35 today.
        for (let d = 40; d >= 1; d -= 1) {
            await store.takeRestorePoint('wcc', { reason: `day-${d}`, now: now - d * DAY })
        }
        for (let i = 0; i < 35; i += 1) {
            await store.takeRestorePoint('wcc', { reason: `today-${i}`, now: now + i * 1000 })
        }
        const list = await store.listSpaceSnapshots('wcc')
        const reasons = list.map((s) => s.reason)
        // All but the five oldest of today's burst are in the newest 30…
        expect(reasons.filter((r) => r.startsWith('today-'))).toHaveLength(30)
        // …the newest of today counts as today's daily point already…
        expect(reasons).toContain('today-34')
        // …days 1..29 keep their one point each (inside 30 days)…
        for (let d = 1; d <= 29; d += 1) expect(reasons).toContain(`day-${d}`)
        // …and anything older than 30 days is gone.
        expect(reasons).not.toContain('day-31')
        expect(reasons).not.toContain('day-40')
    })

    it('an explicit keep is a plain count (the idle-sandbox archive)', async () => {
        for (let i = 0; i < 4; i += 1) await store.takeRestorePoint('wcc', { now: Date.now() + i, keep: 1 })
        expect(await store.listSpaceSnapshots('wcc')).toHaveLength(1)
    })

    it('brings back a deleted asset manifest when its bytes are still here', async () => {
        const hash = 'e'.repeat(64)
        await projectStore.ensureProject(spacesDir, 'wcc', 'page', { title: 'Page' })
        await projectStore.writeProjectDocument(spacesDir, 'wcc', 'page', { projectMeta: { title: 'Page' }, entities: [], assets: [{ id: hash }] })
        const assetsDir = path.join(spacesDir, 'wcc', 'projects', 'page', 'assets')
        fs.mkdirSync(assetsDir, { recursive: true })
        fs.writeFileSync(path.join(assetsDir, `${hash}.json`), JSON.stringify({ id: hash, mimeType: 'image/png' }))
        fs.mkdirSync(path.join(spacesDir, 'wcc', 'blobs'), { recursive: true })
        fs.writeFileSync(path.join(spacesDir, 'wcc', 'blobs', hash), 'png')

        const point = await store.takeRestorePoint('wcc', { reason: 'before-change' })
        fs.rmSync(path.join(assetsDir, `${hash}.json`))

        const snapshot = await store.readSpaceSnapshot('wcc', point.id)
        await store.restoreSpaceProjectDocuments('wcc', snapshot.projects, { actor: OWNER })
        expect(JSON.parse(fs.readFileSync(path.join(assetsDir, `${hash}.json`), 'utf8')).mimeType).toBe('image/png')
    })
})

describe('bursts', () => {
    const makeHistory = (overrides = {}) => {
        let clock = Date.parse('2026-09-16T10:00:00.000Z')
        const history = createSpaceHistory({
            getDb,
            takeRestorePoint: (spaceId, opts) => store.takeRestorePoint(spaceId, { ...opts, now: clock }),
            loadSpaceMeta: store.loadSpaceMeta,
            logger: { warn: () => {} },
            burstGapMs: 10 * 60 * 1000,
            now: () => clock,
            ...overrides
        })
        return { history, tick: (ms) => { clock += ms }, now: () => clock }
    }

    it('takes a restore point at the first change of each new burst only', async () => {
        const { history, tick } = makeHistory()
        expect(await history.beforeChange('wcc', OWNER)).toBeTruthy() // first ever
        tick(60_000)
        expect(await history.beforeChange('wcc', OWNER)).toBeNull() // same person, same burst
        tick(60_000)
        const point = await history.beforeChange('wcc', EMILYA) // a different person
        expect(point).toMatchObject({ reason: 'before-change', actor: { subject: 'user-emilya' } })
        tick(60_000)
        expect(await history.beforeChange('wcc', EMILYA)).toBeNull()
        tick(11 * 60_000)
        expect(await history.beforeChange('wcc', EMILYA)).toBeTruthy() // came back after a pause
    })

    it('always takes one before a whole replace, even mid-burst', async () => {
        const { history, tick } = makeHistory()
        await history.beforeChange('wcc', OWNER)
        tick(1000)
        expect(await history.beforeChange('wcc', OWNER, { reason: 'before-scene-replace' }))
            .toMatchObject({ reason: 'before-scene-replace' })
    })

    it('rebuilds the last author from the op log after a restart', async () => {
        const { history, now } = makeHistory()
        await store.appendOpsHistory('wcc', [{ opId: 'a', type: 'addObject', payload: { object: { id: 'x' } }, version: 2, timestamp: now() }], 500, 0, EMILYA)
        // A fresh process (this history object) sees Emilya was last, a moment ago.
        expect(await history.beforeChange('wcc', EMILYA)).toBeNull()
        expect(await history.beforeChange('wcc', OWNER)).toBeTruthy()
    })
})

describe('change summary', () => {
    it('groups by author and burst and says it plainly', async () => {
        const t = Date.parse('2026-09-16T10:00:00.000Z')
        const history = createSpaceHistory({ getDb, takeRestorePoint: store.takeRestorePoint, loadSpaceMeta: store.loadSpaceMeta, burstGapMs: 10 * 60 * 1000, now: () => t + DAY })
        const op = (type, payload, version, ts) => ({ opId: `op-${version}`, type, payload, version, timestamp: ts })
        await store.appendOpsHistory('wcc', [
            op('addObject', { object: { id: 'i1', type: 'image' } }, 2, t),
            op('addObject', { object: { id: 'i2', type: 'image' } }, 3, t + 1000),
            op('deleteObject', { objectId: 'floor' }, 4, t + 2000)
        ], 500, 0, EMILYA)
        await projectStore.ensureProject(spacesDir, 'wcc', 'page', { title: 'Page' })
        await projectStore.appendProjectOps(spacesDir, 'wcc', 'page', [
            op('setProjectMeta', { patch: { title: 'New title' } }, 1, t + 3000)
        ], 500, 0, EMILYA)
        await store.appendOpsHistory('wcc', [op('updateObject', { objectId: 'i1', patch: {} }, 5, t + 4000)], 500, 0, OWNER)
        // Emilya again, after a long pause: a second burst of hers.
        await store.appendOpsHistory('wcc', [op('addObject', { object: { id: 'b' } }, 6, t + 60 * 60_000)], 500, 0, EMILYA)

        const groups = history.summarizeChanges('wcc', { since: t - 1 })
        expect(groups.map((g) => g.actor.label)).toEqual(['Emilya', 'Owner', 'Emilya'])
        expect(groups[0].counts).toMatchObject({ added: 2, removed: 1, titleChanges: 1, addedKinds: { image: 2 } })
        expect(groups[0].projects).toEqual([{ id: 'page', title: 'Page' }])
        expect(groups[0].text).toBe('Emilya · wcc (scene, Page) · +2 images, 1 object removed, title changed')
        expect(groups[2].text).toContain('+1 object')
    })

    it('labels history from before authors were recorded as unknown', async () => {
        const history = createSpaceHistory({ getDb, takeRestorePoint: store.takeRestorePoint, loadSpaceMeta: store.loadSpaceMeta })
        await store.appendOpsHistory('wcc', [{ opId: 'old', type: 'addObject', payload: { object: { id: 'o' } }, version: 2, timestamp: Date.now() }])
        const [group] = history.summarizeChanges('wcc', { since: 0 })
        expect(group.actor).toEqual({ subject: null, type: null, label: 'Unknown (before authors were recorded)' })
    })

    it('describeCounts reads like a sentence', () => {
        expect(describeCounts({ added: 0, removed: 0, changed: 0, addedKinds: {}, assetsAdded: 0, assetsRemoved: 0, titleChanges: 0, sceneReplaced: 1, projectsReplaced: 0, settings: 0 }))
            .toBe('whole scene replaced')
    })
})

describe('the notice to the inner bot', () => {
    const SECRET = 'notice-secret'
    const setup = ({ enabled = true } = {}) => {
        let clock = Date.parse('2026-09-16T10:00:00.000Z')
        const sent = []
        const httpRequest = async (url, { headers, body }) => { sent.push({ url, headers, body }); return { ok: true } }
        const history = createSpaceHistory({
            getDb,
            takeRestorePoint: (spaceId, opts) => store.takeRestorePoint(spaceId, { ...opts, now: clock }),
            loadSpaceMeta: store.loadSpaceMeta,
            config: { approval: { contentNotices: enabled, botUrl: 'http://bot.test', secret: SECRET }, siteOrigin: 'https://diiii.xyz' },
            httpRequest,
            logger: { warn: () => {} },
            burstGapMs: 60_000,
            now: () => clock
        })
        let version = 1
        const edit = async (actor, id) => {
            await history.beforeChange('wcc', actor)
            version += 1
            await store.appendOpsHistory('wcc', [{ opId: id, type: 'addObject', payload: { object: { id, type: 'image' } }, version, timestamp: clock }], 500, 0, actor)
            clock += 1000
        }
        return { history, sent, edit }
    }

    it('is off by default', async () => {
        const { history, sent, edit } = setup({ enabled: false })
        await edit(EMILYA, 'a')
        await history.flushAll()
        expect(history.noticesEnabled()).toBe(false)
        expect(sent).toHaveLength(0)
    })

    it('sends ONE signed notice per non-owner burst, carrying the point to undo to', async () => {
        const { history, sent, edit } = setup()
        await edit(EMILYA, 'a')
        await edit(EMILYA, 'b')
        const pointBefore = (await store.listSpaceSnapshots('wcc'))[0]
        await history.flushAll()
        await history.flushAll()
        expect(sent).toHaveLength(1)
        const [{ url, headers, body }] = sent
        expect(url).toBe('http://bot.test/content-changed')
        const expected = crypto.createHmac('sha256', SECRET).update(`${headers['X-DII-Timestamp']}.${body}`).digest('hex')
        expect(headers['X-DII-Signature']).toBe(`sha256=${expected}`)
        const payload = JSON.parse(body)
        expect(payload).toMatchObject({
            kind: 'content.changed',
            space: { id: 'wcc', label: 'WCC', ownerUserId: 'user-owner' },
            actor: { subject: 'user-emilya', type: 'session', label: 'Emilya' },
            summary: { text: 'Emilya · WCC (scene) · +2 images', counts: { added: 2 } },
            link: 'https://diiii.xyz/wcc',
            undo: { snapshotId: pointBefore.id, method: 'POST', path: '/api/content-changes/undo', body: { spaceId: 'wcc', snapshotId: pointBefore.id } }
        })
    })

    it('closes the previous burst when someone else starts', async () => {
        const { sent, edit } = setup()
        await edit(EMILYA, 'a')
        await edit(OWNER, 'b')
        await new Promise((r) => setTimeout(r, 20))
        expect(sent).toHaveLength(1)
        expect(JSON.parse(sent[0].body).actor.subject).toBe('user-emilya')
    })

    it('says nothing about the owner, a server change, a sandbox or the Open Space', async () => {
        const { history, sent, edit } = setup()
        await edit(OWNER, 'a')
        await history.flushAll()
        await edit(serverActor('undo'), 'b')
        await history.flushAll()
        await store.upsertSpaceMeta('wcc', { kind: 'global' })
        await edit(EMILYA, 'c')
        await history.flushAll()
        expect(sent).toHaveLength(0)
    })

    it('fails quietly when the bot is down', async () => {
        const history = createSpaceHistory({
            getDb,
            takeRestorePoint: store.takeRestorePoint,
            loadSpaceMeta: store.loadSpaceMeta,
            config: { approval: { contentNotices: true, botUrl: 'http://bot.test', secret: SECRET } },
            httpRequest: async () => { throw new Error('ECONNREFUSED') },
            logger: { warn: () => {} }
        })
        await history.beforeChange('wcc', EMILYA)
        await store.appendOpsHistory('wcc', [{ opId: 'z', type: 'addObject', payload: { object: { id: 'z' } }, version: 2, timestamp: Date.now() }], 500, 0, EMILYA)
        await expect(history.flushAll()).resolves.toBeUndefined()
    })
})
