import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { findRefs, legacyAssets, planRewriteOps, rewriteIds, runReid, runUndo } from './assets-reid.mjs'
import { applyProjectOps, normalizeProjectDocument } from '../src/shared/projectSchema.js'

// A fake install: in-memory projects, a REAL ops route (the same applyProjectOps the server runs),
// and an upload route that content-addresses what it receives — and re-encodes images, so the id it
// answers differs from the bytes' sha256 for them, as the privacy scrub makes it on the real route.

const UUID_A = '11111111-aaaa-4aaa-8aaa-111111111111'
const UUID_B = '22222222-bbbb-4bbb-8bbb-222222222222'
const UUID_C = '33333333-cccc-4ccc-8ccc-333333333333'
const SHA = 'f'.repeat(64)
const clone = (x) => JSON.parse(JSON.stringify(x))

const projectDoc = (extra = {}) => normalizeProjectDocument({
    projectMeta: { id: 'p1', title: 'P1' },
    assets: [
        { id: UUID_A, name: 'wall.png', mimeType: 'image/png', size: 5, url: `/api/projects/p1/assets/${UUID_A}` },
        { id: UUID_B, name: 'clip.mp4', mimeType: 'video/mp4', size: 4, url: `/api/projects/p1/assets/${UUID_B}` },
        { id: SHA, name: 'kept.glb', mimeType: 'model/gltf-binary', size: 3, url: `/api/projects/p1/assets/${SHA}` }
    ],
    entities: [
        { id: 'e1', type: 'image', name: 'wall', components: { media: { assetId: UUID_A, label: 'x' } } },
        { id: 'e2', type: 'video', name: 'clip', components: { media: { assetId: UUID_B } } },
        { id: 'e3', type: 'model', name: 'kept', components: { media: { assetId: SHA } } }
    ],
    presentationState: { codeHtml: `<img src="/api/projects/p1/assets/${UUID_A}"><video src="/serverXR/api/projects/p1/assets/${UUID_B}"></video>` },
    ...extra
})

const fakeInstall = (docs, { bytes = {}, failUpload = {}, conflictOnce = false } = {}) => {
    const rows = new Map(Object.entries(docs).map(([id, document]) => [id, { version: 3, document: clone(document) }]))
    const posts = []
    const idFor = (name, buf) => createHash('sha256').update(name.endsWith('.png') ? Buffer.concat([buf, Buffer.from('scrubbed')]) : buf).digest('hex')
    let conflicted = false
    return {
        rows,
        posts,
        get: async (route) => {
            if (route === '/api/spaces/s/projects') return { ok: true, status: 200, body: { projects: [...rows.keys()].map((id) => ({ id })) } }
            const id = route.match(/^\/api\/projects\/([^/]+)\/document$/)?.[1]
            const row = id && rows.get(id)
            return row ? { ok: true, status: 200, body: clone(row) } : { ok: false, status: 404, body: null }
        },
        bytes: async (route) => {
            const [, , , , , assetId] = route.split('/')
            const b = bytes[decodeURIComponent(assetId)]
            return b ? { ok: true, status: 200, buffer: Buffer.from(b) } : { ok: false, status: 404, buffer: null }
        },
        post: async (route, body) => {
            const up = route.match(/^\/api\/projects\/([^/]+)\/assets$/)
            if (up) {
                const file = body.get('asset')
                if (failUpload[file.name]) return { ok: false, status: failUpload[file.name], body: null, text: 'no' }
                const buf = Buffer.from(await file.arrayBuffer())
                const id = idFor(file.name, buf)
                return { ok: true, status: 200, body: { ok: true, asset: { id, name: file.name, mimeType: file.type, size: buf.length, url: `/api/projects/${up[1]}/assets/${id}` } } }
            }
            const id = route.match(/^\/api\/projects\/([^/]+)\/ops$/)?.[1]
            const row = rows.get(id)
            if (conflictOnce && !conflicted) { conflicted = true; row.version += 1; row.document.entities[0].name = 'renamed meanwhile'; return { ok: false, status: 409, body: { latestVersion: row.version }, text: '' } }
            if (body.baseVersion !== row.version) return { ok: false, status: 409, body: {}, text: '' }
            posts.push(body.ops.map((o) => o.type))
            const versioned = body.ops.map((o) => ({ ...o, version: ++row.version }))
            row.document = applyProjectOps(row.document, versioned)
            return { ok: true, status: 200, body: { ok: true, newVersion: row.version } }
        }
    }
}

const BYTES = { [UUID_A]: 'png!!', [UUID_B]: 'mp4!' }

describe('assets-reid: what is an older file, and where is it named', () => {
    it('calls a file older exactly when its id is not a 64-hex sha256 (isCarriableId in follow/assets.js)', () => {
        expect(legacyAssets(projectDoc()).map((a) => a.id)).toEqual([UUID_A, UUID_B])
    })

    it('finds the references in entities and in page code, and counts them per old id', () => {
        const doc = projectDoc()
        const { counts, unsafe } = findRefs({ ...doc, assets: [] }, new Set([UUID_A, UUID_B]))
        expect(counts).toEqual({ [UUID_A]: 2, [UUID_B]: 2 })
        expect(unsafe).toEqual([])
    })

    it('refuses an id used as a key, in windowLayout, inside an entity id, or short inside free text', () => {
        const base = projectDoc()
        expect(findRefs({ ...base, entities: [{ id: 'e1', components: { byId: { [UUID_A]: 1 } } }] }, new Set([UUID_A])).unsafe.join()).toMatch(/object key/)
        expect(findRefs({ ...base, windowLayout: { note: UUID_A } }, new Set([UUID_A])).unsafe.join()).toMatch(/windowLayout/)
        expect(findRefs({ ...base, entities: [{ id: `x.${UUID_A}` }] }, new Set([UUID_A])).unsafe.join()).toMatch(/entity id/)
        expect(findRefs({ ...base, presentationState: { codeHtml: 'see abc123 here' } }, new Set(['abc123'])).unsafe.join()).toMatch(/short id/)
        expect(findRefs({ ...base, presentationState: { codeHtml: '/api/projects/p/assets/abc123' } }, new Set(['abc123'])).unsafe).toEqual([])
    })

    it('does not touch an id that only contains another', () => {
        expect(rewriteIds({ a: `${UUID_A}-more`, b: UUID_A }, { [UUID_A]: SHA })).toEqual({ a: `${UUID_A}-more`, b: SHA })
    })

    it('plans only ops the schema has, never a whole replace', () => {
        const before = projectDoc()
        const after = rewriteIds(before, { [UUID_A]: 'a'.repeat(64) })
        const { ops, refused } = planRewriteOps({ ...before, assets: [] }, { ...after, assets: [] })
        expect(refused).toEqual([])
        expect(ops.map((o) => o.type).sort()).toEqual(['setPresentationState', 'updateComponent'])
    })
})

describe('assets-reid: a run against a fake install', () => {
    it('--dry-run counts and writes nothing, downloads nothing', async () => {
        const inst = fakeInstall({ p1: projectDoc() }, { bytes: BYTES })
        const before = clone(inst.rows.get('p1'))
        const { rows, totals } = await runReid(inst, { space: 's', dry: true })
        expect(rows[0]).toMatchObject({ id: 'p1', assets: 3, legacy: 2, status: 'dry-run', refs: { [UUID_A]: 2, [UUID_B]: 2 } })
        expect(totals).toMatchObject({ projects: 1, legacy: 2, refs: 4, reided: 0, refused: 0 })
        expect(inst.posts).toEqual([])
        expect(inst.rows.get('p1')).toEqual(before)
    })

    it('re-adds every older file, rewrites every reference through ops, drops the old entries, reads back', async () => {
        const inst = fakeInstall({ p1: projectDoc() }, { bytes: BYTES })
        const { rows, totals } = await runReid(inst, { space: 's' })
        expect(rows[0].status).toBe('done')
        expect(totals).toMatchObject({ reided: 2, refused: 0, failed: 0 })
        const doc = inst.rows.get('p1').document
        const newA = rows[0].map[UUID_A]
        const newB = rows[0].map[UUID_B]
        expect(newA).toMatch(/^[a-f0-9]{64}$/)
        // the png was re-encoded by the "server", so its new id is NOT the sha256 of the bytes we sent
        expect(newA).not.toBe(createHash('sha256').update('png!!').digest('hex'))
        expect(newB).toBe(createHash('sha256').update('mp4!').digest('hex'))
        expect(doc.assets.map((a) => a.id).sort()).toEqual([newA, newB, SHA].sort())
        expect(doc.assets.find((a) => a.id === newA)).toMatchObject({ name: 'wall.png', mimeType: 'image/png', url: `/api/projects/p1/assets/${newA}` })
        expect(doc.entities.find((e) => e.id === 'e1').components.media.assetId).toBe(newA)
        expect(doc.entities.find((e) => e.id === 'e2').components.media.assetId).toBe(newB)
        expect(doc.presentationState.codeHtml).toContain(`/api/projects/p1/assets/${newA}`)
        expect(doc.presentationState.codeHtml).toContain(`/serverXR/api/projects/p1/assets/${newB}`)
        expect(JSON.stringify(doc)).not.toContain(UUID_A)
        expect(JSON.stringify(doc)).not.toContain(UUID_B)
        // ops only, and the deletes come after the new entries were read back
        const all = inst.posts.flat()
        expect(all).not.toContain('replaceDocument')
        expect(inst.posts.at(-1).every((t) => t === 'deleteAsset')).toBe(true)
        expect(all.filter((t) => t === 'upsertAsset')).toHaveLength(2)
    })

    it('is a no-op the second time', async () => {
        const inst = fakeInstall({ p1: projectDoc() }, { bytes: BYTES })
        await runReid(inst, { space: 's' })
        const n = inst.posts.length
        const second = await runReid(inst, { space: 's' })
        expect(second.rows[0].status).toBe('nothing')
        expect(inst.posts.length).toBe(n)
    })

    it('refuses a project whose old id sits where no op can write — uploads nothing, writes nothing', async () => {
        const bad = projectDoc({ windowLayout: { windows: {} } })
        bad.entities[0].components.byId = { [UUID_A]: 1 }
        const inst = fakeInstall({ p1: bad }, { bytes: BYTES })
        const before = clone(inst.rows.get('p1'))
        const { rows, totals } = await runReid(inst, { space: 's' })
        expect(rows[0].status).toBe('refused')
        expect(rows[0].why.join()).toMatch(/object key/)
        expect(totals.refused).toBe(1)
        expect(inst.posts).toEqual([])
        expect(inst.rows.get('p1')).toEqual(before)
    })

    it('leaves a file it could not download, with its references, and says so', async () => {
        const inst = fakeInstall({ p1: projectDoc() }, { bytes: { [UUID_B]: 'mp4!' } })
        const { rows } = await runReid(inst, { space: 's' })
        expect(rows[0].status).toBe('done-with-leftovers')
        expect(rows[0].why.join()).toMatch(/wall\.png: download answered 404/)
        const doc = inst.rows.get('p1').document
        expect(doc.assets.some((a) => a.id === UUID_A)).toBe(true)
        expect(doc.entities[0].components.media.assetId).toBe(UUID_A)
        expect(doc.assets.some((a) => a.id === UUID_B)).toBe(false)
    })

    it('re-reads and plans again when someone else wrote meanwhile', async () => {
        const inst = fakeInstall({ p1: projectDoc() }, { bytes: BYTES, conflictOnce: true })
        const { rows } = await runReid(inst, { space: 's' })
        expect(rows[0].status).toBe('done')
        const doc = inst.rows.get('p1').document
        expect(doc.entities[0].name).toBe('renamed meanwhile')
        expect(JSON.stringify(doc)).not.toContain(UUID_A)
    })

    it('writes an undo record that puts everything back', async () => {
        const inst = fakeInstall({ p1: projectDoc() }, { bytes: BYTES })
        const before = clone(inst.rows.get('p1').document)
        const { undo } = await runReid(inst, { space: 's' })
        expect(undo.projects[0].map).toBeTruthy()
        const results = await runUndo(inst, JSON.parse(JSON.stringify(undo)))
        expect(results[0].ok).toBe(true)
        const doc = inst.rows.get('p1').document
        expect(doc.assets.map((a) => a.id).sort()).toEqual(before.assets.map((a) => a.id).sort())
        expect(doc.entities).toEqual(before.entities)
        expect(doc.presentationState.codeHtml).toBe(before.presentationState.codeHtml)
    })
})

describe('sourceProjectOf — the store that holds an imported asset', () => {
    it('reads the project from the asset url, else the fallback', async () => {
        const { sourceProjectOf } = await import('./assets-reid.mjs')
        expect(sourceProjectOf({ url: '/api/projects/main-dii-project/assets/4c12' }, 'look-signal')).toBe('main-dii-project')
        expect(sourceProjectOf({ url: '/serverXR/api/projects/x%20y/assets/1' }, 'p')).toBe('x y')
        expect(sourceProjectOf({}, 'look-signal')).toBe('look-signal')
    })
})
