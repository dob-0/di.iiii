import { describe, expect, it } from 'vitest'
import { applyProjectOps, normalizeProjectDocument } from '../../../shared/projectSchema.js'
import { entryOps, productionOps, productionViewsOf } from '../../../shared/productionVersions.js'
import { writeViewsEverywhere } from './productionViewsSync.js'

// An in-memory server: documents by id, a version each, the ops applied by the shared schema; a conflict when the
// base version is stale (as POST /api/projects/:id/ops answers).
const fakeServer = (docs, { failOn = [], staleOnce = [] } = {}) => {
    const store = new Map(Object.entries(docs).map(([id, document]) => [id, { document, version: 3 }]))
    const stale = new Set(staleOnce)
    const calls = []
    return {
        store,
        calls,
        api: {
            getDocument: async (id) => {
                if (!store.has(id)) throw new Error('404')
                return structuredClone(store.get(id))
            },
            submitOps: async (id, baseVersion, ops) => {
                calls.push(id)
                if (failOn.includes(id)) throw new Error('403')
                const row = store.get(id)
                if (stale.delete(id)) { row.version += 1; throw new Error('409 conflict') }
                if (baseVersion !== row.version) throw new Error('409 conflict')
                store.set(id, { document: applyProjectOps(row.document, ops), version: row.version + ops.length })
            }
        }
    }
}
const list = () => {
    let doc = normalizeProjectDocument({ entities: [] })
    doc = applyProjectOps(doc, productionOps(doc, { id: 'show-2030', title: 'Show 2030' }))
    for (const [id, projectId] of [['a', 'show-a'], ['b', 'show-b']]) doc = applyProjectOps(doc, entryOps(doc, { id, projectId, status: 'candidate' }).ops)
    return doc
}
const project = () => normalizeProjectDocument({ entities: [] })
const VIEWS = [{ id: 'floor', live: true }, { id: 'top', live: false }]

describe('one view list, written everywhere it is read', () => {
    it('writes the production’s list and every version’s own copy', async () => {
        const s = fakeServer({ 'show-2030-versions': list(), 'show-a': project(), 'show-b': project() })
        const result = await writeViewsEverywhere({ viewPresets: VIEWS, listProjectId: 'show-2030-versions', projectIds: ['show-a', 'show-b'], api: s.api })
        expect(result).toEqual({ written: ['show-2030-versions', 'show-a', 'show-b'], unchanged: [], failed: [] })
        expect(productionViewsOf(s.store.get('show-2030-versions').document)).toEqual(VIEWS)
        expect(s.store.get('show-b').document.presentationState.viewPresets).toEqual(VIEWS)
    })

    it('writes nothing where the list is already there, and says so', async () => {
        const s = fakeServer({ 'show-2030-versions': list(), 'show-a': project() })
        await writeViewsEverywhere({ viewPresets: VIEWS, listProjectId: 'show-2030-versions', projectIds: ['show-a'], api: s.api })
        s.calls.length = 0
        const again = await writeViewsEverywhere({ viewPresets: VIEWS, listProjectId: 'show-2030-versions', projectIds: ['show-a'], api: s.api })
        expect(again).toEqual({ written: [], unchanged: ['show-2030-versions', 'show-a'], failed: [] })
        expect(s.calls).toEqual([])
    })

    it('reads again after a conflict, and names what it could not write instead of throwing', async () => {
        const s = fakeServer({ 'show-a': project(), 'show-b': project() }, { staleOnce: ['show-a'], failOn: ['show-b'] })
        const result = await writeViewsEverywhere({ viewPresets: VIEWS, projectIds: ['show-a', 'show-b', 'nowhere'], api: s.api })
        expect(result.written).toEqual(['show-a'])
        expect(result.failed.map((f) => f.projectId)).toEqual(['show-b', 'nowhere'])
        expect(s.store.get('show-a').document.presentationState.viewPresets).toEqual(VIEWS)
    })
})
