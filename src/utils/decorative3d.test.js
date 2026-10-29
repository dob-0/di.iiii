import { describe, expect, it } from 'vitest'
import { landingBackdropOn, prefersReducedMotion, sceneForced, wikiBackdropOn } from './decorative3d.js'
import { SPACE_CARD_PREVIEWS_KEY, spaceCardPreviewMode } from '../studio/utils/spaceCardMode.js'

const win = ({ search = '', reduced = false, stored = null } = {}) => ({
    location: { search },
    matchMedia: () => ({ matches: reduced }),
    localStorage: { getItem: (key) => (key === SPACE_CARD_PREVIEWS_KEY ? stored : null) },
})

describe('decorative 3D (F138)', () => {
    it('wiki is flat unless ?scene=1', () => {
        expect(wikiBackdropOn(win())).toBe(false)
        expect(wikiBackdropOn(win({ search: '?scene=1' }))).toBe(true)
        expect(sceneForced(win({ search: '?scene=0' }))).toBe(false)
    })

    it('front page keeps its room, unless the reader asked for reduced motion', () => {
        expect(landingBackdropOn(win())).toBe(true)
        expect(landingBackdropOn(win({ reduced: true }))).toBe(false)
        expect(landingBackdropOn(win({ reduced: true, search: '?scene=1' }))).toBe(true)
        expect(prefersReducedMotion(win({ reduced: true }))).toBe(true)
    })
})

describe('space card preview mode (F136)', () => {
    it('is a calm still by default, live by address or by setting', () => {
        expect(spaceCardPreviewMode(win())).toBe('still')
        expect(spaceCardPreviewMode(win({ search: '?previews=live' }))).toBe('live')
        expect(spaceCardPreviewMode(win({ stored: 'live' }))).toBe('live')
        expect(spaceCardPreviewMode(win({ stored: 'other' }))).toBe('still')
    })
})
