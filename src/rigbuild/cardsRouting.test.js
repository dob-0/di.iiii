import { describe, expect, it } from 'vitest'
import { buildCardsPath, getCardsLocationState, isCardsLocation } from './cardsRouting.js'
import { RESERVED_APP_SEGMENTS } from '../utils/spaceRouting.js'

describe('/{space}/cards/{project}', () => {
    it('reads exactly three segments with "cards" in the middle', () => {
        expect(getCardsLocationState({ pathname: '/moxir/cards/moxir-hall' })).toEqual({ isCards: true, spaceId: 'moxir', projectId: 'moxir-hall' })
        expect(isCardsLocation(getCardsLocationState({ pathname: '/moxir/cards' }))).toBe(false)
        expect(isCardsLocation(getCardsLocationState({ pathname: '/moxir/cards/a/b' }))).toBe(false)
        expect(isCardsLocation(getCardsLocationState({ pathname: '/moxir/patch/moxir-hall' }))).toBe(false)
    })

    it('builds the path and reserves the word', () => {
        expect(buildCardsPath('moxir', 'moxir-hall')).toMatch(/\/moxir\/cards\/moxir-hall$/)
        expect(RESERVED_APP_SEGMENTS).toContain('cards')
    })
})
