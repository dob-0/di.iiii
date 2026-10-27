import { describe, expect, it } from 'vitest'
import { spaceTabTitle, spaceWordFor } from './oneNamePerSpace.js'

// "One name per space" (owner, 2026-09-14; docs/ai/vocabulary.md): the surface bar and the browser tab say the
// space's NAME. The same word on every page of the space, whatever address was typed to reach it.

describe('spaceWordFor', () => {
    it('is the space\'s name', () => {
        expect(spaceWordFor('Dilijan As A Screen', 'dilijan-camp')).toBe('Dilijan As A Screen')
        expect(spaceWordFor('  Dilijan As A Screen ', 'dilijan-camp')).toBe('Dilijan As A Screen')
    })

    it('is the address when the space has no name', () => {
        for (const none of ['', '   ', null, undefined]) {
            expect(spaceWordFor(none, 'queer-lab'), String(none)).toBe('queer-lab')
        }
    })

    it('is nothing at all when nothing is known', () => {
        expect(spaceWordFor(null, null)).toBe('')
        expect(spaceWordFor('', undefined)).toBe('')
    })
})

describe('spaceTabTitle', () => {
    it('is the space\'s name, then di.iiii', () => {
        expect(spaceTabTitle({ spaceId: 'dilijan', label: 'Dilijan As A Screen', address: 'dilijan-camp' }))
            .toBe('Dilijan As A Screen — di.iiii')
    })

    it('is the same whichever address was typed', () => {
        const title = 'Dilijan As A Screen — di.iiii'
        expect(spaceTabTitle({ spaceId: 'dilijan', label: 'Dilijan As A Screen', address: 'dilijan-camp' })).toBe(title)
        expect(spaceTabTitle({ spaceId: 'dilijan-camp', label: 'Dilijan As A Screen', address: 'dilijan-camp' })).toBe(title)
    })

    it('puts the project first when the address named it', () => {
        expect(spaceTabTitle({ spaceId: 'wcc', label: 'WCC Exhibition', projectTitle: 'Mery Petrosyan' }))
            .toBe('Mery Petrosyan — WCC Exhibition — di.iiii')
    })

    it('leaves the tab to index.html for the platform\'s own space, by its id, however it was reached', () => {
        // the callers hand the record's id, whichever address was typed
        expect(spaceTabTitle({ spaceId: 'main', label: 'Home', address: 'di-iiii' })).toBeNull()
        expect(spaceTabTitle({ spaceId: 'main' })).toBeNull()
        expect(spaceTabTitle({ spaceId: 'main', label: 'Home', projectTitle: 'Landing' })).toBeNull()
    })

    it('has no carve-out on a name: a space that happens to be named like the brand is a space', () => {
        expect(spaceTabTitle({ spaceId: 'di-iiii', label: 'di.iiii', address: 'di-iiii' })).toBe('di.iiii — di.iiii')
    })

    it('says the address for a space with no name', () => {
        expect(spaceTabTitle({ spaceId: 'queerlab', label: '', address: 'queer-lab' })).toBe('queer-lab — di.iiii')
        expect(spaceTabTitle({ spaceId: 'queerlab' })).toBe('queerlab — di.iiii')
    })

    it('says nothing while nothing is known', () => {
        expect(spaceTabTitle()).toBeNull()
        expect(spaceTabTitle({ label: '  ' })).toBeNull()
    })
})
