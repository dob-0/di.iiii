import { describe, expect, it } from 'vitest'
import { createDeck, expandDeck, GRADE_NEUTRAL, normalizeDeck, setGrade } from './vjDeck.js'

const masterValues = (deck) => expandDeck({ id: 'd', values: { deck } }).nodes.find((n) => n.id === 'd::master').values

describe('deck grade', () => {
    it('is neutral by default and leaves the master level as it was', () => {
        const deck = createDeck()
        expect(deck.grade).toEqual(GRADE_NEUTRAL)
        const v = masterValues(deck)
        expect([v.gain, v.contrast, v.exposure, v.brightness, v.gamma]).toEqual([1, 1, 0, 0, 1])
    })
    it('an old deck without a grade reads neutral', () => {
        const old = createDeck()
        delete old.grade
        expect(normalizeDeck(old).grade).toEqual(GRADE_NEUTRAL)
    })
    it('setGrade clamps, ignores unknown names and resets with null', () => {
        let deck = setGrade(createDeck(), 'contrast', 9)
        expect(deck.grade.contrast).toBe(3)
        deck = setGrade(deck, 'exposure', -1.5)
        deck = setGrade(deck, 'level', 0.5)
        expect(deck.grade).toEqual({ level: 0.5, contrast: 3, exposure: -1.5 })
        expect(setGrade(deck, 'nope', 1).grade).toEqual(deck.grade)
        expect(setGrade(deck, null).grade).toEqual(GRADE_NEUTRAL)
    })
    it('reaches the master level node', () => {
        const v = masterValues(setGrade(setGrade(setGrade(createDeck(), 'level', 1.4), 'contrast', 1.6), 'exposure', 0.5))
        expect([v.gain, v.contrast, v.exposure]).toEqual([1.4, 1.6, 0.5])
    })
})
