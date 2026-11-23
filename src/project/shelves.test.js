import { describe, expect, it } from 'vitest'
import { groupByShelf, UNSHELVED } from './shelves.js'

const project = (id, collectionId = null) => ({ id, title: id, collectionId })
const shelf = (id, label) => ({ id, label })

describe('groupByShelf', () => {
    it('a space with no shelves is one group with no label, holding every project in order', () => {
        const projects = [project('c'), project('a'), project('b', 'gone')]
        const groups = groupByShelf(projects, [])
        expect(groups).toEqual([{ id: UNSHELVED, label: null, items: projects }])
        expect(groups[0].items.map(p => p.id)).toEqual(['c', 'a', 'b'])
    })

    it('keeps the shelves in the order they are given, each with its own projects', () => {
        const groups = groupByShelf(
            [project('a', 'two'), project('b', 'one'), project('c', 'two')],
            [shelf('two', 'Second'), shelf('one', 'First')]
        )
        expect(groups.map(g => [g.id, g.label, g.items.map(p => p.id)])).toEqual([
            ['two', 'Second', ['a', 'c']],
            ['one', 'First', ['b']]
        ])
    })

    it('keeps an empty shelf', () => {
        const groups = groupByShelf([project('a', 'one')], [shelf('one', 'First'), shelf('empty', 'Nothing yet')])
        expect(groups.map(g => [g.id, g.items.length])).toEqual([['one', 1], ['empty', 0]])
    })

    it('puts a project on no shelf, or on a shelf that is not known, in the loose group, last', () => {
        const groups = groupByShelf(
            [project('a', 'one'), project('b'), project('c', 'removed')],
            [shelf('one', 'First')]
        )
        expect(groups.map(g => g.id)).toEqual(['one', UNSHELVED])
        expect(groups[1]).toEqual({ id: UNSHELVED, label: 'Not on a shelf', items: [project('b'), project('c', 'removed')] })
    })

    it('has no loose group when everything is on a shelf', () => {
        const groups = groupByShelf([project('a', 'one')], [shelf('one', 'First')])
        expect(groups.map(g => g.id)).toEqual(['one'])
    })

    it('lets the loose heading be changed', () => {
        const groups = groupByShelf([project('a')], [shelf('one', 'First')], { looseLabel: 'Everything else' })
        expect(groups[groups.length - 1].label).toBe('Everything else')
    })
})
