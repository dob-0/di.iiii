import { describe, expect, it } from 'vitest'
import { buildReparentPatch, cloneSubtree, collectSubtree, topLevelTargets } from './entityClipboard.js'

const entities = [
    { id: 'g1', type: 'group', name: 'Group', parentId: null, components: { transform: { position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] } } },
    { id: 'b1', type: 'box', name: 'Box', parentId: 'g1', components: { transform: { position: [0.5, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, appearance: { color: '#ff0000' } } },
    { id: 'g2', type: 'group', name: 'Inner', parentId: 'g1', components: { transform: { position: [0, 1, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } } },
    { id: 's1', type: 'sphere', name: 'Sphere', parentId: 'g2', components: { transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } } },
    { id: 'lone', type: 'cone', name: 'Cone', parentId: null, components: { transform: { position: [5, 0, 5], rotation: [0, 0, 0], scale: [1, 1, 1] } } }
]

describe('entityClipboard', () => {
    it('collectSubtree returns the whole hierarchy parent-first', () => {
        expect(collectSubtree(entities, 'g1').map((e) => e.id)).toEqual(['g1', 'b1', 'g2', 's1'])
        expect(collectSubtree(entities, 'lone').map((e) => e.id)).toEqual(['lone'])
    })

    it('topLevelTargets drops targets already inside another target subtree', () => {
        const targets = entities.filter((e) => ['g1', 's1', 'lone'].includes(e.id))
        expect(topLevelTargets(entities, targets).map((e) => e.id)).toEqual(['g1', 'lone'])
    })

    // Regression: duplicating a group used to clone only the group shell and
    // silently drop every child (docs/ai/known-fixes.md).
    it('cloneSubtree deep-copies children with fresh ids and remapped parentIds', () => {
        const clones = cloneSubtree(collectSubtree(entities, 'g1'))

        expect(clones).toHaveLength(4)
        const [group, box, inner, sphere] = clones
        const sourceIds = new Set(entities.map((e) => e.id))
        expect(clones.every((c) => !sourceIds.has(c.id))).toBe(true)

        expect(group.name).toBe('Group copy')
        expect(group.parentId).toBe(null)
        expect(box.parentId).toBe(group.id)
        expect(inner.parentId).toBe(group.id)
        expect(sphere.parentId).toBe(inner.id)

        expect(box.name).toBe('Box')
        expect(box.components.appearance.color).toBe('#ff0000')
    })

    it('cloneSubtree offsets only the root; children keep relative transforms', () => {
        const [group, box] = cloneSubtree(collectSubtree(entities, 'g1'))
        expect(group.components.transform.position).toEqual([1.4, 0, 1.4])
        expect(box.components.transform.position).toEqual([0.5, 0, 0])
    })
})

describe('buildReparentPatch', () => {
    it('nesting into a group keeps the world position (translation convention)', () => {
        const patch = buildReparentPatch(entities, 'lone', 'g1')
        expect(patch.parentId).toBe('g1')
        expect(patch.components.transform.position).toEqual([4, 0, 4])
    })

    it('moving to the root folds ancestor translations back in', () => {
        const patch = buildReparentPatch(entities, 's1', null)
        expect(patch.parentId).toBe(null)
        // s1 [0,0.5,0] + g2 [0,1,0] + g1 [1,0,1]
        expect(patch.components.transform.position).toEqual([1, 1.5, 1])
    })

    it('refuses cycles, self, non-group parents, and no-op moves', () => {
        expect(buildReparentPatch(entities, 'g1', 'g2')).toBe(null)
        expect(buildReparentPatch(entities, 'g1', 'g1')).toBe(null)
        expect(buildReparentPatch(entities, 'lone', 'b1')).toBe(null)
        expect(buildReparentPatch(entities, 'b1', 'g1')).toBe(null)
        expect(buildReparentPatch(entities, 'lone', null)).toBe(null)
        expect(buildReparentPatch(entities, 'missing', 'g1')).toBe(null)
    })
})
