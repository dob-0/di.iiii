import { describe, expect, it } from 'vitest'
import {
    ALGO_VRITHM_LABEL,
    ALGO_VRITHM_PATH,
    ALGO_VRITHM_SPACE_ID,
    isAlgoVrithmSegment
} from './algoVrithmRouting.js'

describe('algovrithm routing', () => {
    it('exposes a space id the server will actually accept', () => {
        // serverXR's normalizeSpaceId is /^[a-z0-9-]{1,48}$/ — an id carrying
        // an underscore or capitals is rejected outright, so the space would
        // 404 with no obvious cause.
        expect(ALGO_VRITHM_SPACE_ID).toMatch(/^[a-z0-9-]{1,48}$/)
    })

    it('spells the id, the URL and the label identically', () => {
        // The name was chosen to be a legal space id as typed, so there is no
        // styled-name-vs-slug seam here at all. If these three ever diverge,
        // someone has reintroduced one.
        expect(ALGO_VRITHM_LABEL).toBe('algovrithm')
        expect(ALGO_VRITHM_SPACE_ID).toBe(ALGO_VRITHM_LABEL)
        expect(ALGO_VRITHM_PATH).toBe(`/${ALGO_VRITHM_LABEL}`)
    })

    it('matches the plain id and other casings of the same name', () => {
        expect(isAlgoVrithmSegment(ALGO_VRITHM_SPACE_ID)).toBe(true)
        expect(isAlgoVrithmSegment('ALGOVRITHM')).toBe(true)
        expect(isAlgoVrithmSegment('AlgoVrithm')).toBe(true)
    })

    it('does not match unrelated or near-miss segments', () => {
        expect(isAlgoVrithmSegment('wcc')).toBe(false)
        expect(isAlgoVrithmSegment('beyond-form')).toBe(false)
        expect(isAlgoVrithmSegment('algo')).toBe(false)
        expect(isAlgoVrithmSegment('algovrithm-2')).toBe(false)
        expect(isAlgoVrithmSegment('')).toBe(false)
        // The two spellings this space has already been through. Neither is a
        // live URL any more — a dash or an underscore survives slugifying, so
        // these resolve to different space ids, not to this one.
        expect(isAlgoVrithmSegment('algo-vrithm')).toBe(false)
        expect(isAlgoVrithmSegment('algo_VRitm')).toBe(false)
    })

    it('keeps the display label and URL in sync with the id', () => {
        // The landing button and the route have to agree: the href a visitor
        // clicks must slugify back to the space the route checks for.
        expect(isAlgoVrithmSegment(ALGO_VRITHM_PATH.replace(/^\//, ''))).toBe(true)
    })
})
