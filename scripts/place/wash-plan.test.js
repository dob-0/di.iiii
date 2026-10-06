import { describe, expect, it } from 'vitest'
import { WASH_BYTES_CAP, freedAssetOps, perLookWashEntity, perLookWashOps, sha256Hex, uploadsNeeded, washBudget, washRemovalLine } from './wash-plan.mjs'
import { fileURLToPath } from 'node:url'

// RIG_BUILD.md §15.13 — rig.mjs --wash-per-look, the plan it writes.
const bytesOf = (text) => Buffer.from(text)
const wash = (id, assetId) => ({ id, type: 'model', components: { media: { assetId } } })

describe('the per-look wash entity', () => {
    it('is rig-wash:<look>, a hidden model on the wash asset', () => {
        const e = perLookWashEntity({ lookId: 'gs-red-room', assetId: 'abc', count: 10 })
        expect(e.id).toBe('rig-wash:gs-red-room')
        expect(e.type).toBe('model')
        expect(e.components.media).toEqual({ assetId: 'abc', playAnimations: false })
        expect(e.components.runtime.visible).toBe(false)
        expect(e.components.appearance.opacity).toBe(0)
        expect(e.name).toContain('10 PAR washes')
    })
})

describe('the ops', () => {
    const asset = (hash) => ({ id: hash, name: 'w.glb', size: 5 })
    it('takes the old per-look washes down, uploads each distinct mesh once, leaves the single rig-wash alone', () => {
        const a = bytesOf('aaaaa')
        const b = bytesOf('bbbbb')
        const bakes = [{ lookId: 'up', bytes: a, count: 4 }, { lookId: 'cross', bytes: b, count: 6 }, { lookId: 'same-as-up', bytes: a, count: 4 }]
        const have = [wash('rig-wash', 'single-asset'), wash('rig-wash:up', 'old-up'), wash('rig-wash:gone', 'old-gone'), { id: 'rig-a-01', type: 'spotLight', components: {} }]
        const ops = perLookWashOps({ have, bakes, assetFor: (lookId) => asset(sha256Hex(bakes.find((x) => x.lookId === lookId).bytes)) })
        expect(ops.filter((o) => o.type === 'deleteEntity').map((o) => o.payload.entityId).sort()).toEqual(['rig-wash:gone', 'rig-wash:up'])
        expect(ops.filter((o) => o.type === 'deleteAsset').map((o) => o.payload.assetId).sort()).toEqual(['old-gone', 'old-up'])
        expect(ops.filter((o) => o.type === 'upsertAsset').map((o) => o.payload.asset.id)).toEqual([sha256Hex(a), sha256Hex(b)])
        const made = ops.filter((o) => o.type === 'createEntity').map((o) => o.payload.entity)
        expect(made.map((e) => e.id)).toEqual(['rig-wash:up', 'rig-wash:cross', 'rig-wash:same-as-up'])
        expect(made[0].components.media.assetId).toBe(made[2].components.media.assetId)
        expect(made.every((e) => e.components.runtime.visible === false)).toBe(true)
        expect(ops.some((o) => o.payload?.entityId === 'rig-wash' || o.payload?.assetId === 'single-asset' || o.payload?.entityId === 'rig-a-01')).toBe(false)
    })

    it('keeps an old asset a new entity still points at (the same bytes: nothing re-uploaded)', () => {
        const a = bytesOf('aaaaa')
        const have = [wash('rig-wash:up', sha256Hex(a))]
        const ops = perLookWashOps({ have, bakes: [{ lookId: 'up', bytes: a, count: 1 }], assetFor: () => asset(sha256Hex(a)) })
        expect(ops.filter((o) => o.type === 'deleteAsset')).toEqual([])
        expect(uploadsNeeded({ bakes: [{ lookId: 'up', bytes: a }], assets: [asset(sha256Hex(a))] })).toEqual([])
        expect(uploadsNeeded({ bakes: [{ lookId: 'up', bytes: a }, { lookId: 'x', bytes: a }], assets: [] })).toHaveLength(1)
    })
})

describe('the size guard', () => {
    it('counts the per-look bytes (distinct) plus the single wash, logs a line, and refuses over the cap', () => {
        const big = Buffer.alloc(1024 * 1024, 1)
        const ok = washBudget({ bakes: [{ lookId: 'a', bytes: big }, { lookId: 'b', bytes: big }], have: [wash('rig-wash', 's')], assets: [{ id: 's', size: 100 * 1024 }] })
        expect(ok.ok).toBe(true)
        expect(ok.total).toBe(1024 * 1024 + 100 * 1024) // the two identical bakes are one asset
        expect(ok.line).toMatch(/1024 KB per look together \+ 100 KB the single rig-wash = 1124 KB of the 2048 KB cap/)
        expect(ok.message).toBe(null)
        const over = washBudget({ bakes: [{ lookId: 'a', bytes: big }, { lookId: 'b', bytes: Buffer.alloc(1024 * 1024 + 1, 2) }] })
        expect(over.ok).toBe(false)
        expect(over.message).toMatch(/^REFUSED: 2048 KB of baked wash for one project is over the 2048 KB cap/)
        expect(over.message).toContain('nothing was written')
        expect(WASH_BYTES_CAP).toBe(2 * 1024 * 1024)
    })
})

// Measured on the committed data: every look of the ground versions baked with the versions file's
// hall — the ids the writer would create, and the project's wash bytes against the cap.
describe('the ground versions, baked per look (measured)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const { buildRig } = await import('./rig-lib.mjs')
    const { washGlb } = await import('./wash-glb.mjs')
    const { readGeometry } = await import('./fixtures-glb.mjs')
    const { washEntityId } = await import('../../src/rigbuild/looks.js')
    const here = path.dirname(fileURLToPath(import.meta.url))
    const manifest = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'fixtures.json'), 'utf8'))
    const geometry = Object.fromEntries(Object.keys(manifest.kinds).map((k) => [k, readGeometry(k)]))
    const spec = JSON.parse(fs.readFileSync(path.join(here, 'rigs', 'moxir-versions-2026-10-17.json'), 'utf8'))
    const hall = JSON.parse(fs.readFileSync(path.join(here, '..', '..', spec.hall), 'utf8')) // the versions' own hall (crane over the DJ)

    for (const name of ['minimal-ground', 'full-ground']) {
        it(`${name}: one rig-wash:<look> per look that bakes, all of them under the cap`, async () => {
            const rig = JSON.parse(fs.readFileSync(path.join(here, 'rigs', `moxir-2026-10-17-${name}.json`), 'utf8'))
            const lookIds = Object.keys(rig.looks)
            expect(lookIds.length).toBeGreaterThanOrEqual(9)
            const bakes = []
            for (const lookId of lookIds) {
                const one = buildRig(rig, hall, { look: lookId, geometry, manifest })
                if (one.washes.length) bakes.push({ lookId, bytes: await washGlb(one.washes), count: one.washes.length })
            }
            expect(bakes.length).toBeGreaterThan(1) // more than the one look the single wash was baked for
            const ops = perLookWashOps({ have: [], bakes, assetFor: (lookId) => ({ id: sha256Hex(bakes.find((b) => b.lookId === lookId).bytes) }) })
            const ids = ops.filter((o) => o.type === 'createEntity').map((o) => o.payload.entity.id)
            expect(ids).toEqual(bakes.map((b) => washEntityId(b.lookId)))
            const budget = washBudget({ bakes })
            expect(budget.ok).toBe(true)
            expect(budget.total).toBeGreaterThan(100 * 1024)
        })
    }
})

describe('review B1 — a shared asset is never dropped, counted once, and the full run says what it removed', () => {
    it('B1-1: freedAssetOps keeps an asset another entity (a per-look wash) still points at', () => {
        const single = wash('rig-wash', 'H')
        const have = [single, wash('rig-wash:red', 'H'), wash('rig-wash:other', 'Q')]
        expect(freedAssetOps({ removed: [single], have })).toEqual([])
        expect(freedAssetOps({ removed: [single], have: [single] })).toEqual([{ type: 'deleteAsset', payload: { assetId: 'H' } }])
        expect(freedAssetOps({ removed: [single], have: [single], keep: ['H'] })).toEqual([])
    })
    it('B1-3: perLookWashOps keeps the asset of any entity that is not a per-look wash', () => {
        const have = [wash('rig-wash:old', 'X'), { id: 'my-copy', type: 'model', components: { media: { assetId: 'X' } } }, wash('rig-wash:gone', 'Y')]
        const ops = perLookWashOps({ have, bakes: [{ lookId: 'n', count: 1 }], assetFor: () => ({ id: 'Z', size: 1 }) })
        const deleted = ops.filter((o) => o.type === 'deleteAsset').map((o) => o.payload.assetId)
        expect(deleted).toEqual(['Y'])
    })
    it('B1-4: a full run names how many per-look washes it took down and the re-bake', () => {
        expect(washRemovalLine([wash('rig-wash', 'H'), wash('rig-wash:a', 'A'), wash('rig-wash:b', 'B')])).toMatch(/2 per-look washes.*--wash-per-look/)
        expect(washRemovalLine([wash('rig-wash', 'H')])).toBe(null)
    })
    it('B1-5: washBudget counts an asset the single wash shares with a bake once', () => {
        const bytes = bytesOf('aaaaa')
        const h = sha256Hex(bytes)
        const b = washBudget({ bakes: [{ lookId: 'red', bytes }], have: [wash('rig-wash', h)], assets: [{ id: h, size: 5 }] })
        expect(b.total).toBe(5)
        expect(b.singleBytes).toBe(0)
        const c = washBudget({ bakes: [{ lookId: 'red', bytes }], have: [wash('rig-wash', 'other')], assets: [{ id: 'other', size: 7 }] })
        expect(c.total).toBe(12)
    })
})
