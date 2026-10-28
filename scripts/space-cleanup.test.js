// @vitest-environment node
//
// scripts/space-cleanup.mjs — the owner's clean-up list of 2026-10-13 (one-place program, DESIGN §5).
// Unit tests run against an in-memory install (a fake API: nothing real is called). The last block starts a
// throwaway server process in a temp folder, the way serverXR's own contract tests do, to prove the routes
// the script relies on answer as the fake assumes.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeInstall } from './production/fakeInstall.testlib.mjs'
import { putNewEntries, readList, setStatus } from './production/versionList.mjs'
import { makeClient } from './place/api.mjs'
import { CLEANUP_PLAN, parseCliArgs, repoMentions, run } from './space-cleanup.mjs'
import { spawnServerUntilReady } from '../serverXR/src/testSupport/spawnServer.mjs'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 45_000 })

const API = 'https://fake.example/serverXR'
const TOKEN = 'sekrit-token-123'
const SET = 'moxir-2026-10-17'
const NOW = () => new Date('2026-10-13T20:30:00Z')
const META = { id: SET, title: 'MOXIR 17.10', space: 'moxir', codeList: '' }
const LOG_QUIET = () => {}

let tmp
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'space-cleanup-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

// what `git grep` would say, per space (the real one is tested on its own below)
const MENTIONS = { 'drum-rhythms': { count: 7, files: ['PROGRESS.md', 'known-fixes.md', 'docs/research/spaces-audit.md'] }, aaa: { count: 21, files: ['a', 'b', 'c'] } }
const mentions = async (id) => MENTIONS[id] || { count: 0, files: [] }

const NAMES = ['artist-walk', 'decisions', 'drum-rhythms', 'newcomer-2', 'newcomer-test', 'aaa', 'algovrithm', 'moxir']

/**
 * An install in memory: spaces, the trash, the follows, and (through fakeInstall) the projects and the version
 * list. Answers in the shapes serverXR answers in (spaceRoutes.js, projectRoutes.js; the real ones are checked
 * at the end of this file). `fail(method, path)` may return a canned answer; `onWrite(method, path)` runs
 * before every write.
 */
const makeWorld = async ({ spaceIds = NAMES, projectsIn = {}, follows = 'unreachable', trashedProjects = { 'artist-walk': 2, 'newcomer-2': 2, 'newcomer-test': 1, aaa: 1 }, protectedSpaces = [], hideProtected = false, anonymous = false, fail = () => null, onWrite = () => {} } = {}) => {
    const spaces = new Map(spaceIds.map((id) => [id, { id, label: id, kind: 'normal', permanent: false, archivedAt: null, deletedAt: null }]))
    const projects = {
        'moxir-hall': { space: 'moxir', document: { entities: [{ id: 'box-1', type: 'box', name: 'floor', components: {} }] }, meta: { state: 'archived', title: 'MOXIR — the hall', documentVersion: 2379, createdAt: Date.UTC(2026, 8, 22) } },
        'moxir-truss': { space: 'moxir', document: { entities: [] }, meta: { state: 'archived', title: 'Truss over the DJ' } },
        'moxir-hall-known-full': { space: 'moxir', document: { entities: [] }, meta: { state: 'live', title: 'MOXIR 17.10 — Known · full' } }
    }
    for (const [space, ids] of Object.entries(projectsIn)) for (const id of ids) projects[id] = { space, document: { entities: [] }, meta: { state: 'live', title: id } }
    const inst = fakeInstall(projects)
    await putNewEntries({ client: inst, api: API, space: 'moxir', production: SET, meta: META, log: LOG_QUIET, undoDir: path.join(tmp, 'seed-undo') }, [
        { id: 'known-full', projectId: 'moxir-hall-known-full', title: 'Known · full', status: 'for-the-show' }
    ])
    const calls = []
    const writes = []
    const answer = (status, body) => ({ status, ok: status >= 200 && status < 300, body, text: JSON.stringify(body ?? null) })
    const pub = (s) => ({ id: s.id, label: s.label, kind: s.kind, permanent: s.permanent, ...(s.archivedAt ? { archivedAt: s.archivedAt } : {}) })
    const countOf = (id) => [...inst.rows.values()].filter((p) => p.space === id).length
    const handle = async (method, route, body) => {
        calls.push(`${method} ${route}`)
        const isWrite = method !== 'GET'
        if (isWrite) { writes.push({ method, path: route, body }); onWrite(method, route) }
        const canned = fail(method, route)
        if (canned) return canned.status ? answer(canned.status, canned.body) : canned
        const [pathname, query = ''] = route.split('?')
        const parts = pathname.split('/').filter(Boolean)
        if (parts[0] === 'api' && parts[1] === 'follows' && method === 'GET') {
            if (follows === 'unreachable') return answer(404, { error: 'not found' })
            return answer(200, { follows: follows.map((spaceId) => ({ spaceId, remote: 'https://dev.diiii.xyz', status: 'running' })), carriedHere: true })
        }
        if (parts[0] === 'api' && parts[1] === 'trash' && parts[2] === 'spaces' && method === 'GET') {
            if (anonymous) return answer(403, { error: 'sign in' })
            return answer(200, { ttlMs: 30 * 86400000, spaces: [...spaces.values()].filter((s) => s.deletedAt).map((s) => ({ ...pub(s), deletedAt: s.deletedAt, restorableUntil: s.deletedAt + 30 * 86400000, projectCount: 0 })) })
        }
        if (parts[0] === 'api' && parts[1] === 'trash' && method === 'GET') {
            if (anonymous) return answer(403, { error: 'sign in' })
            const space = new URLSearchParams(query).get('space')
            return answer(200, { ttlMs: 30 * 86400000, projects: Array.from({ length: trashedProjects[space] || 0 }, (_, i) => ({ id: `${space}-old-${i}`, spaceId: space })) })
        }
        if (parts[0] === 'api' && parts[1] === 'spaces' && parts[2]) {
            const s = spaces.get(parts[2])
            if (parts.length === 3) {
                if (method === 'GET') return s && !s.deletedAt ? answer(200, { space: pub(s) }) : answer(404, { error: 'Space not found.' })
                if (method === 'PATCH') {
                    if (!s || s.deletedAt) return answer(404, { error: 'Space not found.' })
                    if ('archived' in body) s.archivedAt = body.archived ? (s.archivedAt || Date.parse('2026-10-13T20:30:00Z')) : null
                    return answer(200, { space: pub(s) })
                }
                if (method === 'DELETE') {
                    if (!s || s.deletedAt) return answer(404, { error: 'Space not found.' })
                    if (protectedSpaces.includes(s.id)) return answer(409, { error: `"${s.id}" is a permanent space and cannot be deleted.`, code: 'space_protected', reason: 'permanent' })
                    s.deletedAt = Date.parse('2026-10-13T20:31:00Z')
                    return answer(200, { ok: true, trashed: true, deletedAt: s.deletedAt, restorableUntil: s.deletedAt + 30 * 86400000, projects: countOf(s.id) })
                }
            }
            if (parts[3] === 'footprint' && method === 'GET') {
                if (anonymous) return answer(403, { error: 'sign in' })
                return s && !s.deletedAt ? answer(200, { spaceId: s.id, label: s.label, projects: countOf(s.id), bytes: 0, protected: !hideProtected && protectedSpaces.includes(s.id) ? 'permanent' : null }) : answer(404, { error: 'Space not found.' })
            }
            if (parts[3] === 'restore' && method === 'POST') {
                if (!s || !s.deletedAt) return answer(404, { error: 'Nothing by that name is in the trash.' })
                s.deletedAt = null
                return answer(200, { ok: true, space: pub(s), projects: 0 })
            }
            if (parts[3] === 'assets' && method === 'GET') return answer(200, { assets: [{ id: 'a1', name: 'truss.pdf', size: 1000 }, { id: 'a2', name: 'manual.pdf', size: 2500 }] })
            if (parts[3] === 'projects' && method === 'GET') {
                if (!s || s.deletedAt) return answer(404, { error: 'Space not found.' })
                const listed = await inst.get(route)
                return answer(200, { projects: (listed.body?.projects || []).map((p) => (p.id === 'moxir-hall' ? { ...p, layers: { objects: 24, things: 24, lamps: 8 } } : p)) })
            }
        }
        return method === 'GET' ? inst.get(route) : method === 'POST' ? inst.post(route, body) : method === 'DELETE' ? inst.del(route) : answer(405, { error: `no route ${method} ${route}` })
    }
    const client = {
        get: (route) => handle('GET', route),
        post: (route, body) => handle('POST', route, body),
        patch: (route, body) => handle('PATCH', route, body),
        put: (route, body) => handle('PUT', route, body),
        del: (route) => handle('DELETE', route),
        bytes: async () => ({ ok: false, status: 404 })
    }
    return {
        client,
        calls,
        writes,
        spaces,
        inst,
        snap: async () => JSON.stringify({ spaces: [...spaces.values()].map((s) => [s.id, Boolean(s.archivedAt), Boolean(s.deletedAt)]), list: (await readList(inst, SET)).entries.map((e) => [e.id, e.projectId, e.status]) })
    }
}

const cleanup = (world, argv, extra = {}) => {
    const lines = []
    const opts = { client: world.client, env: { DI_API_TOKEN: TOKEN }, log: (l) => lines.push(String(l)), now: NOW, mentions, ...extra }
    return run(['--api', API, '--journal-dir', path.join(tmp, 'journals'), ...argv], opts).then((out) => ({ out, lines, text: lines.join('\n') }))
}
const journals = () => (fs.existsSync(path.join(tmp, 'journals')) ? fs.readdirSync(path.join(tmp, 'journals')).filter((f) => f.endsWith('.json')) : [])
const readJournal = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

describe('the list', () => {
    it('is the owner’s §5 list: rows 1-6 and 8 act, row 7 stays, 9-11 are only shown', () => {
        const act = CLEANUP_PLAN.filter((r) => ['archive', 'trash', 'list-archived'].includes(r.action)).map((r) => [r.n, r.id, r.action])
        expect(act).toEqual([
            [1, 'artist-walk', 'archive'], [2, 'decisions', 'archive'], [3, 'drum-rhythms', 'archive'], [4, 'newcomer-2', 'archive'],
            [5, 'newcomer-test', 'trash'], [6, 'aaa', 'trash'], [8, 'moxir-hall', 'list-archived']
        ])
        expect(CLEANUP_PLAN.find((r) => r.n === 7)).toMatchObject({ id: 'algovrithm', action: 'keep' })
        expect(CLEANUP_PLAN.filter((r) => r.n >= 9).every((r) => r.action === 'none')).toBe(true)
        expect(CLEANUP_PLAN).toHaveLength(11)
    })
})

describe('arguments', () => {
    it('reads the modes and refuses what it does not know', () => {
        expect(parseCliArgs(['--api', 'https://x/serverXR/']).mode).toBe('dry-run')
        expect(parseCliArgs(['--api', 'https://x/serverXR/']).api).toBe('https://x/serverXR')
        expect(parseCliArgs(['--api', 'https://x', '--apply']).mode).toBe('apply')
        expect(parseCliArgs(['--api', 'https://x', '--undo', 'j.json'])).toMatchObject({ mode: 'undo', undoFile: 'j.json' })
        expect(parseCliArgs(['--api', 'https://x', '--undo', 'j.json', '--dry-run'])).toMatchObject({ mode: 'undo', dry: true })
        expect(() => parseCliArgs(['--apply'])).toThrow(/--api/)
        expect(() => parseCliArgs(['--api', 'https://x', '--apply', '--dry-run'])).toThrow(/one of/)
        expect(() => parseCliArgs(['--api', 'https://x', '--apply', '--undo', 'j'])).toThrow(/one of/)
        expect(() => parseCliArgs(['--api', 'https://x', '--wat'])).toThrow(/unknown argument/)
        expect(() => parseCliArgs(['--api', 'https://x', 'stray'])).toThrow(/unknown argument/)
        expect(() => parseCliArgs(['--api', '127.0.0.1:5335'])).toThrow(/full address/)
        expect(() => parseCliArgs(['--api', 'ftp://x/serverXR'])).toThrow(/full address/)
        expect(() => parseCliArgs(['--api', 'https://x', '--journal-dir'])).toThrow(/needs a value/)
    })
})

describe('--dry-run', () => {
    it('prints the §5 table live with the used-by checks and writes nothing', async () => {
        const world = await makeWorld({ follows: ['artist-walk', 'decisions', 'drum-rhythms', 'newcomer-2', 'algovrithm'] })
        const { out, text } = await cleanup(world, ['--dry-run'])
        expect(out.code).toBe(0)
        expect(world.writes).toEqual([])
        expect(journals()).toEqual([])
        for (let n = 1; n <= 11; n += 1) expect(text).toMatch(new RegExp(`#${n} `))
        expect(text).toMatch(/#1 .*artist-walk.*archive/)
        expect(text).toMatch(/#5 .*newcomer-test.*trash/)
        expect(text).toMatch(/#7 .*algovrithm.*keep/)
        expect(text).toMatch(/#8 .*moxir-hall.*archived.*moxir-2026-10-17/)
        expect(text).toContain('0 projects')
        expect(text).toContain('2 in the trash')
        expect(text).toContain('followed from https://dev.diiii.xyz')
        expect(text).toContain('not followed')
        expect(text).toContain('named in 7 repo files')
        expect(text).toContain('named in 21 repo files')
        expect(text).toContain('named in 0 repo files')
        expect(text).toMatch(/16 objects · 8 lamps/)
        expect(text).toMatch(/v2379/)
        expect(text).toMatch(/in no version list/)
        expect(text).toMatch(/2 files/) // row 11, the space's own files
        expect(text).not.toContain(TOKEN)
        expect(text.split('\n').length).toBeLessThanOrEqual(46)
    })

    it('is the default mode, and says when it could not read whether a space is followed', async () => {
        const world = await makeWorld()
        const { out, text } = await cleanup(world, [])
        expect(out.code).toBe(0)
        expect(world.writes).toEqual([])
        expect(text).toMatch(/followed: unknown/)
    })

    it('reads without a token and says what that hides', async () => {
        const world = await makeWorld({ anonymous: true })
        const { out, text } = await cleanup(world, ['--dry-run'], { env: {} })
        expect(out.code).toBe(0)
        expect(text).toMatch(/DI_API_TOKEN is not set/)
        expect(text).toMatch(/cannot confirm/)
        expect(world.writes).toEqual([])
    })
})

describe('--apply', () => {
    it('refuses to write without a token, says so, and sends no request at all', async () => {
        const world = await makeWorld()
        await expect(cleanup(world, ['--apply'], { env: {} })).rejects.toThrow(/DI_API_TOKEN/)
        await expect(cleanup(world, ['--apply', '--token-env', 'MY_TOKEN'], { env: { DI_API_TOKEN: TOKEN } })).rejects.toThrow(/MY_TOKEN/)
        expect(world.calls).toEqual([])
        expect(journals()).toEqual([])
    })

    it('does exactly rows 1-6 and 8: archives four spaces, trashes two, lists one project, touches nothing else', async () => {
        const world = await makeWorld()
        const before = JSON.parse(await world.snap())
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(0)
        expect(world.writes.map((w) => `${w.method} ${w.path}`)).toEqual([
            'PATCH /api/spaces/artist-walk', 'PATCH /api/spaces/decisions', 'PATCH /api/spaces/drum-rhythms', 'PATCH /api/spaces/newcomer-2',
            'DELETE /api/spaces/newcomer-test', 'DELETE /api/spaces/aaa',
            `POST /api/projects/${SET}-versions/ops`
        ])
        expect(world.writes.slice(0, 4).every((w) => w.body.archived === true && Object.keys(w.body).length === 1)).toBe(true)
        for (const id of ['artist-walk', 'decisions', 'drum-rhythms', 'newcomer-2']) expect(world.spaces.get(id).archivedAt).toBeTruthy()
        for (const id of ['newcomer-test', 'aaa']) expect(world.spaces.get(id).deletedAt).toBeTruthy()
        for (const id of ['algovrithm', 'moxir']) expect(world.spaces.get(id)).toMatchObject({ archivedAt: null, deletedAt: null })
        const list = await readList(world.inst, SET)
        expect(list.entries.map((e) => e.projectId).sort()).toEqual(['moxir-hall', 'moxir-hall-known-full'])
        expect(list.entries.find((e) => e.projectId === 'moxir-hall')).toMatchObject({ status: 'archived', title: 'MOXIR — the hall' })
        expect(list.entries.find((e) => e.projectId === 'moxir-hall-known-full').status).toBe('for-the-show')
        expect(before.list).toHaveLength(1)
        expect(text).toMatch(/journal written first/)
        expect(text).toMatch(/--undo /)
        expect(text).not.toContain(TOKEN)
    })

    it('writes the journal before the first write and keeps it true after every step', async () => {
        const seen = []
        let dir = null
        const world = await makeWorld({ onWrite: () => {
            const [file] = journals()
            const j = file ? readJournal(path.join(tmp, 'journals', file)) : null
            seen.push(j ? j.steps.map((s) => s.status).join(',') : 'NO JOURNAL')
            dir = file
        } })
        const { out } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(0)
        expect(seen[0]).toBe('started,planned,planned,planned,planned,planned,planned')
        expect(seen[3]).toBe('done,done,done,started,planned,planned,planned')
        expect(seen[6]).toBe('done,done,done,done,done,done,started')
        const journal = readJournal(path.join(tmp, 'journals', dir))
        expect(journal).toMatchObject({ format: 'di.space-cleanup-journal', version: 1, api: API })
        expect(journal.steps.map((s) => [s.n, s.id, s.action, s.status])).toEqual([
            [1, 'artist-walk', 'archive', 'done'], [2, 'decisions', 'archive', 'done'], [3, 'drum-rhythms', 'archive', 'done'], [4, 'newcomer-2', 'archive', 'done'],
            [5, 'newcomer-test', 'trash', 'done'], [6, 'aaa', 'trash', 'done'], [8, 'moxir-hall', 'list-archived', 'done']
        ])
        expect(journal.steps[0].evidence.archivedAt).toBeGreaterThan(0)
        expect(journal.steps[4].evidence.restorableUntil).toBeGreaterThan(journal.steps[4].evidence.deletedAt)
        expect(journal.steps[6].evidence.entryId).toBe('moxir-hall')
        expect(JSON.stringify(journal)).not.toContain(TOKEN)
    })

    it('run twice, the second run finds everything done and writes nothing', async () => {
        const world = await makeWorld()
        await cleanup(world, ['--apply'])
        const writesAfterFirst = world.writes.length
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(0)
        expect(world.writes).toHaveLength(writesAfterFirst)
        expect(journals()).toHaveLength(1)
        expect(text).toMatch(/nothing to do/)
    })

    it('does not archive or trash a space that holds projects now; the other rows still go; exit 2', async () => {
        const world = await makeWorld({ projectsIn: { 'artist-walk': ['aw-1'], aaa: ['aaa-1', 'aaa-2'] } })
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(2)
        expect(world.spaces.get('artist-walk').archivedAt).toBeNull()
        expect(world.spaces.get('aaa').deletedAt).toBeNull()
        for (const id of ['decisions', 'drum-rhythms', 'newcomer-2']) expect(world.spaces.get(id).archivedAt).toBeTruthy()
        expect(world.spaces.get('newcomer-test').deletedAt).toBeTruthy()
        expect(text).toMatch(/refused.*artist-walk.*holds 1 project/s)
        expect(text).toMatch(/refused.*aaa.*holds 2 projects/s)
    })

    it('re-reads the count right before an archive too', async () => {
        let armed = true
        const world = await makeWorld({ onWrite: (method, route) => {
            if (armed && route === '/api/spaces/artist-walk') { armed = false; world.inst.rows.set('late', { space: 'decisions', version: 1, document: { entities: [] }, meta: { state: 'live', title: 'late' } }) }
        } })
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(2)
        expect(world.spaces.get('artist-walk').archivedAt).toBeTruthy()
        expect(world.spaces.get('decisions').archivedAt).toBeNull()
        expect(text).toMatch(/refused #2 decisions.*holds 1 project/)
    })

    it('re-reads the count right before a write: a project that appears after the plan stops that step', async () => {
        let armed = true
        const world = await makeWorld({ onWrite: (method, route) => {
            if (armed && route === '/api/spaces/decisions') { armed = false; world.inst.rows.set('late', { space: 'aaa', version: 1, document: { entities: [] }, meta: { state: 'live', title: 'late' } }) }
        } })
        // the project lands in aaa while decisions is being written; aaa is read again just before its own write
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(2)
        expect(world.spaces.get('aaa').deletedAt).toBeNull()
        expect(text).toMatch(/aaa.*holds 1 project/s)
    })

    it('does not trash a space that is followed, and trashes one whose follow state is unknown with a warning', async () => {
        const followed = await makeWorld({ follows: ['newcomer-test'] })
        const a = await cleanup(followed, ['--apply'])
        expect(a.out.code).toBe(2)
        expect(followed.spaces.get('newcomer-test').deletedAt).toBeNull()
        expect(followed.spaces.get('aaa').deletedAt).toBeTruthy()
        expect(a.text).toMatch(/refused.*newcomer-test.*followed/s)
        const unknown = await makeWorld()
        const b = await cleanup(unknown, ['--apply'])
        expect(b.out.code).toBe(0)
        expect(b.text).toMatch(/WARNING.*followed.*unknown/s)
    })

    it('a protected space is refused before any write, and the rest goes on (exit 2)', async () => {
        const world = await makeWorld({ protectedSpaces: ['aaa'] })
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(2)
        expect(text).toMatch(/refused.*aaa.*permanent/s)
        expect(world.writes.some((w) => w.path === '/api/spaces/aaa')).toBe(false)
        expect(world.spaces.get('aaa').deletedAt).toBeNull()
        expect(world.spaces.get('newcomer-test').deletedAt).toBeTruthy()
    })

    it('a delete the server answers with 409 fails that row with the server’s code, and the rest goes on (exit 2)', async () => {
        const world = await makeWorld({ protectedSpaces: ['aaa'], hideProtected: true })
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(2)
        expect(text).toMatch(/FAILED #6 aaa.*409.*space_protected/s)
        expect(world.spaces.get('aaa').deletedAt).toBeNull()
        expect(world.spaces.get('newcomer-test').deletedAt).toBeTruthy()
    })

    it('an answer of "held for approval" is not done', async () => {
        const world = await makeWorld({ fail: (method, route) => (method === 'PATCH' && route === '/api/spaces/artist-walk' ? { status: 202, body: { status: 'pending_approval', approvalId: 'ap-1' } } : null) })
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(2)
        expect(world.spaces.get('artist-walk').archivedAt).toBeNull()
        expect(text).toMatch(/FAILED #1.*approval/s)
        const [file] = journals()
        expect(readJournal(path.join(tmp, 'journals', file)).steps[0]).toMatchObject({ n: 1, status: 'failed' })
        expect(world.spaces.get('decisions').archivedAt).toBeTruthy()
    })

    it('a write the server accepts but that does not read back is a failure, never a silent success', async () => {
        const world = await makeWorld({ fail: (method, route) => (method === 'PATCH' && route === '/api/spaces/decisions' ? { status: 200, body: { space: { id: 'decisions' } } } : null) })
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(2)
        expect(text).toMatch(/FAILED #2.*READ-BACK DIFFERS/s)
        const [file] = journals()
        expect(readJournal(path.join(tmp, 'journals', file)).steps[1].status).toBe('failed')
    })

    it('a server error on one row fails that row only', async () => {
        const world = await makeWorld({ fail: (method, route) => (method === 'DELETE' && route === '/api/spaces/aaa' ? { status: 500, body: { error: 'boom' } } : null) })
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(2)
        expect(text).toMatch(/FAILED #6.*500.*boom/s)
        expect(world.spaces.get('newcomer-test').deletedAt).toBeTruthy()
        expect((await readList(world.inst, SET)).entries.some((e) => e.projectId === 'moxir-hall')).toBe(true)
    })

    it('says "not on this install" for what is not there and does not make it (dev has fewer spaces)', async () => {
        const world = await makeWorld({ spaceIds: ['artist-walk', 'moxir'] })
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(0)
        expect(text).toMatch(/not on this install/)
        expect(world.writes.map((w) => `${w.method} ${w.path}`)).toEqual(['PATCH /api/spaces/artist-walk', `POST /api/projects/${SET}-versions/ops`])
    })

    it('does not list moxir-hall when the version list is not on the install, and never makes the list', async () => {
        const world = await makeWorld()
        world.inst.rows.delete(`${SET}-versions`)
        const { out, text } = await cleanup(world, ['--apply'])
        expect(out.code).toBe(0)
        expect(text).toMatch(/no version list/)
        expect(world.writes.some((w) => w.path.includes('/projects') && w.method === 'POST' && !w.path.includes('/ops'))).toBe(false)
        expect(world.writes.some((w) => w.path.includes('-versions'))).toBe(false)
    })

    it('leaves moxir-hall alone when it is no longer archived or already listed', async () => {
        const world = await makeWorld()
        world.inst.rows.get('moxir-hall').meta.state = 'live'
        const a = await cleanup(world, ['--apply'])
        expect(a.text).toMatch(/refused.*moxir-hall.*not archived/s)
        expect(a.out.code).toBe(2)
        const world2 = await makeWorld()
        await putNewEntries({ client: world2.inst, api: API, space: 'moxir', production: SET, meta: META, log: LOG_QUIET, undoDir: path.join(tmp, 'u2') }, [{ id: 'hall', projectId: 'moxir-hall', title: 'The hall', status: 'concept' }])
        const b = await cleanup(world2, ['--apply'])
        expect(b.text).toMatch(/moxir-hall.*already listed as "hall" \(concept\)/s)
        expect((await readList(world2.inst, SET)).entries.find((e) => e.projectId === 'moxir-hall').status).toBe('concept')
    })
})

describe('--undo', () => {
    const applied = async (opts = {}) => {
        const world = await makeWorld(opts)
        const before = await world.snap()
        await cleanup(world, ['--apply'])
        const [file] = journals()
        return { world, before, file: path.join(tmp, 'journals', file) }
    }

    it('puts every step back from the journal, last first, and leaves the install as it was', async () => {
        const { world, before, file } = await applied()
        const writesBefore = world.writes.length
        const { out, text } = await cleanup(world, ['--undo', file])
        expect(out.code).toBe(0)
        expect(await world.snap()).toBe(before)
        expect(world.writes.slice(writesBefore).map((w) => `${w.method} ${w.path}`)).toEqual([
            `POST /api/projects/${SET}-versions/ops`,
            'POST /api/spaces/aaa/restore', 'POST /api/spaces/newcomer-test/restore',
            'PATCH /api/spaces/newcomer-2', 'PATCH /api/spaces/drum-rhythms', 'PATCH /api/spaces/decisions', 'PATCH /api/spaces/artist-walk'
        ])
        expect(world.writes.slice(writesBefore + 3).every((w) => w.body.archived === false)).toBe(true)
        expect(readJournal(file).undone.at).toBe('2026-10-13T20:30:00.000Z')
        expect(text).not.toContain(TOKEN)
    })

    it('undoing twice is a no-op, and says each step is already back', async () => {
        const { world, file } = await applied()
        await cleanup(world, ['--undo', file])
        const writes = world.writes.length
        const { out, text } = await cleanup(world, ['--undo', file])
        expect(out.code).toBe(0)
        expect(world.writes).toHaveLength(writes)
        expect(text).toMatch(/already back/)
    })

    it('does not undo a step that failed, and does not touch what it never did', async () => {
        const world = await makeWorld({ fail: (method, route) => (method === 'DELETE' && route === '/api/spaces/aaa' ? { status: 500, body: { error: 'boom' } } : null) })
        await cleanup(world, ['--apply'])
        const [file] = journals()
        const writes = world.writes.length
        const { out } = await cleanup(world, ['--undo', path.join(tmp, 'journals', file)])
        expect(out.code).toBe(0)
        expect(world.writes.slice(writes).some((w) => w.path.includes('/aaa'))).toBe(false)
        expect(world.spaces.get('newcomer-test').deletedAt).toBeNull()
    })

    it('does not touch a space that was already archived before the clean-up ran', async () => {
        const world = await makeWorld()
        world.spaces.get('decisions').archivedAt = 1234
        await cleanup(world, ['--apply'])
        const [file] = journals()
        await cleanup(world, ['--undo', path.join(tmp, 'journals', file)])
        expect(world.spaces.get('decisions').archivedAt).toBe(1234)
        expect(world.spaces.get('artist-walk').archivedAt).toBeNull()
    })

    it('leaves a version entry alone that someone has changed since, and says so (exit 2)', async () => {
        const { world, file } = await applied()
        await setStatus({ client: world.inst, api: API, production: SET, meta: { id: SET }, log: LOG_QUIET }, 'moxir-hall', 'concept')
        const { out, text } = await cleanup(world, ['--undo', file])
        expect(out.code).toBe(2)
        expect(text).toMatch(/moxir-hall.*changed since/s)
        expect((await readList(world.inst, SET)).entries.some((e) => e.id === 'moxir-hall')).toBe(true)
        expect(world.spaces.get('aaa').deletedAt).toBeNull() // the rest was still put back
    })

    it('says plainly when a trashed space can no longer be restored', async () => {
        const { world, file } = await applied()
        world.spaces.delete('aaa') // purged
        const { out, text } = await cleanup(world, ['--undo', file])
        expect(out.code).toBe(2)
        expect(text).toMatch(/FAILED.*aaa.*neither live nor in the trash/s)
        expect(world.spaces.get('newcomer-test').deletedAt).toBeNull()
    })

    it('refuses a journal written for another install, a missing file, and a missing token', async () => {
        const { world, file } = await applied()
        await expect(run(['--api', 'https://other.example/serverXR', '--undo', file], { client: world.client, env: { DI_API_TOKEN: TOKEN }, log: LOG_QUIET, now: NOW, mentions })).rejects.toThrow(/other\.example|written for/)
        await expect(cleanup(world, ['--undo', path.join(tmp, 'nope.json')])).rejects.toThrow(/nope\.json/)
        const calls = world.calls.length
        await expect(cleanup(world, ['--undo', file], { env: {} })).rejects.toThrow(/DI_API_TOKEN/)
        expect(world.calls).toHaveLength(calls)
    })

    it('--undo --dry-run prints what it would do and writes nothing', async () => {
        const { world, file } = await applied()
        const writes = world.writes.length
        const { out, text } = await cleanup(world, ['--undo', file, '--dry-run'])
        expect(out.code).toBe(0)
        expect(world.writes).toHaveLength(writes)
        expect(text).toMatch(/would restore aaa/)
        expect(text).toMatch(/would unarchive artist-walk/)
    })
})

describe('repoMentions (the real git grep)', () => {
    it('counts files that name the id as a whole token, skips binary files and the script’s own files', async () => {
        const repo = path.join(tmp, 'repo')
        fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true })
        const git = (...args) => execFileSync('git', ['-C', repo, ...args], { stdio: 'pipe' })
        execFileSync('git', ['init', '-q', repo])
        fs.writeFileSync(path.join(repo, 'a.md'), 'the space newcomer-2 was a test\n')
        fs.writeFileSync(path.join(repo, 'b.md'), 'newcomer-2-test is another thing; so is "newcomer-2".\n')
        fs.writeFileSync(path.join(repo, 'c.md'), 'newcomer-20 is not it\n')
        fs.writeFileSync(path.join(repo, 'bin.dat'), Buffer.from('newcomer-2\0\0\0'))
        fs.writeFileSync(path.join(repo, 'scripts', 'space-cleanup.mjs'), "id: 'newcomer-2'\n")
        git('add', '-A')
        const found = await repoMentions(repo, 'newcomer-2')
        expect(found.count).toBe(2)
        expect(found.files.sort()).toEqual(['a.md', 'b.md'])
        expect(await repoMentions(repo, 'no-such-space')).toEqual({ count: 0, files: [] })
        await expect(repoMentions(repo, 'bad id; rm -rf')).rejects.toThrow(/not a space or project id/)
    })
})

// ── the same script against a real server process ─────────────────────────────────────────────────────────
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'serverXR')
const ADMIN = 'sc-admin-token'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

describe('against a real server process (a throwaway one in a temp folder)', () => {
    let server = null
    let child = null
    let cwd = null
    let dataRoot = null
    const as = { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' }
    const send = async (method, route, body) => {
        const response = await fetch(`${server}${route}`, { method, headers: as, body: body ? JSON.stringify(body) : undefined })
        const text = await response.text()
        return { status: response.status, body: text ? JSON.parse(text) : null }
    }

    beforeAll(async () => {
        cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-cwd-'))
        dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-data-'))
        // Ready = this child's own listen line, a lost port race retried on a new port (testSupport/spawnServer.mjs).
        // A probe-then-spawn here raced sibling files for the number (known-fixes, EADDRINUSE 2026-10-20).
        const started = await spawnServerUntilReady({
            entry: path.join(SERVER_ROOT, 'src/index.js'),
            cwd,
            env: { ...process.env, NODE_ENV: 'production', APP_BASE_PATH: '/serverXR', DATA_ROOT: dataRoot, API_TOKEN: ADMIN, REQUIRE_AUTH: 'true', CORS_ORIGINS: '*', AUTH_SESSION_SECRET: 'sc-session-secret', AUTH_SESSION_COOKIE_SECURE: 'false', AUTH_HUB_URL: 'off' },
            readyTimeoutMs: 20000
        })
        child = started.child
        server = `http://127.0.0.1:${started.port}/serverXR`
        for (const slug of NAMES) expect((await send('POST', '/api/spaces', { label: slug, slug })).status).toBe(201)
        for (const [slug, title] of [['moxir-hall', 'MOXIR — the hall'], ['moxir-truss', 'Truss over the DJ'], ['moxir-hall-known-full', 'Known · full']]) {
            expect((await send('POST', '/api/spaces/moxir/projects', { slug, title })).status).toBe(201)
        }
        for (const slug of ['moxir-hall', 'moxir-truss']) expect((await send('PATCH', `/api/projects/${slug}/shelf`, { state: 'archived' })).status).toBe(200)
        // a project that was trashed on its own before: it must stay in the project trash through trash and restore
        expect((await send('POST', '/api/spaces/aaa/projects', { slug: 'aaa-old', title: 'old' })).status).toBe(201)
        expect((await send('DELETE', '/api/projects/aaa-old')).status).toBe(200)
        const client = makeClient(server, ADMIN)
        await putNewEntries({ client, api: server, space: 'moxir', production: SET, meta: META, log: LOG_QUIET, undoDir: path.join(os.tmpdir(), 'sc-seed-undo') }, [
            { id: 'known-full', projectId: 'moxir-hall-known-full', title: 'Known · full', status: 'for-the-show' }
        ])
    })

    afterAll(async () => {
        if (child && child.exitCode === null) {
            child.kill('SIGTERM')
            await Promise.race([new Promise((r) => child.once('exit', r)), wait(3000)])
            if (child.exitCode === null) child.kill('SIGKILL')
        }
        for (const dir of [cwd, dataRoot, path.join(os.tmpdir(), 'sc-seed-undo')]) if (dir) fs.rmSync(dir, { recursive: true, force: true })
    })

    const real = async (argv) => {
        const lines = []
        const out = await run(['--api', server, '--journal-dir', path.join(tmp, 'journals'), ...argv], { env: { DI_API_TOKEN: ADMIN }, log: (l) => lines.push(String(l)), now: NOW, mentions })
        return { out, text: lines.join('\n') }
    }
    const state = async () => {
        const spaces = (await send('GET', '/api/spaces')).body.spaces
        const trash = (await send('GET', '/api/trash/spaces')).body.spaces.map((s) => s.id).sort()
        const list = (await readList(makeClient(server, ADMIN), SET)).entries.map((e) => [e.projectId, e.status]).sort()
        return { archived: spaces.filter((s) => s.archivedAt).map((s) => s.id).sort(), live: spaces.map((s) => s.id).sort(), trash, list }
    }

    it('dry-run reads, apply does rows 1-6 and 8, a second apply does nothing, undo puts everything back', async () => {
        const start = await state()
        expect(start.archived).toEqual([])
        expect(start.list).toEqual([['moxir-hall-known-full', 'for-the-show']])

        const dry = await real(['--dry-run'])
        expect(dry.out.code).toBe(0)
        expect(dry.text).toMatch(/#5 .*newcomer-test/)
        expect(dry.text).toMatch(/followed from|not followed/)
        expect(dry.text).toMatch(/3 objects|objects/) // the real list answers with the layers of moxir-hall
        expect(await state()).toEqual(start)

        const applied = await real(['--apply'])
        expect(applied.out.code).toBe(0)
        const after = await state()
        expect(after.archived).toEqual(['artist-walk', 'decisions', 'drum-rhythms', 'newcomer-2'])
        expect(after.trash).toEqual(['aaa', 'newcomer-test'])
        expect(after.live).not.toContain('aaa')
        expect(after.live).toContain('algovrithm')
        expect(after.list).toEqual([['moxir-hall', 'archived'], ['moxir-hall-known-full', 'for-the-show']])
        expect((await send('GET', '/api/projects/moxir-hall')).body.project.state).toBe('archived')

        const again = await real(['--apply'])
        expect(again.out.code).toBe(0)
        expect(again.text).toMatch(/nothing to do/)
        expect(await state()).toEqual(after)

        const [file] = fs.readdirSync(path.join(tmp, 'journals')).filter((f) => f.endsWith('.json'))
        const undone = await real(['--undo', path.join(tmp, 'journals', file)])
        expect(undone.out.code).toBe(0)
        expect(await state()).toEqual(start)
        expect((await send('GET', '/api/trash?space=aaa')).body.projects.map((p) => p.id)).toEqual(['aaa-old'])
    })
})
