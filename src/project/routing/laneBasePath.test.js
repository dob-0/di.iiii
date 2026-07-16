import { describe, expect, it } from 'vitest'
import { createBasePathHelpers, joinPath } from './laneBasePath.js'

describe('createBasePathHelpers', () => {
    it('treats a root base path as having no prefix', () => {
        const { getBasePrefix, stripBasePath } = createBasePathHelpers('/')
        expect(getBasePrefix()).toBe('')
        expect(stripBasePath('/beta/projects/x')).toBe('/beta/projects/x')
    })

    it('strips a non-root base path from the front of a pathname', () => {
        const { getBasePrefix, stripBasePath } = createBasePathHelpers('/app/')
        expect(getBasePrefix()).toBe('/app')
        expect(stripBasePath('/app/beta')).toBe('/beta')
        expect(stripBasePath('/app')).toBe('/')
    })

    it('leaves a pathname that does not start with the base path unchanged', () => {
        const { stripBasePath } = createBasePathHelpers('/app')
        expect(stripBasePath('/other/beta')).toBe('/other/beta')
    })

    it('falls back to root for an empty/undefined base path', () => {
        const { getBasePrefix } = createBasePathHelpers()
        expect(getBasePrefix()).toBe('')
    })
})

describe('joinPath', () => {
    it('joins segments with single slashes, collapsing doubles', () => {
        expect(joinPath('', 'beta')).toBe('/beta')
        expect(joinPath('/app', 'beta')).toBe('/app/beta')
        expect(joinPath('', 'main', 'beta', 'projects', 'p1')).toBe('/main/beta/projects/p1')
    })
})
