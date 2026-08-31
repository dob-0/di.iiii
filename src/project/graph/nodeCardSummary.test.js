import { describe, expect, it } from 'vitest'
import { getNodeCardSummary } from '../nodeRegistry.js'

// A card's body is nothing but port rows, so a node that correctly declares no
// ports draws an empty box — a list holding 23 rows looked exactly like one
// holding none. These guard the one line such a card can afford.
describe('getNodeCardSummary', () => {
    const list = (values) => ({ id: 'n', typeId: 'view.list', values })

    it('counts the rows and the groups', () => {
        expect(getNodeCardSummary(list({
            groups: ['A', 'B'],
            items: [{ text: 'one', group: 'A' }, { text: 'two', group: 'B' }]
        }))).toBe('2 rows · 2 groups')
    })

    it('says so when the list is empty', () => {
        expect(getNodeCardSummary(list({ groups: ['A'], items: [] }))).toBe('empty')
    })

    // A row someone is mid-way through typing is not content, and counting it
    // makes the card disagree with what the window shows.
    it('does not count blank rows', () => {
        expect(getNodeCardSummary(list({
            groups: ['A'], items: [{ text: 'one', group: 'A' }, { text: '   ', group: 'A' }]
        }))).toBe('1 row · 1 group')
    })

    it('survives a node with no values at all', () => {
        expect(getNodeCardSummary({ id: 'n', typeId: 'view.list' })).toBe('empty')
        expect(getNodeCardSummary(null)).toBeNull()
    })

    // Most types have nothing worth saying, and a summary is only drawn where
    // there are no ports — a fallback string would sit on top of a port row.
    it('is null for types that have ports to draw', () => {
        expect(getNodeCardSummary({ id: 'n', typeId: 'view.text', values: { content: 'hi' } })).toBeNull()
        expect(getNodeCardSummary({ id: 'n', typeId: 'geom.cube', values: {} })).toBeNull()
    })
})
