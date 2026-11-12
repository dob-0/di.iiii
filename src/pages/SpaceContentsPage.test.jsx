import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceContentsPage from './SpaceContentsPage.jsx'
import { doorsForListRow, projectDoors } from '../project/doors.js'

const listSpaceContentsMock = vi.fn()
const listCollectionsMock = vi.fn()
const listProjectsMock = vi.fn()
const getServerSpaceMock = vi.fn()
const appNavigateMock = vi.fn()

vi.mock('../project/services/projectsApi.js', () => ({
    listSpaceContents: (...args) => listSpaceContentsMock(...args),
    listCollections: (...args) => listCollectionsMock(...args),
    listProjects: (...args) => listProjectsMock(...args),
    DEFAULT_PROJECT_SPACE_ID: 'main'
}))

vi.mock('../services/serverSpaces.js', () => ({
    getServerSpace: (...args) => getServerSpaceMock(...args)
}))

vi.mock('../utils/appNavigate.js', () => ({
    appNavigate: (...args) => appNavigateMock(...args),
    setAppNavigate: () => {}
}))

const mockSessionRole = vi.hoisted(() => ({ value: 'viewer' }))
vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => ({ role: mockSessionRole.value, spaces: [], openSpaceId: 'open', sandboxSpaceId: null, requireAuth: true })
}))

vi.mock('../hooks/useLocalInstall.js', () => ({
    default: () => ({ resolved: true, isLocal: false })
}))

const allToolsOn = vi.hoisted(() => ({ value: false }))
vi.mock('../studio/utils/jamMode.js', async (importOriginal) => ({
    ...(await importOriginal()),
    useAllTools: () => allToolsOn.value
}))

const contents = [
    { id: 'n2-hub', slug: 'n2-hub', title: 'Notations #2', mode: 'scene', updatedAt: Date.now() },
    { id: 'camp', slug: null, title: 'The camp page', mode: 'code', updatedAt: Date.now() },
    { id: 'one-shot', slug: null, title: 'One shot', mode: 'fixed-camera', updatedAt: Date.now() }
]

describe('a space\'s contents page', () => {
    beforeEach(() => {
        listSpaceContentsMock.mockReset()
        listCollectionsMock.mockReset()
        listProjectsMock.mockReset()
        getServerSpaceMock.mockReset()
        appNavigateMock.mockReset()
        getServerSpaceMock.mockResolvedValue({ id: 'br_id_ge', label: 'br_id_ge', publishedProjectId: 'n2-hub' })
        // A space with no shelves, unless a test files some: what a member's page gets from a space that has none.
        listCollectionsMock.mockResolvedValue([])
        listProjectsMock.mockResolvedValue([])
    })

    // The whole point, in one assertion: the 114 projects that no click reached
    // are reachable because every row the server hands over becomes a link.
    it('makes every thing on show a link, whether or not it has a public handle', async () => {
        listSpaceContentsMock.mockResolvedValue(contents)
        render(<SpaceContentsPage spaceId="br_id_ge" />)

        const hub = await screen.findByRole('link', { name: /Notations #2/ })
        expect(hub).toHaveAttribute('href', '/br_id_ge/n2-hub')
        // No slug set: the permanent /p/ form, never a dead link.
        expect(screen.getByRole('link', { name: /The camp page/ })).toHaveAttribute('href', '/br_id_ge/p/camp')
        expect(screen.getByRole('link', { name: /One shot/ })).toHaveAttribute('href', '/br_id_ge/p/one-shot')
    })

    // Read from presentationState.mode, which is the author's own setting —
    // never guessed, and never a stored kind the document could contradict.
    it('says whether each thing is a scene or a page', async () => {
        listSpaceContentsMock.mockResolvedValue(contents)
        render(<SpaceContentsPage spaceId="br_id_ge" />)

        await screen.findByRole('link', { name: /Notations #2/ })
        expect(screen.getAllByText('Scene')).toHaveLength(2)   // scene + fixed-camera
        expect(screen.getAllByText('Page')).toHaveLength(1)    // code
        expect(screen.getByText('one view')).toBeTruthy()
    })

    // One name per space: the list's tab was the index.html default on every
    // space, while its heading and the /{space} tab said the space's name.
    it('names the tab after the space, the same as its heading', async () => {
        getServerSpaceMock.mockResolvedValue({ id: 'network', label: 'The network', publishedProjectId: 'network' })
        listSpaceContentsMock.mockResolvedValue(contents)
        const before = document.title
        const { unmount } = render(<SpaceContentsPage spaceId="network" />)

        expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('The network')
        await waitFor(() => expect(document.title).toBe('The network — di.iiii'))
        unmount()
        expect(document.title).toBe(before)
    })

    // One name per space (owner, 2026-09-14), on the platform's own space reached by its address: the page compared the
    // word that was typed with 'main', so the tab read "di.iiii — di.iiii" and the bar "di.iiii · di.iiii". The space is
    // named in data ("Home") and the tab is asked of the record's id, so it keeps the front door's title.
    it('keeps the default tab and says the platform\'s own space by its name, reached by its address', async () => {
        getServerSpaceMock.mockResolvedValue({ id: 'main', slug: 'di-iiii', label: 'Home', publishedProjectId: null })
        listSpaceContentsMock.mockResolvedValue(contents)
        document.title = 'di.iiii — public spaces on the open web'
        render(<SpaceContentsPage spaceId="di-iiii" />)

        expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Home')
        expect(document.title).toBe('di.iiii — public spaces on the open web')
        expect(document.querySelector('.sbar-home').textContent).toBe('di.iiii')
        const where = document.querySelector('.sbar-where')
        expect(where.textContent).toBe('Home')
        expect(where).toHaveAttribute('href', '/di-iiii')
    })

    it('says the address for a space that has no name — in the bar, the heading and the tab', async () => {
        getServerSpaceMock.mockResolvedValue({ id: 'queerlab', slug: 'queer-lab', label: '', publishedProjectId: null })
        listSpaceContentsMock.mockResolvedValue(contents)
        render(<SpaceContentsPage spaceId="queerlab" />)

        expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('queer-lab')
        const where = document.querySelector('.sbar-where')
        expect(where.textContent).toBe('queer-lab')
        expect(where).toHaveAttribute('href', '/queer-lab')
        await waitFor(() => expect(document.title).toBe('queer-lab — di.iiii'))
    })

    it('says a named space\'s name in the bar and links it to the space\'s address, whichever address was typed', async () => {
        listSpaceContentsMock.mockResolvedValue(contents)
        for (const typed of ['dilijan', 'dilijan-camp']) {
            getServerSpaceMock.mockResolvedValue({ id: 'dilijan', slug: 'dilijan-camp', label: 'Dilijan As A Screen', publishedProjectId: null })
            const { unmount } = render(<SpaceContentsPage spaceId={typed} />)
            await screen.findByRole('heading', { level: 1 })
            const where = document.querySelector('.sbar-where')
            expect(where.textContent, typed).toBe('Dilijan As A Screen')
            expect(where, typed).toHaveAttribute('href', '/dilijan-camp')
            unmount()
        }
    })

    // The server sends a private row to a member only (serverXR/src/projectVisibility.js);
    // the member is told that this one is not what a visitor sees.
    it('marks a private row as private, and no other', async () => {
        listSpaceContentsMock.mockResolvedValue([...contents, { id: 'sources', slug: null, title: 'Venue sources', mode: 'scene', updatedAt: Date.now(), visibility: 'private' }])
        render(<SpaceContentsPage spaceId="br_id_ge" />)

        const row = await screen.findByRole('link', { name: /Venue sources/ })
        expect(row.textContent).toContain('private')
        expect(screen.getByRole('link', { name: /The camp page/ }).textContent).not.toContain('private')
    })

    it('names the one project the space opens on', async () => {
        listSpaceContentsMock.mockResolvedValue(contents)
        render(<SpaceContentsPage spaceId="br_id_ge" />)
        expect(await screen.findByText('the way in')).toBeTruthy()
    })

    // A space holding one thing must not grow a page that says less than the
    // thing does — the list would be a screen whose only content is a link to
    // the room the visitor would already be standing in.
    it('hands a visitor the room instead of a list of one, when that one IS the door', async () => {
        listSpaceContentsMock.mockResolvedValue([contents[0]])
        render(<SpaceContentsPage spaceId="br_id_ge" />)
        await waitFor(() => expect(appNavigateMock).toHaveBeenCalledWith('/br_id_ge', { replace: true }))
    })

    // ...but one project that is NOT the door is exactly the case this page
    // exists for: nothing else in the product links to it.
    it('stays put when the space holds one thing that no door opens onto', async () => {
        getServerSpaceMock.mockResolvedValue({ id: 'atlas', label: 'atlas', publishedProjectId: null })
        listSpaceContentsMock.mockResolvedValue([{ id: 'links', slug: null, title: 'Links', mode: 'code', updatedAt: 0 }])
        render(<SpaceContentsPage spaceId="atlas" />)

        expect(await screen.findByRole('link', { name: /Links/ })).toHaveAttribute('href', '/atlas/p/links')
        expect(appNavigateMock).not.toHaveBeenCalled()
    })

    it('says so plainly when a space has nothing on show', async () => {
        listSpaceContentsMock.mockResolvedValue([])
        render(<SpaceContentsPage spaceId="br_id_ge" />)
        expect(await screen.findByText(/Nothing here yet\. The owner has not shown anything\./)).toBeTruthy()
    })

    it('does not tell the owner that "the owner" has not shown anything', async () => {
        mockSessionRole.value = 'admin'
        try {
            listSpaceContentsMock.mockResolvedValue([])
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            expect(await screen.findByText('Nothing here yet.')).toBeTruthy()
            expect(screen.queryByText(/The owner has not shown anything/)).toBeNull()
        } finally {
            mockSessionRole.value = 'viewer'
        }
    })
    // The bug this page was reported for: the owner opened the WCC space,
    // counted eleven artist rooms and asked where the landing page was. It is
    // compiled React at /wcc with no row on any server, so a list built from
    // the server alone could not show it — src/works/works.js is the other
    // half of the answer, and the row is a row like any other.
    it('shows a space whose front page is code, in line with the projects', async () => {
        getServerSpaceMock.mockResolvedValue({ id: 'wcc', label: 'WCC Exhibition', publishedProjectId: 'main' })
        listSpaceContentsMock.mockResolvedValue([
            { id: 'main', slug: null, title: 'Main', mode: 'scene', updatedAt: Date.now() },
            { id: 'arthur', slug: 'arthur', title: 'Arthur', mode: 'scene', updatedAt: Date.now() }
        ])
        render(<SpaceContentsPage spaceId="wcc" />)

        // Named for what it IS. "WCC Exhibition" is the space's own name and
        // the surface bar's — a row repeating it says nothing.
        const landing = await screen.findByRole('link', { name: /Landing page/ })
        expect(landing).toHaveAttribute('href', '/wcc')
        expect(screen.getByText(/Everything in this space — 3 things/)).toBeTruthy()
        expect(screen.getAllByText('Page')).toHaveLength(1)
    })

    // Two rows saying "the way in" is one row too many. Where a work shadows
    // the space, the stored door is not the way in: the router hands /wcc to
    // the code before any space route sees it, so `main` is reachable only at
    // its own address and the code page is what a visitor actually meets.
    it('gives "the way in" to the code page, not to the door the database names', async () => {
        getServerSpaceMock.mockResolvedValue({ id: 'wcc', label: 'WCC Exhibition', publishedProjectId: 'main' })
        listSpaceContentsMock.mockResolvedValue([
            { id: 'main', slug: null, title: 'Main', mode: 'scene', updatedAt: Date.now() }
        ])
        render(<SpaceContentsPage spaceId="wcc" />)

        await screen.findByRole('link', { name: /Landing page/ })
        const marks = screen.getAllByText('the way in')
        expect(marks).toHaveLength(1)
        expect(marks[0].closest('a')).toHaveAttribute('href', '/wcc')
    })
})

// Nav reach (2026-11-12): a member's page offers the doors of each scene and groups the list under the space's
// shelves; a visitor's page is exactly what it was, and asks for nothing more.
describe('a space\'s contents page: doors and shelves', () => {
    const doorsOf = (project) => projectDoors({
        space: 'br_id_ge',
        project: project.id,
        projectLabel: project.title,
        mode: project.mode,
        isLocalInstall: false,
        from: 'studio'
    })
    const rowOf = (name) => screen.getByRole('link', { name }).closest('li')
    // The strips are drawn once the member's own request has settled, a moment after the rows.
    const stripsDrawn = () => waitFor(() => expect(document.querySelector('.sc-door')).not.toBeNull())

    const asMember = async (run) => {
        mockSessionRole.value = 'admin'
        try {
            await run()
        } finally {
            mockSessionRole.value = 'viewer'
        }
    }

    beforeEach(() => {
        listSpaceContentsMock.mockReset()
        listCollectionsMock.mockReset()
        listProjectsMock.mockReset()
        getServerSpaceMock.mockReset()
        appNavigateMock.mockReset()
        getServerSpaceMock.mockResolvedValue({ id: 'br_id_ge', label: 'br_id_ge', publishedProjectId: 'n2-hub' })
        listCollectionsMock.mockResolvedValue([])
        listProjectsMock.mockResolvedValue([])
    })

    it('leaves a visitor\'s page as it was: no doors, no shelves, no extra request', async () => {
        listSpaceContentsMock.mockResolvedValue(contents)
        const { container } = render(<SpaceContentsPage spaceId="br_id_ge" />)

        await screen.findByRole('link', { name: /Notations #2/ })
        expect(container.querySelector('.sc-row-doors')).toBeNull()
        expect(container.querySelectorAll('.sc-door')).toHaveLength(0)
        expect(container.querySelectorAll('.sc-shelf')).toHaveLength(0)
        expect(container.querySelector('.sc-shelf-note')).toBeNull()
        expect(container.querySelector('.sc-item--doors')).toBeNull()
        expect(container.querySelectorAll('ul.sc-list')).toHaveLength(1)
        expect(listCollectionsMock).not.toHaveBeenCalled()
        expect(listProjectsMock).not.toHaveBeenCalled()
        expect(listSpaceContentsMock).toHaveBeenCalledTimes(1)
        expect(listSpaceContentsMock).toHaveBeenCalledWith('br_id_ge')
    })

    it('gives a member Perform, Studio and Nodes under each scene, the addresses the helper says', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await screen.findByRole('link', { name: /Notations #2/ })
            await stripsDrawn()

            // A scene and a fixed-camera scene both get the three.
            for (const [name, project] of [[/Notations #2/, contents[0]], [/One shot/, contents[2]]]) {
                const item = rowOf(name)
                const strip = item.querySelector('.sc-row-doors')
                const doors = [...strip.querySelectorAll('a.sc-door')]
                expect(doors.map((door) => door.textContent)).toEqual(['Perform', 'Studio', 'Nodes'])
                expect(doors.map((door) => door.getAttribute('href'))).toEqual(doorsOf(project).map((door) => door.href))
                expect(item).toHaveClass('sc-item--doors')
            }
            const perform = rowOf(/Notations #2/).querySelector('a.sc-door').getAttribute('href')
            expect(perform).toContain('from=studio')
            expect(perform).not.toContain('preset=')
        })
    })

    it('puts the strip beside the row link, never inside it, as plain links in tab order', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await screen.findByRole('link', { name: /Notations #2/ })
            await stripsDrawn()

            const item = rowOf(/Notations #2/)
            const strip = item.querySelector('.sc-row-doors')
            expect(strip.closest('a')).toBeNull()
            expect(strip.parentElement).toBe(item)
            expect(item.querySelector('a.sc-row').parentElement).toBe(item)
            expect(strip.getAttribute('role')).toBe('group')
            expect(strip.getAttribute('aria-label')).toBe('Open Notations #2 in')
            expect([...item.querySelectorAll('a')].map((link) => link.textContent.trim().slice(0, 7)))
                .toEqual(['Notatio', 'Perform', 'Studio', 'Nodes'])
            for (const door of strip.querySelectorAll('.sc-door')) {
                expect(door.tagName).toBe('A')
                expect(door.getAttribute('href')).toBeTruthy()
                expect(door.getAttribute('target')).toBeNull()
            }
            // A click on a door the bar opens whole is left to the browser: not prevented, not sent through the app.
            const studio = [...strip.querySelectorAll('.sc-door')].find((door) => door.textContent === 'Studio')
            expect(fireEvent.click(studio)).toBe(true)
            expect(appNavigateMock).not.toHaveBeenCalled()
        })
    })

    it('gives a page (mode code) and the code-space row no strip', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await screen.findByRole('link', { name: /The camp page/ })
            await stripsDrawn()

            const item = rowOf(/The camp page/)
            expect(item.querySelector('.sc-row-doors')).toBeNull()
            expect(item).not.toHaveClass('sc-item--doors')
        })

        await asMember(async () => {
            getServerSpaceMock.mockResolvedValue({ id: 'wcc', label: 'WCC Exhibition', publishedProjectId: 'main' })
            listSpaceContentsMock.mockResolvedValue([
                { id: 'main', slug: null, title: 'Main', mode: 'scene', updatedAt: Date.now() },
                { id: 'arthur', slug: 'arthur', title: 'Arthur', mode: 'scene', updatedAt: Date.now() }
            ])
            render(<SpaceContentsPage spaceId="wcc" />)

            const landing = (await screen.findByRole('link', { name: /Landing page/ })).closest('li')
            await stripsDrawn()
            expect(landing.querySelector('.sc-row-doors')).toBeNull()
            expect(landing).not.toHaveClass('sc-item--doors')
        })
    })

    it('groups a member\'s list under the shelves, in their order, with what is on none last', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue([
                ...contents,
                { id: 'orphan', slug: null, title: 'Orphan', mode: 'scene', updatedAt: Date.now() }
            ])
            listCollectionsMock.mockResolvedValue([
                { id: 'week-one', label: 'Week one' },
                { id: 'week-two', label: 'Week two' },
                { id: 'later', label: 'Later' }
            ])
            listProjectsMock.mockResolvedValue([
                { id: 'n2-hub', collectionId: 'week-two' },
                { id: 'one-shot', collectionId: 'week-one' },
                { id: 'camp', collectionId: null },
                // A shelf that is no longer there: the project is on none.
                { id: 'orphan', collectionId: 'deleted-shelf' }
            ])
            const { container } = render(<SpaceContentsPage spaceId="br_id_ge" />)
            await screen.findByRole('heading', { level: 2, name: 'Week one' })

            const headings = [...container.querySelectorAll('h2.sc-shelf')]
            expect(headings.map((heading) => heading.textContent)).toEqual(['Week one', 'Week two', 'Later', 'Not on a shelf'])
            // A heading says its name and nothing else, and never sits inside a list.
            for (const heading of headings) {
                expect(heading.children).toHaveLength(0)
                expect(heading.closest('ul')).toBeNull()
            }
            const namesUnder = (heading) => [...heading.nextElementSibling.querySelectorAll('a.sc-row .sc-row-name')]
                .map((name) => name.firstChild.textContent)
            expect(namesUnder(headings[0])).toEqual(['One shot'])
            expect(namesUnder(headings[1])).toEqual(['Notations #2'])
            expect(namesUnder(headings[3])).toEqual(['The camp page', 'Orphan'])
            // An empty shelf is kept, as the Studio hub keeps it.
            expect(headings[2].nextElementSibling.tagName).toBe('P')
            expect(headings[2].nextElementSibling).toHaveClass('sc-shelf-empty')
            expect(headings[2].nextElementSibling.textContent).toBe('Nothing on show on this shelf.')
            expect(container.querySelector('.sc-shelf-note')).toBeNull()
            // The shelves come from the same two requests the hub makes.
            expect(listCollectionsMock).toHaveBeenCalledWith('br_id_ge')
            expect(listProjectsMock).toHaveBeenCalledWith('br_id_ge')
        })
    })

    it('shows a member of a space with no shelves one flat list and no line about shelves', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            const { container } = render(<SpaceContentsPage spaceId="br_id_ge" />)
            await screen.findByRole('link', { name: /Notations #2/ })
            await stripsDrawn()

            expect(container.querySelectorAll('.sc-shelf')).toHaveLength(0)
            expect(container.querySelector('.sc-shelf-note')).toBeNull()
            expect(container.querySelectorAll('ul.sc-list')).toHaveLength(1)
            expect(container.querySelector('.sc-row-doors')).not.toBeNull()
        })
    })

    it('keeps the flat list and says once, quietly, that the shelves did not load', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            listCollectionsMock.mockRejectedValue(new Error('The shelves are down.'))
            const { container } = render(<SpaceContentsPage spaceId="br_id_ge" />)
            await screen.findByText('The shelves did not load, so this list is not grouped.')

            const notes = container.querySelectorAll('p.sc-shelf-note')
            expect(notes).toHaveLength(1)
            expect(notes[0].textContent).toBe('The shelves did not load, so this list is not grouped.')
            expect(container.querySelectorAll('.sc-shelf')).toHaveLength(0)
            expect(container.querySelectorAll('ul.sc-list')).toHaveLength(1)
            expect(container.querySelectorAll('a.sc-row')).toHaveLength(contents.length)
            // The page is not blanked: the doors are still there.
            expect(container.querySelector('.sc-row-doors')).not.toBeNull()
        })
    })

    it('does not ask a missing space for its shelves', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockRejectedValue(new Error('Space not found.'))
            render(<SpaceContentsPage spaceId="nowhere" />)

            expect(await screen.findByText('Space not found.')).toBeTruthy()
            expect(listCollectionsMock).not.toHaveBeenCalled()
            expect(listProjectsMock).not.toHaveBeenCalled()
        })
    })

    // The owner asked "where are lights": the list already knows what a project holds, so its row says so.
    it('gives a project with lamps a Light door, and one with a wall a Projection door, as the helper says', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            listProjectsMock.mockResolvedValue([
                { id: 'n2-hub', collectionId: null, layers: { things: 132, nodes: 1, wires: 1, surfaces: 1, lamps: 52, joinedLamps: 52, lightCues: 36 } },
                { id: 'one-shot', collectionId: null, layers: { things: 3 } }
            ])
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await screen.findByRole('link', { name: /Notations #2/ })
            await waitFor(() => expect(rowOf(/Notations #2/).querySelectorAll('a.sc-door')).toHaveLength(5))

            const doorTexts = (name) => [...rowOf(name).querySelectorAll('a.sc-door')].map((door) => door.textContent)
            expect(doorTexts(/Notations #2/)).toEqual(['Perform', 'Studio', 'Nodes', 'Projection', 'Light'])
            const light = [...rowOf(/Notations #2/).querySelectorAll('a.sc-door')].find((door) => door.textContent === 'Light')
            const expected = doorsForListRow(
                { ...contents[0], layers: { things: 132, nodes: 1, wires: 1, surfaces: 1, lamps: 52, joinedLamps: 52, lightCues: 36 } },
                { space: 'br_id_ge', isLocalInstall: false, from: 'studio' }
            ).find((door) => door.key === 'light')
            expect(light.getAttribute('href')).toBe(expected.href)
            // Hosted: the app's own page, whatever the project (pinned, not worked out by the helper).
            expect(light.getAttribute('href')).toBe('/light')
            // A project with things only has the three sure doors.
            expect(doorTexts(/One shot/)).toEqual(['Perform', 'Studio', 'Nodes'])
        })
    })

    it('draws no strip until the member request has settled, and then the three sure doors when it failed', async () => {
        await asMember(async () => {
            let fail
            listSpaceContentsMock.mockResolvedValue(contents)
            listProjectsMock.mockReturnValue(new Promise((resolve, reject) => { fail = reject }))
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await screen.findByRole('link', { name: /Notations #2/ })
            expect(document.querySelector('.sc-door')).toBeNull()

            fail(new Error('down'))
            await stripsDrawn()
            expect([...rowOf(/Notations #2/).querySelectorAll('a.sc-door')].map((door) => door.textContent))
                .toEqual(['Perform', 'Studio', 'Nodes'])
            // This space has no shelf, so nothing is said about shelves: only that the doors may be short.
            expect(document.querySelector('.sc-shelf-note').textContent)
                .toBe('What each project holds did not load, so Projection and Light doors may be missing.')
        })
    })

    it('says both things when the space has shelves and the member list failed', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            listCollectionsMock.mockResolvedValue([{ id: 'week-one', label: 'Week one' }])
            listProjectsMock.mockRejectedValue(new Error('down'))
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await stripsDrawn()

            expect(document.querySelectorAll('.sc-shelf')).toHaveLength(0)
            expect(document.querySelector('.sc-shelf-note').textContent)
                .toBe('The shelves did not load, so this list is not grouped. What each project holds did not load, so Projection and Light doors may be missing.')
        })
    })

    // An answer nobody can read must still settle the page: flat, the three sure doors, and the line.
    it('settles with the three sure doors when a member row cannot be read', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            listProjectsMock.mockResolvedValue([null])
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await stripsDrawn()

            expect([...rowOf(/Notations #2/).querySelectorAll('a.sc-door')].map((door) => door.textContent))
                .toEqual(['Perform', 'Studio', 'Nodes'])
            expect(document.querySelector('.sc-shelf-note').textContent)
                .toBe('The shelves did not load, so this list is not grouped. What each project holds did not load, so Projection and Light doors may be missing.')
        })
    })

    it('says nothing about missing doors when All tools offers them anyway', async () => {
        allToolsOn.value = true
        try {
            await asMember(async () => {
                listSpaceContentsMock.mockResolvedValue(contents)
                listProjectsMock.mockRejectedValue(new Error('down'))
                render(<SpaceContentsPage spaceId="br_id_ge" />)
                await stripsDrawn()

                expect([...rowOf(/Notations #2/).querySelectorAll('a.sc-door')].map((door) => door.textContent))
                    .toEqual(['Perform', 'Studio', 'Nodes', 'Projection', 'Light'])
                expect(document.querySelector('.sc-shelf-note')).toBeNull()
            })
        } finally {
            allToolsOn.value = false
        }
    })

    // A failed shelves request must not throw away the counts: the lamp project keeps its Light door.
    it('keeps the counts, and so the Light door, when only the shelves failed', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            listCollectionsMock.mockRejectedValue(new Error('The shelves are down.'))
            listProjectsMock.mockResolvedValue([{ id: 'n2-hub', collectionId: null, layers: { things: 3, lamps: 2 } }])
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await stripsDrawn()

            expect([...rowOf(/Notations #2/).querySelectorAll('a.sc-door')].map((door) => door.textContent))
                .toEqual(['Perform', 'Studio', 'Nodes', 'Light'])
            expect(document.querySelector('.sc-shelf-note').textContent).toBe('The shelves did not load, so this list is not grouped.')
        })
    })

    it('treats a non-array answer as a failed request, not as data', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            listCollectionsMock.mockResolvedValue({ error: 'nope' })
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await stripsDrawn()

            expect(document.querySelectorAll('.sc-shelf')).toHaveLength(0)
            expect(screen.getByText('The shelves did not load, so this list is not grouped.')).toBeTruthy()
        })
    })

    // The Light door on a hosted install is the app's own page: it goes through the app, as the bar's own link does.
    it('sends the Light door through the app on a hosted install, and leaves a modified click to the browser', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            listProjectsMock.mockResolvedValue([{ id: 'n2-hub', collectionId: null, layers: { things: 3, lamps: 2 } }])
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await waitFor(() => expect(rowOf(/Notations #2/).querySelectorAll('a.sc-door')).toHaveLength(4))

            const light = [...rowOf(/Notations #2/).querySelectorAll('a.sc-door')].find((door) => door.textContent === 'Light')
            expect(light.getAttribute('href')).toBe('/light')
            expect(fireEvent.click(light, { ctrlKey: true })).toBe(true)
            expect(appNavigateMock).not.toHaveBeenCalled()
            expect(fireEvent.click(light)).toBe(false)
            expect(appNavigateMock).toHaveBeenCalledWith('/light')
        })
    })

    it('offers Projection and Light on every scene when All tools is on', async () => {
        allToolsOn.value = true
        try {
            await asMember(async () => {
                listSpaceContentsMock.mockResolvedValue(contents)
                render(<SpaceContentsPage spaceId="br_id_ge" />)
                await stripsDrawn()
                expect([...rowOf(/One shot/).querySelectorAll('a.sc-door')].map((door) => door.textContent))
                    .toEqual(['Perform', 'Studio', 'Nodes', 'Projection', 'Light'])
            })
        } finally {
            allToolsOn.value = false
        }
    })

    it('marks the way in on a member\'s grouped list too', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue(contents)
            listCollectionsMock.mockResolvedValue([{ id: 'week-one', label: 'Week one' }])
            listProjectsMock.mockResolvedValue([{ id: 'n2-hub', collectionId: 'week-one' }])
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await screen.findByRole('heading', { level: 2, name: 'Week one' })
            expect(rowOf(/Notations #2/).querySelector('.sc-row-door').textContent).toBe('the way in')
        })
    })

    // An embed is the flat list as it was: no member data asked, no strips.
    it('asks for nothing more inside an embed, even for a member', async () => {
        window.history.pushState({}, '', '/?embed=1')
        try {
            await asMember(async () => {
                listSpaceContentsMock.mockResolvedValue(contents)
                const { container } = render(<SpaceContentsPage spaceId="br_id_ge" />)
                await screen.findByRole('link', { name: /Notations #2/ })
                await new Promise((resolve) => setTimeout(resolve, 0))
                expect(listCollectionsMock).not.toHaveBeenCalled()
                expect(listProjectsMock).not.toHaveBeenCalled()
                expect(container.querySelector('.sc-row-doors')).toBeNull()
            })
        } finally {
            window.history.pushState({}, '', '/')
        }
    })

    it('asks for nothing more of a space that only hands the visitor on to its door', async () => {
        await asMember(async () => {
            listSpaceContentsMock.mockResolvedValue([contents[0]])
            render(<SpaceContentsPage spaceId="br_id_ge" />)
            await waitFor(() => expect(appNavigateMock).toHaveBeenCalled())
            expect(listCollectionsMock).not.toHaveBeenCalled()
            expect(listProjectsMock).not.toHaveBeenCalled()
        })
    })

    // On a hosted install the session answers late: canEdit goes from false to true after the first render.
    it('asks for the contents once when the session arrives late, and keeps the page on screen', async () => {
        listSpaceContentsMock.mockResolvedValue(contents)
        const { rerender, container } = render(<SpaceContentsPage spaceId="br_id_ge" />)
        await screen.findByRole('link', { name: /Notations #2/ })
        expect(container.querySelector('.sc-door')).toBeNull()
        expect(listProjectsMock).not.toHaveBeenCalled()

        await asMember(async () => {
            rerender(<SpaceContentsPage spaceId="br_id_ge" />)
            // Not sent back to loading: the rows are there in the same tick.
            expect(screen.getByRole('link', { name: /Notations #2/ })).toBeTruthy()
            await stripsDrawn()
        })
        expect(listSpaceContentsMock).toHaveBeenCalledTimes(1)
        expect(getServerSpaceMock).toHaveBeenCalledTimes(1)
        expect(listCollectionsMock).toHaveBeenCalledTimes(1)
        expect(listProjectsMock).toHaveBeenCalledTimes(1)
    })
})
