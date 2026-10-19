import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { entryOps, productionOps, productionViewsOf, productionViewsOps, versionProjectIds } from './productionVersions.js'
import { applyProjectOps, normalizeProjectDocument } from './projectSchema.js'

const server = createRequire(import.meta.url)('../../shared/projectSchema.cjs')

// A production keeps one view list for all its versions (decision 3, 2026-10-13). Generic names: the platform knows
// productions, projects and views, never one production in particular.
const META = { id: 'show-2030', title: 'Show 2030', space: 'a-space', codeList: '' }
const version = (id, projectId, status = 'candidate') => ({ id, projectId, status })
const listWith = (entries, apply = applyProjectOps) => {
    let doc = normalizeProjectDocument({ entities: [] })
    doc = apply(doc, productionOps(doc, META))
    for (const e of entries) doc = apply(doc, entryOps(doc, e).ops)
    return doc
}
const VIEWS = [{ id: 'floor', live: true }, { id: 'top', live: true }, { id: 'door', label: 'Door', position: [0, 1.7, 9], target: [0, 2, 0], live: false }]

describe('the production’s views: one list for every version', () => {
    it('a production has no view list until one is chosen', () => {
        expect(productionViewsOf(listWith([version('a', 'show-a')]))).toBe(null)
        expect(productionViewsOf(null)).toBe(null)
    })

    it('the list lands on the production entity and reads back whole, through both schemas', () => {
        for (const apply of [applyProjectOps, server.applyProjectOps]) {
            const doc = listWith([version('a', 'show-a')], apply)
            const next = apply(doc, productionViewsOps(doc, VIEWS))
            expect(productionViewsOf(next)).toEqual(VIEWS)
            // a second choice replaces the first (arrays are replaced by the merge patch, not merged)
            const again = apply(next, productionViewsOps(next, [{ id: 'top', live: true }]))
            expect(productionViewsOf(again)).toEqual([{ id: 'top', live: true }])
        }
    })

    it('refuses a list without a production entity, and a list that is not a list', () => {
        expect(() => productionViewsOps(normalizeProjectDocument({ entities: [] }), VIEWS)).toThrow(/production entity/)
        expect(() => productionViewsOps(listWith([]), 'floor')).toThrow(/list/)
    })

    it('names every version project once, archived ones included', () => {
        const doc = listWith([version('a', 'show-a', 'for-the-show'), version('b', 'show-b', 'archived'), version('c', 'show-c', 'concept')])
        expect(versionProjectIds(doc).sort()).toEqual(['show-a', 'show-b', 'show-c'])
    })
})
