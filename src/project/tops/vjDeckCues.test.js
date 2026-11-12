import { describe, expect, it } from 'vitest'
import { addColumn, createDeck, normalizeDeck, setColumnCue } from './vjDeck.js'
import { cueForColumn, columnForCue } from './vjDeckCues.js'

const cues = [
    { id: 'cue-a', name: 'Alpha', lightLook: 'look-a' },
    { id: 'cue-b', name: 'Beta', lightScene: 'scene-b' }
]

describe('deck.columnCues', () => {
    it('a fresh deck has one empty entry per column', () => {
        expect(createDeck({ columns: 5 }).columnCues).toEqual(['', '', '', '', ''])
    })

    it('an old deck without the field loads with all entries empty', () => {
        const old = createDeck({ columns: 3 })
        delete old.columnCues
        expect(normalizeDeck(old).columnCues).toEqual(['', '', ''])
    })

    it('a wrong value reads as empty, a too long list is cut, a short one is filled', () => {
        const base = createDeck({ columns: 3 })
        expect(normalizeDeck({ ...base, columnCues: [7, null, { id: 'x' }] }).columnCues).toEqual(['', '', ''])
        expect(normalizeDeck({ ...base, columnCues: 'cue-a' }).columnCues).toEqual(['', '', ''])
        expect(normalizeDeck({ ...base, columnCues: ['cue-a', 'cue-b', 'c', 'd', 'e'] }).columnCues).toEqual(['cue-a', 'cue-b', 'c'])
        expect(normalizeDeck({ ...base, columnCues: ['cue-a'] }).columnCues).toEqual(['cue-a', '', ''])
    })

    it('add column keeps the list in step, the new column has no cue', () => {
        const deck = addColumn(setColumnCue(createDeck({ columns: 2 }), 1, 'cue-b'))
        expect(deck.columns).toBe(3)
        expect(deck.columnCues).toEqual(['', 'cue-b', ''])
    })

    it('a deck with fewer columns than its list drops the extra entries (the removal case)', () => {
        const wide = setColumnCue(createDeck({ columns: 4 }), 3, 'cue-b')
        expect(normalizeDeck({ ...wide, columns: 2 }).columnCues).toEqual(['', ''])
    })

    it('setColumnCue sets and clears one column, and ignores a column that is not there', () => {
        const deck = setColumnCue(createDeck({ columns: 3 }), 0, 'cue-a')
        expect(deck.columnCues).toEqual(['cue-a', '', ''])
        expect(setColumnCue(deck, 0, '').columnCues).toEqual(['', '', ''])
        expect(setColumnCue(deck, 9, 'cue-b').columnCues).toEqual(['cue-a', '', ''])
        expect(setColumnCue(deck, -1, 'cue-b').columnCues).toEqual(['cue-a', '', ''])
        expect(setColumnCue(deck, 1, 42).columnCues).toEqual(['cue-a', '', ''])
    })
})

describe('cueForColumn', () => {
    const deck = setColumnCue(setColumnCue(createDeck({ columns: 4 }), 0, 'cue-a'), 2, 'gone')
    it('the cue whose id is stored for the column', () => {
        expect(cueForColumn(deck, 0, cues)).toBe(cues[0])
    })
    it('nothing for an empty entry, an id no cue has, a column that is not there, or no cue list', () => {
        expect(cueForColumn(deck, 1, cues)).toBeNull()
        expect(cueForColumn(deck, 2, cues)).toBeNull()
        expect(cueForColumn(deck, 9, cues)).toBeNull()
        expect(cueForColumn(deck, 0, undefined)).toBeNull()
    })
    it('never matches by name', () => {
        const named = setColumnCue(createDeck({ columns: 2 }), 0, 'Alpha')
        expect(cueForColumn(named, 0, cues)).toBeNull()
    })
})

describe('columnForCue', () => {
    it('finds the column that holds the cue', () => {
        const deck = setColumnCue(createDeck({ columns: 4 }), 2, 'cue-a')
        expect(columnForCue(deck, 'cue-a')).toBe(2)
    })
    it('says -1 when no column holds it', () => {
        expect(columnForCue(setColumnCue(createDeck({ columns: 3 }), 0, 'cue-a'), 'cue-z')).toBe(-1)
    })
    it('an empty or wrong id never matches, even though empty columns hold ""', () => {
        const deck = createDeck({ columns: 3 })
        expect(columnForCue(deck, '')).toBe(-1)
        expect(columnForCue(deck, null)).toBe(-1)
        expect(columnForCue(deck, 7)).toBe(-1)
    })
    it('with several columns holding it, the lowest wins', () => {
        let deck = createDeck({ columns: 5 })
        deck = setColumnCue(setColumnCue(deck, 3, 'cue-a'), 1, 'cue-a')
        expect(columnForCue(deck, 'cue-a')).toBe(1)
    })
})
