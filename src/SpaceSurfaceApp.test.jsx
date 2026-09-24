import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'

const getServerSpace = vi.fn()

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
    default: function MockPublicProjectViewer({ spaceId, projectId, showProjectSwitcher, showProjectInTitle }) {
        return <div>public-project-viewer:{spaceId}:{projectId}{showProjectSwitcher ? ':switcher' : ''}{showProjectInTitle ? ':title-carries-project' : ''}</div>
    }
}))

vi.mock('./services/serverSpaces.js', () => ({
    supportsServerSpaces: true,
    getServerSpace: (...args) => getServerSpace(...args)
}))

describe('SpaceSurfaceApp', () => {
    afterEach(() => {
        getServerSpace.mockReset()
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

    it('falls back to the legacy editor when no published project is configured', async () => {
        getServerSpace.mockResolvedValue({
            id: 'main',
            label: 'Main Space',
            publishedProjectId: null
        })

        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'main' }} />)

        await waitFor(() => {
            expect(screen.getByText('legacy-app')).toBeInTheDocument()
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
        })
        expect(screen.getByText('legacy-app')).toBeInTheDocument()

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

            await screen.findByText('legacy-app')
            await waitFor(() => expect(document.title).toBe('Dilijan Camp — di.iiii'))
        })

        it('leaves the tab title alone for the platform’s own space', async () => {
            document.title = 'di.iiii — public spaces on the open web'
            getServerSpace.mockResolvedValue({ id: 'main', label: 'Main Space', publishedProjectId: null })

            render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'main' }} />)

            await screen.findByText('legacy-app')
            expect(document.title).toBe('di.iiii — public spaces on the open web')
        })
    })
})
