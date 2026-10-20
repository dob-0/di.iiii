// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { createAssetChase, assetChangesFromOps, assetsFromDocument, isCarriableId } = require('./assets')
const { side } = require('./follower')

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const LEGACY = '123e4567-e89b-42d3-a456-426614174000'
const quiet = { warn: () => {}, info: () => {} }

const upsert = (id, name = 'clip.mp4', size = 10) => ({ type: 'upsertAsset', payload: { asset: { id, name, size, mimeType: 'video/mp4' } } })
const remove = (id) => ({ type: 'deleteAsset', payload: { assetId: id } })

/**
 * Two machines that exist only as maps, behind the same three calls the chase
 * makes on real ones. The fake PUT deliberately does NOT check the hash: what
 * is under test is that the chase never offers it bytes it has not checked.
 *
 * `status` stands for something in front of a machine answering FOR it, to
 * every request — a Cloudflare tunnel's 530 while the machine behind it is off.
 * `metaStatus` is one file's own answer (id → status) while the rest are fine.
 */
const twoMachines = () => {
    const machines = {
        'http://here': { files: new Map(), docs: new Map(), serves: new Map(), down: false, putStatus: 200, status: null, metaStatus: new Map() },
        'http://there': { files: new Map(), docs: new Map(), serves: new Map(), down: false, putStatus: 200, status: null, metaStatus: new Map() }
    }
    const calls = { downloads: [], uploads: [], tokens: [], requests: [] }
    const parse = (url) => {
        const u = new URL(url)
        const machine = machines[u.origin]
        const [, projectId, kind, id, tail] = u.pathname.match(/^\/api\/projects\/([^/]+)\/(assets|document)(?:\/([^/]+))?(?:\/(meta))?$/) || []
        return { u, machine, projectId, kind, id, tail }
    }
    const answer = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, headers: {}, text: JSON.stringify(body), json: () => body })
    const io = {
        request: async (url, { headers = {} } = {}) => {
            const { u, machine, projectId, kind, id } = parse(url)
            calls.tokens.push(headers.Authorization || null)
            calls.requests.push({ to: u.origin, path: u.pathname })
            if (machine.down) throw new Error('connect ECONNREFUSED')
            if (machine.status) return answer(machine.status)
            if (u.pathname === '/api/health') return answer(200, { ok: true })
            if (kind === 'document') {
                return machine.docs.has(projectId) ? answer(200, { document: machine.docs.get(projectId) }) : answer(404)
            }
            if (machine.metaStatus.has(id)) return answer(machine.metaStatus.get(id))
            return machine.files.has(id)
                ? answer(200, { asset: { id, name: 'clip.mp4', mimeType: 'video/mp4', size: machine.files.get(id).length } })
                : answer(404)
        },
        download: async (url, { destPath, maxBytes }) => {
            const { machine, id } = parse(url)
            calls.downloads.push(id)
            if (machine.down) throw new Error('connect ECONNREFUSED')
            if (machine.status) return { ok: false, status: machine.status, headers: {}, size: 0, sha256: null }
            const bytes = machine.serves.get(id) || machine.files.get(id)
            if (bytes.length > maxBytes) throw Object.assign(new Error('too large'), { code: 'TOO_LARGE' })
            await writeFile(destPath, bytes)
            return { ok: true, status: 200, headers: {}, size: bytes.length, sha256: sha(bytes) }
        },
        upload: async (url, { filePath, headers = {} }) => {
            const { u, machine, id } = parse(url)
            calls.uploads.push({ to: u.origin, id, name: u.searchParams.get('name'), mimeType: u.searchParams.get('mimeType'), token: headers.Authorization || null })
            if (machine.down) throw new Error('connect ECONNREFUSED')
            if (machine.status) return answer(machine.status)
            if (machine.putStatus !== 200) return answer(machine.putStatus, machine.putBody || {})
            machine.files.set(id, await readFile(filePath))
            return answer(200, { ok: true })
        }
    }
    return { here: machines['http://here'], there: machines['http://there'], io, calls }
}

describe('what ops and documents say about files', () => {
    it('reads named and removed files from ops, in order, and nothing else', () => {
        const id = sha('a')
        expect(assetChangesFromOps([
            { type: 'createEntity', payload: {} },
            upsert(id.toUpperCase(), 'A.mp4', 5),
            remove(id),
            { type: 'replaceDocument', payload: { document: { assets: [{ id: sha('b') }] } } },
            { type: 'upsertAsset', payload: {} }
        ])).toEqual([
            { kind: 'named', id, name: 'A.mp4', size: 5 },
            { kind: 'removed', id }
        ])
        expect(assetChangesFromOps(null)).toEqual([])
    })

    it('reads every file a document names, and survives a document with none', () => {
        expect(assetsFromDocument({ assets: [{ id: sha('a'), name: 'a.png', size: 3 }, { name: 'no id' }] }))
            .toEqual([{ id: sha('a'), name: 'a.png', size: 3 }])
        expect(assetsFromDocument(null)).toEqual([])
    })

    it('only a sha256 is a name that can be checked', () => {
        expect(isCarriableId(sha('a'))).toBe(true)
        expect(isCarriableId(LEGACY)).toBe(false)
        expect(isCarriableId('')).toBe(false)
    })
})

describe('the chase', () => {
    let tmpDir = null
    let chase = null

    const make = async (world, options = {}) => {
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'dii-chase-'))
        chase = createAssetChase({
            local: side({ base: 'http://here', spaceId: 'room', token: 'self-token' }),
            remote: side({ base: 'http://there', spaceId: 'room', token: 'dii_sync_key' }),
            tmpDir,
            backoffMs: [1, 1],
            io: world.io,
            log: quiet,
            ...options
        })
        return chase
    }

    afterEach(async () => {
        chase?.stop()
        if (tmpDir) await rm(tmpDir, { recursive: true, force: true })
    })

    /** Run until the queue is empty, however many backoff timers that takes. */
    const drain = async () => {
        const deadline = Date.now() + 3000
        do {
            await chase.run()
            await chase.idle()
            if (!chase.files.pending) return
            await new Promise(resolve => setTimeout(resolve, 5))
        } while (Date.now() < deadline)
        throw new Error(`never drained: ${JSON.stringify(chase.files)}`)
    }

    it('brings a file the other machine has to this one, with the right key on each side', async () => {
        const world = twoMachines()
        const bytes = Buffer.from([0, 255, 128, 7])
        world.there.files.set(sha(bytes), bytes)
        await make(world)

        chase.noteOps('show', [upsert(sha(bytes))])
        expect(chase.files).toMatchObject({ pending: 1, bytesPending: 10 })
        await drain()

        expect(world.here.files.get(sha(bytes)).equals(bytes)).toBe(true)
        expect(world.calls.uploads).toEqual([{ to: 'http://here', id: sha(bytes), name: 'clip.mp4', mimeType: 'video/mp4', token: 'Bearer self-token' }])
        expect(chase.files).toMatchObject({ carried: 1, pending: 0, failed: 0, notCarried: 0, bytesPending: 0 })
        expect(await readdir(tmpDir)).toEqual([])
    })

    // Gap 3 (2026-10-05, di.laser): the documents were compared with what each
    // machine holds once per run. A file lost from one disk, or a transfer that
    // was cut and forgotten, stayed owed in silence for as long as the follow ran.
    it('compares the documents with what each machine holds again after a while, and carries what has gone missing', async () => {
        const world = twoMachines()
        const bytes = Buffer.from('listed in the document, lost from the host\'s disk')
        world.here.files.set(sha(bytes), bytes)
        world.here.docs.set('show', { assets: [{ id: sha(bytes), name: 'clip.mp4', size: bytes.length }] })
        world.there.docs.set('show', { assets: [{ id: sha(bytes), name: 'clip.mp4', size: bytes.length }] })
        let clock = 0
        await make(world, { now: () => clock, reconcileEveryMs: 60_000 })

        chase.noteProjects(['show'])
        await drain()
        expect(world.there.files.has(sha(bytes))).toBe(true)
        expect(chase.files).toMatchObject({ listed: 1, missing: 0, pending: 0 })

        // the file goes from the host's disk; a quiet minute later nothing has noticed
        world.there.files.delete(sha(bytes))
        clock = 30_000
        chase.noteProjects(['show'])
        await drain()
        expect(world.there.files.has(sha(bytes))).toBe(false)

        // after the interval it is compared again, found and carried
        clock = 61_000
        chase.noteProjects(['show'])
        await drain()
        expect(world.there.files.get(sha(bytes)).equals(bytes)).toBe(true)
    })

    it('says how many files are listed and how many a machine still lacks', async () => {
        const world = twoMachines()
        const [a, b, c] = ['one', 'two', 'three'].map(text => Buffer.from(text))
        for (const bytes of [a, b, c]) world.here.files.set(sha(bytes), bytes)
        world.there.files.set(sha(a), a)
        await make(world)
        chase.noteOps('show', [a, b, c].map(bytes => upsert(sha(bytes))))
        expect(chase.files).toMatchObject({ listed: 3, missing: 3, pending: 3 })
        await drain()
        expect(chase.files).toMatchObject({ listed: 3, missing: 0, carried: 2 })
    })

    it('takes a file added HERE to the other machine, with the sync key', async () => {
        const world = twoMachines()
        const bytes = Buffer.from('made on the following side')
        world.here.files.set(sha(bytes), bytes)
        await make(world)

        chase.noteOps('show', [upsert(sha(bytes))])
        await drain()

        expect(world.there.files.get(sha(bytes)).equals(bytes)).toBe(true)
        expect(world.calls.uploads[0]).toMatchObject({ to: 'http://there', token: 'Bearer dii_sync_key' })
    })

    it('moves nothing when both machines already hold the file', async () => {
        const world = twoMachines()
        const bytes = Buffer.from('everywhere')
        world.here.files.set(sha(bytes), bytes)
        world.there.files.set(sha(bytes), bytes)
        await make(world)

        chase.noteOps('show', [upsert(sha(bytes))])
        await drain()
        // and naming it again does not even ask
        const asked = world.calls.tokens.length
        chase.noteOps('show', [upsert(sha(bytes))])
        await drain()

        expect(world.calls.downloads).toEqual([])
        expect(world.calls.tokens.length).toBe(asked)
        expect(chase.files).toMatchObject({ carried: 0, pending: 0, failed: 0 })
    })

    it('skips a legacy id and counts it as not carried', async () => {
        const world = twoMachines()
        world.there.files.set(LEGACY, Buffer.from('old'))
        await make(world)

        chase.noteOps('show', [upsert(LEGACY), upsert(LEGACY)])
        await drain()

        expect(world.calls.downloads).toEqual([])
        expect(world.calls.uploads).toEqual([])
        expect(chase.files).toMatchObject({ carried: 0, pending: 0, failed: 0, notCarried: 1 })
    })

    it('never stores bytes that do not match their name — and says so', async () => {
        const world = twoMachines()
        const real = Buffer.from('the real file')
        world.there.files.set(sha(real), real)
        world.there.serves.set(sha(real), Buffer.from('something else entirely'))
        await make(world)

        chase.noteOps('show', [upsert(sha(real), 'poster.png')])
        await drain()

        expect(world.calls.downloads.length).toBe(3) // tried, and tried again
        expect(world.calls.uploads).toEqual([])      // never once offered
        expect(world.here.files.size).toBe(0)
        expect(chase.files).toMatchObject({ carried: 0, pending: 0, failed: 1 })
        expect(chase.files.failures[0]).toMatchObject({ id: sha(real), name: 'poster.png' })
        expect(chase.files.failures[0].why).toMatch(/not the file its name says/)
        expect(await readdir(tmpDir)).toEqual([])
    })

    it('tries again after a failure, and carries the file once the other machine is back', async () => {
        const world = twoMachines()
        const bytes = Buffer.from('worth waiting for')
        world.there.files.set(sha(bytes), bytes)
        world.there.down = true
        await make(world, { backoffMs: [20, 20, 20] })

        chase.noteOps('show', [upsert(sha(bytes))])
        await chase.run()
        expect(chase.files).toMatchObject({ carried: 0, pending: 1, failed: 0 })

        world.there.down = false
        await drain()
        expect(world.here.files.has(sha(bytes))).toBe(true)
        expect(chase.files).toMatchObject({ carried: 1, pending: 0, failed: 0 })
    })

    it('does not keep asking a machine that refuses the key', async () => {
        const world = twoMachines()
        const bytes = Buffer.from('not allowed in')
        world.there.files.set(sha(bytes), bytes)
        world.here.putStatus = 403
        await make(world)

        chase.noteOps('show', [upsert(sha(bytes), 'loop.mp4')])
        await drain()

        expect(world.calls.uploads.length).toBe(1)
        expect(chase.files.failures).toEqual([{ id: sha(bytes), name: 'loop.mp4', why: 'this install refused the key' }])
    })

    it('an older di.iiii that has no such route is final, and said in words — not retried', async () => {
        for (const status of [404, 405]) {
            const world = twoMachines()
            const bytes = Buffer.from(`for an old host ${status}`)
            world.here.files.set(sha(bytes), bytes)
            world.there.putStatus = status
            world.there.putBody = { error: 'Not found' }
            await make(world)

            chase.noteOps('show', [upsert(sha(bytes), 'loop.mp4')])
            await drain()

            expect(world.calls.uploads.length).toBe(1)
            expect(chase.files.failures).toEqual([{ id: sha(bytes), name: 'loop.mp4', why: 'the other di.iiii is older and cannot receive files — update it' }])
            chase.stop()
        }
    })

    it('a project the other side has not made yet is NOT that — it is tried again', async () => {
        const world = twoMachines()
        const bytes = Buffer.from('the project arrives on the next pass')
        world.here.files.set(sha(bytes), bytes)
        world.there.putStatus = 404
        world.there.putBody = { error: 'Project not found.' }
        await make(world, { backoffMs: [20, 20, 20] })

        chase.noteOps('show', [upsert(sha(bytes))])
        await chase.run()
        expect(chase.files).toMatchObject({ pending: 1, failed: 0 })

        world.there.putStatus = 200
        await drain()
        expect(world.there.files.has(sha(bytes))).toBe(true)
    })

    it('refuses a file larger than the limit without storing any of it', async () => {
        const world = twoMachines()
        const bytes = Buffer.alloc(64, 1)
        world.there.files.set(sha(bytes), bytes)
        await make(world, { maxBytes: 16 })

        chase.noteOps('show', [upsert(sha(bytes), 'feature.mov', 64)])
        await drain()

        expect(world.calls.downloads).toEqual([]) // its size was known: not even started
        expect(chase.files.failures[0].why).toMatch(/larger than a follow carries/)
    })

    it('one stubborn file does not hold up the next', async () => {
        const world = twoMachines()
        const bad = Buffer.from('bad')
        const good = Buffer.from('good')
        world.there.files.set(sha(bad), bad)
        world.there.serves.set(sha(bad), Buffer.from('rot'))
        world.there.files.set(sha(good), good)
        await make(world, { backoffMs: [60_000] })

        chase.noteOps('show', [upsert(sha(bad)), upsert(sha(good))])
        await chase.run()

        expect(world.here.files.has(sha(good))).toBe(true)
        expect(chase.files).toMatchObject({ carried: 1, pending: 1 })
    })

    it('reads each project document once, from both machines, for files named before the follow began', async () => {
        const world = twoMachines()
        const early = Buffer.from('placed last week')
        const theirs = Buffer.from('named only in their document so far')
        world.there.files.set(sha(early), early)
        world.there.files.set(sha(theirs), theirs)
        world.here.docs.set('show', { assets: [{ id: sha(early), name: 'early.mp4', size: early.length }, { id: LEGACY, name: 'old.png' }] })
        world.there.docs.set('show', { assets: [{ id: sha(theirs), name: 'theirs.mp4', size: theirs.length }] })
        await make(world)

        chase.noteProjects(['show'])
        await drain()
        expect([...world.here.files.keys()].sort()).toEqual([sha(early), sha(theirs)].sort())
        expect(chase.files).toMatchObject({ carried: 2, notCarried: 1 })

        const downloads = world.calls.downloads.length
        chase.noteProjects(['show'])
        await drain()
        expect(world.calls.downloads.length).toBe(downloads)
    })

    it('forgets a file that was named and then taken away', async () => {
        const world = twoMachines()
        await make(world)
        chase.noteOps('show', [upsert(sha('gone')), remove(sha('gone'))])
        expect(chase.files.pending).toBe(0)

        // …and one whose removal was read first: neither machine holds it and
        // the document no longer names it, so it is dropped without a word.
        world.here.docs.set('show', { assets: [] })
        chase.noteOps('show', [upsert(sha('gone'))])
        await drain()
        expect(chase.files).toMatchObject({ pending: 0, failed: 0, carried: 0 })
    })

    it('stops: nothing more is started after stop()', async () => {
        const world = twoMachines()
        const bytes = Buffer.from('too late')
        world.there.files.set(sha(bytes), bytes)
        await make(world)
        chase.noteOps('show', [upsert(sha(bytes))])
        chase.stop()
        await chase.run()
        expect(world.calls.downloads).toEqual([])
    })
})

// 2026-10-09, aylmo: dev.diiii.xyz moved house and Cloudflare answered every
// request for it with 530, for hours. The chase went on asking about every file
// of every project, again and again: 1,400 "could not be carried" lines and
// 5,100 GETs on this install's own file routes a minute, di-server at 94 % CPU,
// and not one of those asks could have succeeded. An outage is one fact about
// the other machine, not one per file: said once, waited out as one, asked
// about once per wait, and ended the moment the other side answers again.
describe('when the other di.iiii stops answering', () => {
    const PROJECTS = ['p1', 'p2', 'p3']
    const PER_PROJECT = 20
    const FILES = PROJECTS.length * PER_PROJECT
    const local = side({ base: 'http://here', spaceId: 'room', token: 'self-token' })
    const remote = side({ base: 'http://there', spaceId: 'room', token: 'dii_sync_key' })
    let tmpDir = null
    let chase = null

    afterEach(async () => {
        chase?.stop()
        chase = null
        vi.useRealTimers()
        if (tmpDir) await rm(tmpDir, { recursive: true, force: true })
        tmpDir = null
    })

    /** Every file on this install only, named in both documents: the ops had crossed, the bytes not yet. */
    const showWorld = (projects = PROJECTS, perProject = PER_PROJECT) => {
        const world = twoMachines()
        for (const projectId of projects) {
            const assets = Array.from({ length: perProject }, (_, n) => {
                const bytes = Buffer.from(`${projectId}, file ${n}`)
                world.here.files.set(sha(bytes), bytes)
                return { id: sha(bytes), name: `${projectId}-${n}.glb`, size: bytes.length }
            })
            world.here.docs.set(projectId, { assets })
            world.there.docs.set(projectId, { assets })
        }
        return world
    }

    // No backoffMs, retryFailedAfterMs or reconcileEveryMs: the numbers that ran on aylmo.
    const start = async (world, lines) => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
        tmpDir = await mkdtemp(path.join(os.tmpdir(), 'dii-chase-down-'))
        chase = createAssetChase({
            local,
            remote,
            tmpDir,
            io: world.io,
            log: { warn: (line) => lines.warn.push(line), info: (line) => lines.info.push(line) }
        })
    }

    // What the follower does every five seconds while the other side does not
    // answer (follower.js tick()): hand over the projects, kick a pass, walk on.
    // `idle()` lets a pass that moves real bytes through tmpDir finish.
    const follow = async (ms, projects = PROJECTS, until = () => false) => {
        for (let at = 0; at < ms && !until(); at += 5000) {
            chase.noteProjects(projects)
            chase.run()
            await vi.advanceTimersByTimeAsync(5000)
            await chase.idle()
        }
    }

    const counts = (world, lines) => ({
        downloads: world.calls.downloads.length,
        warns: lines.warn.length,
        localFileAsks: world.calls.requests.filter(r => r.to === 'http://here' && r.path.includes('/assets/')).length,
        localDocumentReads: world.calls.requests.filter(r => r.to === 'http://here' && r.path.endsWith('/document')).length,
        remoteAsks: world.calls.requests.filter(r => r.to === 'http://there').length + world.calls.uploads.filter(u => u.to === 'http://there').length
    })

    it('says so once, waits as one, downloads nothing, asks once per wait — and carries every file once it answers', async () => {
        const world = showWorld()
        const lines = { warn: [], info: [] }
        await start(world, lines)

        world.there.status = 530
        await follow(10 * 60_000)
        const outage = counts(world, lines)
        // Bounds, and why. Found out by the asks that were due anyway — at most
        // three in a row that get no answer (three documents here). Then one
        // small question per wait: 5 s doubling to 5 min is six in ten minutes
        // (at 5, 15, 35, 75, 155 and 315 s). Nothing of this install's is read
        // or downloaded for a machine that cannot take it.
        expect.soft(outage.downloads, 'files downloaded while nothing could be carried').toBe(0)
        expect.soft(outage.warns, 'lines said about one outage').toBeLessThanOrEqual(2)
        expect.soft(outage.localFileAsks, "asks on this install's own file routes").toBeLessThanOrEqual(3)
        expect.soft(outage.localDocumentReads, "this install's documents read").toBeLessThanOrEqual(3)
        expect.soft(outage.remoteAsks, 'asks of a machine that is not answering').toBeLessThanOrEqual(12)
        console.info(`[outage, 10 simulated minutes, ${FILES} files] ${JSON.stringify(outage)}`)

        // It answers again: every file crosses, without anybody's help.
        world.there.status = null
        await follow(2 * 60_000, PROJECTS, () => world.there.files.size === FILES)
        expect(world.there.files.size).toBe(FILES)
        expect(chase.files).toMatchObject({ carried: FILES, pending: 0, failed: 0, missing: 0 })
        expect(lines.warn.filter(line => /not answering \(530\)/.test(line))).toHaveLength(1)
        expect(lines.warn.filter(line => /could not be carried/.test(line))).toEqual([])
        expect(lines.info.filter(line => /answers again/.test(line))).toHaveLength(1)
    })

    it('carries at once when the op loop hears the other side again, not at the end of its longest wait', async () => {
        const world = showWorld(['p1'], 5)
        const lines = { warn: [], info: [] }
        await start(world, lines)

        // One project: three passes 2 s apart find it out (at ~4 s); then asked
        // at ~9, 19, 39, 79, 159, 319, 619, 919 and 1219 s, next at ~1519 s.
        world.there.status = 530
        await follow(1300_000, ['p1'])
        world.there.status = null
        // A minute on, the chase has not asked again by itself: the wait is long now.
        await follow(60_000, ['p1'])
        expect(world.there.files.size).toBe(0)

        // The op loop's read of the other side came back (follower.js refreshStreams).
        chase.noteAnswered()
        await chase.idle()
        expect(world.there.files.size).toBe(5)
        expect(lines.info.filter(line => /answers again/.test(line))).toHaveLength(1)
    })

    it("one file's trouble stays that file's: no outage is declared for it", async () => {
        const world = twoMachines()
        const [refused, blip, fine] = ['refused', 'blip', 'fine'].map(text => Buffer.from(text))
        for (const bytes of [refused, blip, fine]) world.here.files.set(sha(bytes), bytes)
        // A 500 is the machine answering, about this one file. One 530 alone is
        // a lost answer, not an outage.
        world.there.metaStatus.set(sha(refused), 500)
        world.there.metaStatus.set(sha(blip), 530)
        const lines = { warn: [], info: [] }
        await start(world, lines)

        chase.noteOps('show', [upsert(sha(refused), 'refused.glb'), upsert(sha(blip), 'blip.glb'), upsert(sha(fine), 'fine.glb')])
        await chase.run()
        world.there.metaStatus.delete(sha(blip))
        await follow(60_000, [])

        expect([...world.there.files.keys()].sort()).toEqual([sha(blip), sha(fine)].sort())
        expect(chase.files).toMatchObject({ carried: 2, pending: 0, failed: 1 })
        expect(lines.warn).toEqual(['[follow] room: refused.glb could not be carried — the other di.iiii answered 500'])
        expect(lines.info).toEqual([])
    })
})
