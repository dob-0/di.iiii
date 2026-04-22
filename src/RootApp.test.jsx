import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RootApp from './RootApp.jsx'

vi.mock('./beta/BetaApp.jsx', () => ({
    default: function MockBetaApp({ initialRoute }) {
        return (
            <div>
                beta-app:{initialRoute?.page}:{initialRoute?.spaceId}
            </div>
        )
    }
}))

vi.mock('./SpaceSurfaceApp.jsx', () => ({
    default: function MockSpaceSurfaceApp({ routeState }) {
        return (
            <div>
                space-surface-app:{routeState?.page}:{routeState?.spaceId || 'main'}
            </div>
        )
    }
}))

vi.mock('./studio/StudioApp.jsx', () => ({
    default: function MockStudioApp({ initialRoute }) {
        return (
            <div>
                studio-app:{initialRoute?.page}:{initialRoute?.spaceId}
            </div>
        )
    }
}))

describe('RootApp', () => {
    afterEach(() => {
        window.history.pushState({}, '', '/')
    })

    it('renders the studio hub on /studio as the main-space compatibility route', async () => {
        window.history.pushState({}, '', '/studio')
        render(<RootApp />)

        expect(await screen.findByText('studio-app:hub:main')).toBeInTheDocument()
    })

    it('renders the space-scoped studio editor route on /gallery/studio/projects/:id', async () => {
        window.history.pushState({}, '', '/gallery/studio/projects/test-project')
        render(<RootApp />)

        expect(await screen.findByText('studio-app:project:gallery')).toBeInTheDocument()
    })

    it('keeps beta and legacy routes intact', async () => {
        window.history.pushState({}, '', '/beta')
        const { unmount } = render(<RootApp />)
        expect(await screen.findByText('beta-app:hub:main')).toBeInTheDocument()
        unmount()

        window.history.pushState({}, '', '/gallery/beta/projects/test-project')
        const { unmount: unmountBetaProject } = render(<RootApp />)
        expect(await screen.findByText('beta-app:project:gallery')).toBeInTheDocument()
        unmountBetaProject()

        window.history.pushState({}, '', '/main')
        render(<RootApp />)
        expect(screen.getByText('space-surface-app:editor:main')).toBeInTheDocument()
    })
})
