import { describe, expect, it } from 'vitest'
import { resolveOpeningView } from './openingView.js'
import { normalizeProjectDocument } from './projectSchema.js'

const doc = (patch = {}) => normalizeProjectDocument(patch)
const entity = { id: 'e1', type: 'cube' }

describe('resolveOpeningView', () => {
    it('opens the scene of a project that has objects', () => {
        expect(resolveOpeningView(doc({ entities: [entity] }))).toBe('scene')
    })
    it('opens a code page as code', () => {
        expect(resolveOpeningView(doc({ presentationState: { mode: 'code', codeHtml: '<p>hi</p>' } }))).toBe('code')
        expect(resolveOpeningView(doc({ presentationState: { codeUrl: 'https://example.com' } }))).toBe('code')
    })
    it('opens the plain project view when there is neither scene nor code', () => {
        expect(resolveOpeningView(doc())).toBe('page')
    })
    it('keeps an explicit author choice', () => {
        expect(resolveOpeningView(doc({ presentationState: { entryView: 'fixed-camera' } }))).toBe('fixed-camera')
        expect(resolveOpeningView(doc({ presentationState: { mode: 'code' } }))).toBe('code')
    })
})
