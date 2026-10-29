import { describe, expect, it } from 'vitest'
import { NEW_PROJECT, NEW_SCENE, newProjectDestination } from './newProjectEntry.js'
import { resolveOpeningView } from '../../shared/openingView.js'

describe('where a new project opens', () => {
    it('a new project with no content opens its project view, not the 3D editor', () => {
        const to = newProjectDestination({ kind: NEW_PROJECT, projectId: 'fresh', spaceId: 'cinema-house' })
        expect(to).toBe('/cinema-house/p/fresh')
        expect(to).not.toContain('/studio')
        // and what that address shows for a project holding nothing
        expect(resolveOpeningView({ projectMeta: { id: 'fresh' }, entities: [], nodes: [] })).toBe('page')
    })

    it('defaults to the project view when no kind is given', () => {
        expect(newProjectDestination({ projectId: 'fresh', spaceId: 'cinema-house' })).toBe('/cinema-house/p/fresh')
    })

    it('a new scene opens the scene editor', () => {
        expect(newProjectDestination({ kind: NEW_SCENE, projectId: 'fresh', spaceId: 'cinema-house' }))
            .toBe('/cinema-house/studio/projects/fresh')
    })
})
