import { describe, expect, it } from 'vitest'
import {
    GUIDE_AUDIENCES,
    getGuideManualPath,
    getGuideSection,
    getGuideSectionForSurface
} from './betaGuide.js'

describe('betaGuide', () => {
    it('returns the requested section', () => {
        expect(getGuideSection('graph').title).toBe('Wire values')
    })

    it('maps surfaces to their guide section', () => {
        expect(getGuideSectionForSurface('view').id).toBe('view')
        expect(getGuideSectionForSurface('unknown').id).toBe('start')
    })

    it('exposes the manual path', () => {
        expect(getGuideManualPath()).toBe('docs/beta/USER_MANUAL.md')
    })

    it('defines visitor and creator onboarding tracks', () => {
        expect(GUIDE_AUDIENCES.map((audience) => audience.id)).toEqual(['visitor', 'creator'])
    })
})
