import { describe, expect, it } from 'vitest'
import { VISITOR_PARTS, canEditSession, normalizeVisitorChrome, productionChromeOf, productionChromeOps, visitorChromeOf } from './visitorChrome.js'
import { applyProjectOps, normalizeProjectDocument } from './projectSchema.js'
import { isSpaceInSessionScope } from '../utils/sessionScope.js'

describe('what visitors see (visitorChrome)', () => {
    it('every part is allowed until the author says false', () => {
        expect(visitorChromeOf(null)).toEqual({ versions: true, show: true, scenes: true, walk: true, views: true, layers: true })
        expect(VISITOR_PARTS.map((p) => p.id)).toEqual(Object.keys(visitorChromeOf(null)))
        expect(normalizeVisitorChrome({ show: false, junk: 1, scenes: 0 })).toMatchObject({ show: false, scenes: true, walk: true })
    })
    it('survives the project schema: a switch set to false is kept', () => {
        const doc = normalizeProjectDocument({})
        const next = applyProjectOps(doc, [{ type: 'setPresentationState', payload: { patch: { visitorChrome: { ...visitorChromeOf(doc), show: false, layers: false } } } }])
        expect(visitorChromeOf(next)).toMatchObject({ show: false, layers: false, versions: true })
    })
    it('the production keeps the choice next to its views', () => {
        const list = { entities: [{ id: 'production', components: { productionViews: { viewPresets: [] } } }] }
        expect(productionChromeOf(list)).toBeNull()
        const [op] = productionChromeOps(list, { views: false })
        expect(op.payload.component).toBe('productionViews')
        expect(op.payload.patch.visitorChrome.views).toBe(false)
        expect(() => productionChromeOps({ entities: [] }, {})).toThrow(/production entity/)
        expect(productionChromeOf({ entities: [{ id: 'production', components: { productionViews: { visitorChrome: { views: false } } } }] }).views).toBe(false)
    })
    it('Edit in Studio only for someone who can edit in that space', () => {
        const can = (s, space = 'moxir') => canEditSession(s, space, isSpaceInSessionScope)
        expect(can({ requireAuth: false })).toBe(true) // a local install without sign-in
        expect(can({ requireAuth: true, authenticated: false })).toBe(false)
        expect(can({ requireAuth: true, authenticated: true, role: 'editor', spaces: ['other'] })).toBe(false)
        expect(can({ requireAuth: true, authenticated: true, role: 'editor', spaces: ['moxir'] })).toBe(true)
        expect(can({ requireAuth: true, authenticated: false, role: 'admin' })).toBe(true)
    })
})
