// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'

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
 */
const twoMachines = () => {
    const machines = {
        'http://here': { files: new Map(), docs: new Map(), serves: new Map(), down: false, putStatus: 200 },
        'http://there': { files: new Map(), docs: new Map(), serves: new Map(), down: false, putStatus: 200 }
    }
    const calls = { downloads: [], uploads: [], tokens: [] }
    const parse = (url) => {
        const u = new URL(url)
        const machine = machines[u.origin]
        const [, projectId, kind, id, tail] = u.pathname.match(/^\/api\/projects\/([^/]+)\/(assets|document)(?:\/([^/]+))?(?:\/(meta))?$/) || []
        return { u, machine, projectId, kind, id, tail }
    }
    const answer = (status, body = {}) => ({ status, ok: status >= 200 && status < 300, headers: {}, text: JSON.stringify(body), json: () => body })
    const io = {
        request: async (url, { headers = {} } = {}) => {
            const { machine, projectId, kind, id } = parse(url)
            calls.tokens.push(headers.Authorization || null)
            if (machine.down) throw new Error('connect ECONNREFUSED')
            if (kind === 'document') {
                return machine.docs.has(projectId) ? answer(200, { document: machine.docs.get(projectId) }) : answer(404)
            }
            return machine.files.has(id)
                ? answer(200, { asset: { id, name: 'clip.mp4', mimeType: 'video/mp4', size: machine.files.get(id).length } })
                : answer(404)
        },
        download: async (url, { destPath, maxBytes }) => {
            const { machine, id } = parse(url)
            calls.downloads.push(id)
            if (machine.down) throw new Error('connect ECONNREFUSED')
            const bytes = machine.serves.get(id) || machine.files.get(id)
            if (bytes.length > maxBytes) throw Object.assign(new Error('too large'), { code: 'TOO_LARGE' })
            await writeFile(destPath, bytes)
            return { ok: true, status: 200, headers: {}, size: bytes.length, sha256: sha(bytes) }
        },
        upload: async (url, { filePath, headers = {} }) => {
            const { u, machine, id } = parse(url)
            calls.uploads.push({ to: u.origin, id, name: u.searchParams.get('name'), mimeType: u.searchParams.get('mimeType'), token: headers.Authorization || null })
            if (machine.down) throw new Error('connect ECONNREFUSED')
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
