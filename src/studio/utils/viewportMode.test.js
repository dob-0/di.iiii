import { describe, expect, it } from 'vitest'
import { resolveViewportMode } from './viewportMode.js'

const doc = (over = {}) => ({ projectMeta: { id: 'p' }, entities: [], nodes: [], ...over })
const entity = { id: 'e1', type: 'box' }

describe('resolveViewportMode — what the Studio viewport shows', () => {
    it('a project that holds code files and no scene opens its page, not the empty 3D grid', () => {
        const d = doc({ presentationState: { mode: 'scene', entryView: 'scene', codeFiles: [{ name: 'index.html', content: '<p>hi</p>' }] } })
        expect(resolveViewportMode(d)).toBe('code')
    })

    it('a stored code mode or code entry view opens the page', () => {
        expect(resolveViewportMode(doc({ presentationState: { mode: 'code' } }))).toBe('code')
        expect(resolveViewportMode(doc({ presentationState: { mode: 'scene', entryView: 'code' } }))).toBe('code')
    })

    it('a scene project, even one that also holds code, keeps the 3D scene', () => {
        const d = doc({ entities: [entity], presentationState: { mode: 'scene', codeHtml: '<p>hi</p>' } })
        expect(resolveViewportMode(d)).toBe('scene')
    })

    it('a scene project whose public entry view is Code still opens its scene in the Studio, as before', () => {
        const d = doc({ entities: [entity], presentationState: { mode: 'scene', entryView: 'code', codeHtml: '<p>hi</p>' } })
        expect(resolveViewportMode(d)).toBe('scene')
        expect(resolveViewportMode(doc({ nodes: [{ id: 'n1' }], presentationState: { entryView: 'code' } }))).toBe('scene')
    })

    it('a project that holds nothing opens the scene, as before', () => {
        expect(resolveViewportMode(doc())).toBe('scene')
        expect(resolveViewportMode(doc({ presentationState: { mode: 'scene' } }))).toBe('scene')
    })

    it('the "Write code" door (?open=files) on a project with no scene opens the page; with objects it does not', () => {
        expect(resolveViewportMode(doc(), { asked: 'files' })).toBe('code')
        expect(resolveViewportMode(doc({ entities: [entity] }), { asked: 'files' })).toBe('scene')
        expect(resolveViewportMode(doc(), { asked: 'create' })).toBe('scene')
    })

    it('a choice made with the toggle is kept, both ways', () => {
        const codeProject = doc({ presentationState: { mode: 'scene', codeHtml: '<p>hi</p>' } })
        expect(resolveViewportMode(codeProject, { choice: 'scene' })).toBe('scene')
        expect(resolveViewportMode(doc({ entities: [entity] }), { choice: 'code' })).toBe('code')
    })

    it('a stored fixed-camera mode is kept as stored', () => {
        expect(resolveViewportMode(doc({ presentationState: { mode: 'fixed-camera', codeHtml: '<p>hi</p>' } }))).toBe('fixed-camera')
    })
})
