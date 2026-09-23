import { describe, expect, it } from 'vitest'
import { buildEntityTree, walkEntityTree } from './entityTree.js'

const thing = (id, parentId = null, type = 'box') => ({ id, type, name: id, ...(parentId ? { parentId } : {}) })

describe('what stands under what', () => {
    it('puts a grouped thing under its group, and only there', () => {
        const { roots, childrenOf } = buildEntityTree([thing('g', null, 'group'), thing('a', 'g'), thing('b')])
        expect(roots.map((e) => e.id)).toEqual(['g', 'b'])
        expect(childrenOf.get('g').map((e) => e.id)).toEqual(['a'])
    })

    // The room drew such a thing before the tree existed; dropping it because a
    // field points nowhere would make it vanish from Nodes' room.
    it('keeps a thing whose parent is gone, at the top', () => {
        const { roots } = buildEntityTree([thing('a', 'missing')])
        expect(roots.map((e) => e.id)).toEqual(['a'])
    })

    it('never lets a thing stand under itself', () => {
        const { roots, childrenOf } = buildEntityTree([thing('a', 'a')])
        expect(roots.map((e) => e.id)).toEqual(['a'])
        expect(childrenOf.size).toBe(0)
    })

    it('walks depth first, each thing once, with its depth', () => {
        const walk = walkEntityTree([
            thing('b'),
            thing('g', null, 'group'),
            thing('g2', 'g', 'group'),
            thing('x', 'g2'),
            thing('y', 'g')
        ])
        expect(walk.map(({ entity, depth }) => `${entity.id}:${depth}`)).toEqual(['b:0', 'g:0', 'g2:1', 'x:2', 'y:1'])
    })

    // Studio draws from its roots too, so a cycle shows in neither — but the
    // walk must end.
    it('ends on a parent cycle', () => {
        const walk = walkEntityTree([thing('a', 'b'), thing('b', 'a'), thing('c')])
        expect(walk.map(({ entity }) => entity.id)).toEqual(['c'])
    })

    it('reads garbage as nothing', () => {
        expect(walkEntityTree(null)).toEqual([])
        expect(walkEntityTree([null, {}, thing('a')]).map(({ entity }) => entity.id)).toEqual(['a'])
    })
})
