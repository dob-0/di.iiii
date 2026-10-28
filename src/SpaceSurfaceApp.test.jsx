import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'

const getServerSpace = vi.fn()
const listSpaceContents = vi.fn()

vi.mock('./project/services/projectsApi.js', () => ({
    listSpaceContents: (...args) => listSpaceContents(...args)
}))

vi.mock('./components/EmptySpaceView.jsx', () => ({
    default: function MockEmptySpaceView({ spaceId }) {
        return <div>empty-space-view:{spaceId}</div>
    }
}))

vi.mock('./pages/SpaceContentsPage.jsx', () => ({
    default: function MockSpaceContentsPage({ spaceId }) {
        return <div>space-contents-page:{spaceId}</div>
    }
}))

vi.mock('./App.jsx', () => ({
    default: function MockApp() {
        return <div>legacy-app</div>
    }
}))

vi.mock('./raw/BlankNodeWorkspaceApp.jsx', () => ({
    default: function MockBlankNodeWorkspaceApp({ spaceId }) {
        return <div>blank-node-workspace:{spaceId || 'main'}</div>
    }
}))

vi.mock('./project/components/PublicProjectViewer.jsx', () => ({
    default: function MockPublicProjectViewer({ spaceId, projectId, spaceLabel, spaceAddress, showProjectSwitcher, showProjectInTitle }) {
        // the name and the address are what the viewer's bar and tab are built from
        return <div data-space-label={spaceLabel} data-space-address={spaceAddress}>public-project-viewer:{spaceId}:{projectId}{showProjectSwitcher ? ':switcher' : ''}{showProjectInTitle ? ':title-carries-project' : ''}</div>
    }
}))

vi.mock('./services/serverSpaces.js', () => ({
    supportsServerSpaces: true,
    getServerSpace: (...args) => getServerSpace(...args)
}))

describe('SpaceSurfaceApp', () => {
    beforeEach(() => {
        listSpaceContents.mockResolvedValue([])
    })

    afterEach(() => {
        getServerSpace.mockReset()
        listSpaceContents.mockReset()
        listSpaceContents.mockResolvedValue([])
        vi.useRealTimers()
    })

    it('renders the public viewer when a space has a published project', async () => {
        getServerSpace.mockResolvedValue({
            id: 'main',
            label: 'Main Space',
            publishedProjectId: 'live-project'
        })

        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'main' }} />)

        expect(await screen.findByText('public-project-viewer:main:live-project')).toBeInTheDocument()
    })

    it('renders the public viewer for a direct project link, ignoring the published pointer', async () => {
        getServerSpace.mockResolvedValue({
            id: 'main',
            label: 'Main Space',
            publishedProjectId: 'live-project'
        })

        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'main', projectId: 'draft-project' }} />)

        expect(await screen.findByText('public-project-viewer:main:draft-project:title-carries-project')).toBeInTheDocument()
    })

    // Owner call 2026-08-07: the floating project switcher clashed with
    // published page designs — every public face stays chrome-free.
    it('keeps direct project links chrome-free (no floating project switcher)', async () => {
        getServerSpace.mockResolvedValue({
            id: 'main',
            label: 'Main Space',
            publishedProjectId: 'live-project'
        })

        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'main', projectId: 'draft-project' }} />)

        expect(await screen.findByText('public-project-viewer:main:draft-project:title-carries-project')).toBeInTheDocument()
        expect(screen.queryByText(/:switcher/)).not.toBeInTheDocument()
    })

    it('renders a direct project link even if space metadata fails to load', async () => {
        getServerSpace.mockRejectedValue(new Error('network down'))

        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'main', projectId: 'draft-project' }} />)

        expect(await screen.findByText('public-project-viewer:main:draft-project:title-carries-project')).toBeInTheDocument()
    })

    it('opens the blank node workspace on the bare root route', async () => {
        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: null }} />)

        expect(await screen.findByText('blank-node-workspace:main')).toBeInTheDocument()
        expect(getServerSpace).not.toHaveBeenCalled()
    })

    describe('a space with no front door opens what it holds, never the 3D editor', () => {
        const noDoor = { id: 'cinema-house', label: 'Cinema House', publishedProjectId: null }

        it('opens its only project', async () => {
            getServerSpace.mockResolvedValue(noDoor)
            listSpaceContents.mockResolvedValue([{ id: 'only' }])
            render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'cinema-house' }} />)
            expect(await screen.findByText(/public-project-viewer:cinema-house:only/)).toBeInTheDocument()
            expect(screen.queryByText('legacy-app')).toBeNull()
        })

        it('lists its projects when it holds several', async () => {
            getServerSpace.mockResolvedValue(noDoor)
            listSpaceContents.mockResolvedValue([{ id: 'a' }, { id: 'b' }])
            render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'cinema-house' }} />)
            expect(await screen.findByText('space-contents-page:cinema-house')).toBeInTheDocument()
        })

        it('shows the plain empty-space view when it holds no project', async () => {
            getServerSpace.mockResolvedValue(noDoor)
            listSpaceContents.mockResolvedValue([])
            render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'cinema-house' }} />)
            expect(await screen.findByText('empty-space-view:cinema-house')).toBeInTheDocument()
            expect(screen.queryByText('legacy-app')).toBeNull()
        })
    })

    it('switches to the public viewer when the live project changes without a manual refresh', async () => {
        vi.useFakeTimers()
        getServerSpace
            .mockResolvedValueOnce({
                id: 'main',
                label: 'Main Space',
                publishedProjectId: null
            })
            .mockResolvedValue({
                id: 'main',
                label: 'Main Space',
                publishedProjectId: 'live-project'
            })

        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'main' }} />)

        await act(async () => {
            await Promise.resolve()
            await Promise.resolve()
            await Promise.resolve()
        })
        expect(screen.getByText(/empty-space-view/)).toBeInTheDocument()

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2100)
            await Promise.resolve()
        })

        expect(screen.getByText('public-project-viewer:main:live-project')).toBeInTheDocument()
    })

    it('keeps the legacy editor available if space metadata fails to load', async () => {
        getServerSpace.mockRejectedValue(new Error('network down'))

        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'main' }} />)

        await waitFor(() => {
            expect(screen.getByText('legacy-app')).toBeInTheDocument()
        })
    })

    it('keeps preferences routed through the legacy app shell', async () => {
        render(<SpaceSurfaceApp routeState={{ page: 'preferences', spaceId: 'main' }} />)

        expect(await screen.findByText('legacy-app')).toBeInTheDocument()
        expect(getServerSpace).not.toHaveBeenCalled()
    })

    // /{space}/p/{project} names the project explicitly — the naming rule's
    // "inside a project" case — while the bare-space branch above does not:
    // that page carries a project only because it happens to be published,
    // and the tab must still say the SPACE's name (see PublicProjectViewer's
    // own title tests for the actual text this flag produces).
    it('tells the viewer the URL itself named the project only on the direct-link route', async () => {
        getServerSpace.mockResolvedValue({ id: 'wcc', label: 'WCC Exhibition', publishedProjectId: 'live-project' })

        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'wcc', projectId: 'mery-petrosyan' }} />)
        expect(await screen.findByText(/:title-carries-project/)).toBeInTheDocument()

        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'wcc' }} />)
        expect(await screen.findByText('public-project-viewer:wcc:live-project')).toBeInTheDocument()
    })

    // Naming rule (docs/ai/vocabulary.md): a space's own name is what a
    // visitor sees for it — the bare editor/legacy-app surface included.
    // 'main' is excluded because it IS the platform (see PublicProjectViewer's
    // own title tests for that case).
    describe('document title, the bare space surface', () => {
        afterEach(() => {
            document.title = 'di.iiii — public spaces on the open web'
        })

        it('names a non-platform space once it is ready', async () => {
            document.title = 'di.iiii — public spaces on the open web'
            getServerSpace.mockResolvedValue({ id: 'dilijan', label: 'Dilijan Camp', publishedProjectId: null })

            render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'dilijan' }} />)

            await screen.findByText(/empty-space-view/)
            await waitFor(() => expect(document.title).toBe('Dilijan Camp — di.iiii'))
        })

        it('leaves the tab title alone for the platform’s own space', async () => {
            document.title = 'di.iiii — public spaces on the open web'
            getServerSpace.mockResolvedValue({ id: 'main', label: 'Main Space', publishedProjectId: null })

            render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'main' }} />)

            await screen.findByText(/empty-space-view/)
            expect(document.title).toBe('di.iiii — public spaces on the open web')
        })

        // One name per space: the same space, typed as its address. The tab read "di.iiii — di.iiii" because the skip
        // compared the typed word with 'main' instead of asking the space which space it is.
        it('leaves the tab title alone for the platform\'s own space, reached by its address too', async () => {
            document.title = 'di.iiii — public spaces on the open web'
            getServerSpace.mockResolvedValue({ id: 'main', slug: 'di-iiii', label: 'Home', publishedProjectId: null })

            render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'di-iiii' }} />)

            await screen.findByText(/empty-space-view/)
            expect(document.title).toBe('di.iiii — public spaces on the open web')
        })

        it('names a space that has no name by its address, not by the id it was typed as', async () => {
            document.title = 'di.iiii — public spaces on the open web'
            getServerSpace.mockResolvedValue({ id: 'queerlab', slug: 'queer-lab', label: '', publishedProjectId: null })

            render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'queerlab' }} />)

            await screen.findByText(/empty-space-view/)
            await waitFor(() => expect(document.title).toBe('queer-lab — di.iiii'))
        })
    })

    // One name per space (owner, 2026-09-14): the viewer draws the bar and the tab from what it is handed here, so the
    // same space must hand it the same name and the same address whichever address was typed.
    describe('what the viewer is told about the space', () => {
        const main = { id: 'main', slug: 'di-iiii', label: 'di.iiii', publishedProjectId: 'main-dii-project' }

        it('is the space\'s name and its address, by its id, by its address, and on a project link of either', async () => {
            getServerSpace.mockResolvedValue(main)
            for (const routeState of [
                { page: 'editor', spaceId: 'main' },
                { page: 'editor', spaceId: 'di-iiii' },
                { page: 'editor', spaceId: 'main', projectId: 'landing' },
                { page: 'editor', spaceId: 'di-iiii', projectId: 'landing' }
            ]) {
                const { unmount } = render(<SpaceSurfaceApp routeState={routeState} />)
                const viewer = await screen.findByText(/^public-project-viewer:/)
                expect(viewer, JSON.stringify(routeState)).toHaveAttribute('data-space-label', 'di.iiii')
                expect(viewer, JSON.stringify(routeState)).toHaveAttribute('data-space-address', 'di-iiii')
                unmount()
            }
        })

        it('is the address as the name, for a space that has no name — never the id it was typed as', async () => {
            getServerSpace.mockResolvedValue({ id: 'queerlab', slug: 'queer-lab', label: '', publishedProjectId: 'p' })

            render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'queerlab' }} />)

            const viewer = await screen.findByText(/^public-project-viewer:/)
            expect(viewer).toHaveAttribute('data-space-label', 'queer-lab')
            expect(viewer).toHaveAttribute('data-space-address', 'queer-lab')
        })

        it('is the id, as name and address, when the space could not be read', async () => {
            getServerSpace.mockRejectedValue(new Error('network down'))

            render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'queerlab', projectId: 'p' }} />)

            const viewer = await screen.findByText(/^public-project-viewer:/)
            expect(viewer).toHaveAttribute('data-space-label', 'queerlab')
            expect(viewer).toHaveAttribute('data-space-address', 'queerlab')
        })
    })
})
