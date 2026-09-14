import { describe, expect, it } from 'vitest'
import { doorTitleForCard, sameName, spaceName } from './spaceNames.js'

// The dev tier's thirteen spaces as measured 2026-09-14, reduced to what the
// rule reads: the space's label, its id, and its door project's title.
const DEV = [
    { id: 'drum-rhythms', label: 'Drum Rhythms', publishedProjectId: 'rhythms', title: 'Drum Rhythms' },
    { id: 'network', label: 'The network', publishedProjectId: 'network', title: 'who makes di.iiii' },
    { id: 'wcc', label: 'WCC Exhibition', publishedProjectId: 'main', title: 'Main' },
    { id: 'platform-recordar', label: 'RecordAR', publishedProjectId: 'platform-recordar-dii-project', title: 'RecordAR' },
    { id: 'beyond-form', label: 'Beyond Form', publishedProjectId: 'open-call', title: 'Beyond Form' },
    { id: 'main', label: 'di.iiii', publishedProjectId: 'main-dii-project', title: 'Everything made here' },
    { id: 'br-id-ge', label: 'br_id_ge', publishedProjectId: 'landing', title: 'the landing — the door' },
    { id: 'azd', label: 'azd', publishedProjectId: 'azd', title: 'azd' },
    { id: 'algovrithm', label: 'algovrithm', publishedProjectId: null, title: null },
    { id: 'open', label: 'Open Space', publishedProjectId: 'open-jam', title: 'Open Jam' },
    { id: 'cascade', label: 'Cascade Club', publishedProjectId: 'club', title: 'Cascade Club' },
    { id: 'the-light-put-back', label: 'The Light Put Back', publishedProjectId: 'the-light-put-back', title: 'The Light Put Back' },
    { id: 'dilijan', label: 'Dilijan', publishedProjectId: 'welcome', title: 'Welcome' }
]

describe('one name per space', () => {
    it('reads a name by its words, not its spelling', () => {
        expect(sameName('br_id_ge', 'br-id-ge')).toBe(true)
        expect(sameName('Drum Rhythms', 'drum-rhythms')).toBe(true)
        expect(sameName('Դիլիջան', 'դիլիջան')).toBe(true)
        expect(sameName('Dilijan', 'Welcome')).toBe(false)
        expect(sameName('', '')).toBe(false)
    })

    it('calls a space by its label, or its id when it has none', () => {
        expect(spaceName({ id: 'azd', label: 'azd' })).toBe('azd')
        expect(spaceName({ id: 'x1', label: '  ' })).toBe('x1')
    })

    it('never names the project to a visitor — on any of the dev cards', () => {
        for (const { title, ...space } of DEV) {
            expect(doorTitleForCard({ space, projectTitle: title, isVisitor: true })).toBeNull()
        }
    })

    it('tells an account only the doors that say something the name does not', () => {
        const shown = DEV
            .map(({ title, ...space }) => [space.id, doorTitleForCard({ space, projectTitle: title, isVisitor: false })])
            .filter(([, line]) => line)
        expect(shown).toEqual([
            ['network', 'who makes di.iiii'],
            ['wcc', 'Main'],
            ['main', 'Everything made here'],
            ['br-id-ge', 'the landing — the door'],
            ['open', 'Open Jam'],
            ['dilijan', 'Welcome']
        ])
    })

    it('does not print a bare project id when the title lookup failed', () => {
        const space = { id: 'wcc', label: 'WCC Exhibition', publishedProjectId: 'main' }
        expect(doorTitleForCard({ space, projectTitle: 'main', isVisitor: false })).toBeNull()
    })
})
