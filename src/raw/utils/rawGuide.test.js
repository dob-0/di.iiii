import { describe, expect, it } from 'vitest'
import {
    GUIDE_SECTIONS,
    getGuideManualPath,
    getGuideSection
} from './rawGuide.js'

describe('rawGuide', () => {
    it('returns the requested section, defaulting to start', () => {
        expect(getGuideSection('start').id).toBe('start')
        expect(getGuideSection('unknown').id).toBe('start')
    })

    it('teaches no retired surface — World/View/Graph are gone', () => {
        const text = JSON.stringify(GUIDE_SECTIONS)
        expect(text).not.toMatch(/Switch View|builds the scene|builds the interface/)
        expect(GUIDE_SECTIONS.map((s) => s.id)).not.toContain('world')
        expect(GUIDE_SECTIONS.map((s) => s.id)).not.toContain('view')
    })

    it('exposes the manual path', () => {
        expect(getGuideManualPath()).toBe('docs/raw/USER_MANUAL.md')
    })
})
