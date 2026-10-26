import { describe, expect, it } from 'vitest'
import { isPlatformName, spaceTabTitle, spaceWordFor } from './oneNamePerSpace.js'

// "One name per space" (owner, 2026-09-14; docs/ai/vocabulary.md): the surface bar and the browser tab say the
// space's NAME. The same word on every page of the space, whatever address was typed to reach it.

describe('isPlatformName', () => {
    it('is the brand, whatever its case or padding', () => {
        expect(isPlatformName('di.iiii')).toBe(true)
        expect(isPlatformName('  DI.iiii ')).toBe(true)
    })

    it('is not an address, an id or the name of any other space', () => {
        for (const other of ['di-iiii', 'main', 'Main Space', 'Dilijan As A Screen', 'di.iiii studio', '', '  ', null, undefined, 4]) {
            expect(isPlatformName(other), String(other)).toBe(false)
        }
    })
})

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

    it('leaves the tab to index.html for the platform\'s own space, however it was reached', () => {
        // by its id
        expect(spaceTabTitle({ spaceId: 'main', label: 'di.iiii', address: 'di-iiii' })).toBeNull()
        // by its address: the id the surface was handed is the typed word, the name is still the brand
        expect(spaceTabTitle({ spaceId: 'di-iiii', label: 'di.iiii', address: 'di-iiii' })).toBeNull()
        // by its id, with no name on record
        expect(spaceTabTitle({ spaceId: 'main' })).toBeNull()
        // inside one of its projects: still the platform's, never "<project> — di.iiii — di.iiii"
        expect(spaceTabTitle({ spaceId: 'di-iiii', label: 'di.iiii', projectTitle: 'Landing' })).toBeNull()
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
