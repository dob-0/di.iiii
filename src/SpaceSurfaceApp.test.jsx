import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SpaceSurfaceApp from './SpaceSurfaceApp.jsx'

const getServerSpace = vi.fn()

vi.mock('./App.jsx', () => ({
    default: function MockApp() {
        return <div>legacy-app</div>
    }
}))

vi.mock('./beta/BlankNodeWorkspaceApp.jsx', () => ({
    default: function MockBlankNodeWorkspaceApp({ spaceId }) {
        return <div>blank-node-workspace:{spaceId || 'main'}</div>
    }
}))

vi.mock('./project/components/PublicProjectViewer.jsx', () => ({
    default: function MockPublicProjectViewer({ spaceId, projectId }) {
        return <div>public-project-viewer:{spaceId}:{projectId}</div>
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

    it('opens the blank node workspace on the bare root route', () => {
        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: null }} />)

        expect(screen.getByText('blank-node-workspace:main')).toBeInTheDocument()
        expect(getServerSpace).not.toHaveBeenCalled()
    })

    it('opens the blank node workspace when no published project is configured', async () => {
        getServerSpace.mockResolvedValue({
            id: 'main',
            label: 'Main Space',
            publishedProjectId: null
        })

        render(<SpaceSurfaceApp routeState={{ page: 'editor', spaceId: 'main' }} />)

        await waitFor(() => {
            expect(screen.getByText('blank-node-workspace:main')).toBeInTheDocument()
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
        expect(screen.getByText('blank-node-workspace:main')).toBeInTheDocument()

        await act(async () => {
            await vi.advanceTimersByTimeAsync(2100)
            await Promise.resolve()
        })

        expect(screen.getByText('public-project-viewer:main:live-project')).toBeInTheDocument()
    })

    it('keeps preferences routed through the legacy app shell', () => {
        render(<SpaceSurfaceApp routeState={{ page: 'preferences', spaceId: 'main' }} />)

        expect(screen.getByText('legacy-app')).toBeInTheDocument()
        expect(getServerSpace).not.toHaveBeenCalled()
    })
})
