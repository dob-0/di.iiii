import { describe, expect, it } from 'vitest'
import { isStudioEditorPath } from './PortalObject.jsx'

// Regression coverage: a plain `pathname.includes('/studio')` false-positived
// on any public space/project id or slug that merely STARTS WITH "studio"
// (e.g. "studio-tour") — those are legal, unreserved ids (spaceStore.js's
// RESERVED_SPACE_SLUGS is an exact-match Set, only 'studio' itself is
// reserved), so the portal's click-to-enter silently disabled itself for
// every visitor to such a space/project's public page.
describe('isStudioEditorPath', () => {
    it('matches the real Studio editor routes', () => {
        expect(isStudioEditorPath('/studio')).toBe(true)
        expect(isStudioEditorPath('/studio/projects/abc123')).toBe(true)
        expect(isStudioEditorPath('/myspace/studio')).toBe(true)
        expect(isStudioEditorPath('/myspace/studio/director')).toBe(true)
    })

    it('does not match a space or project id that merely starts with "studio"', () => {
        expect(isStudioEditorPath('/studio-tour')).toBe(false)
        expect(isStudioEditorPath('/expo/studio-tour')).toBe(false)
        expect(isStudioEditorPath('/expo/p/studio123')).toBe(false)
        expect(isStudioEditorPath('/studioworks')).toBe(false)
    })

    it('does not match an unrelated public viewer path', () => {
        expect(isStudioEditorPath('/myspace')).toBe(false)
        expect(isStudioEditorPath('/myspace/p/proj123')).toBe(false)
    })
})
