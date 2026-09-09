import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceContentsPage from './SpaceContentsPage.jsx'

const listSpaceContentsMock = vi.fn()
const getServerSpaceMock = vi.fn()
const appNavigateMock = vi.fn()

vi.mock('../project/services/projectsApi.js', () => ({
    listSpaceContents: (...args) => listSpaceContentsMock(...args),
    DEFAULT_PROJECT_SPACE_ID: 'main'
}))

vi.mock('../services/serverSpaces.js', () => ({
    getServerSpace: (...args) => getServerSpaceMock(...args)
}))

vi.mock('../utils/appNavigate.js', () => ({
    appNavigate: (...args) => appNavigateMock(...args),
    setAppNavigate: () => {}
}))

vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => ({ role: 'viewer', spaces: [], openSpaceId: 'open', sandboxSpaceId: null, requireAuth: true })
}))

vi.mock('../hooks/useLocalInstall.js', () => ({
    default: () => ({ resolved: true, isLocal: false })
}))

const contents = [
    { id: 'n2-hub', slug: 'n2-hub', title: 'Notations #2', mode: 'scene', updatedAt: Date.now() },
    { id: 'camp', slug: null, title: 'The camp page', mode: 'code', updatedAt: Date.now() },
    { id: 'one-shot', slug: null, title: 'One shot', mode: 'fixed-camera', updatedAt: Date.now() }
]

describe('a space\'s contents page', () => {
    beforeEach(() => {
        listSpaceContentsMock.mockReset()
        getServerSpaceMock.mockReset()
        appNavigateMock.mockReset()
        getServerSpaceMock.mockResolvedValue({ id: 'br_id_ge', label: 'br_id_ge', publishedProjectId: 'n2-hub' })
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
        expect(await screen.findByText(/Nothing is on show in this space yet/)).toBeTruthy()
    })
})
