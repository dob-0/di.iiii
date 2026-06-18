import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RootApp from './RootApp.jsx'

const mockUseAuthSession = vi.fn(() => ({
    requireAuth: false,
    authenticated: true,
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn()
}))

vi.mock('./hooks/useAuthSession.js', () => ({
    default: () => mockUseAuthSession()
}))

vi.mock('./services/serverSpaces.js', () => ({
    supportsServerSpaces: true,
    getServerSpace: (spaceId) => Promise.resolve({ id: spaceId, isPublic: spaceId === 'wcc' })
}))

vi.mock('./components/AuthGate.jsx', () => ({
    default: function MockAuthGate({ children, requiredSpaceId = null }) {
        const { requireAuth, authenticated, spaces } = mockUseAuthSession()
        if (!requireAuth) return children
        if (!authenticated) {
            return <div>Enter your access token to continue.</div>
        }
        if (requiredSpaceId && Array.isArray(spaces) && !spaces.includes(requiredSpaceId)) {
            return <div>Access restricted — your session isn&apos;t scoped to &ldquo;{requiredSpaceId}&rdquo;.</div>
        }
        return children
    }
}))

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

    it('renders the spaces index on /studio', async () => {
        window.history.pushState({}, '', '/studio')
        render(<RootApp />)

        expect(await screen.findByText('studio-app:spaces:')).toBeInTheDocument()
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
        expect(await screen.findByText('space-surface-app:editor:main')).toBeInTheDocument()
    })
})

describe('RootApp public space gating', () => {
    afterEach(() => {
        window.history.pushState({}, '', '/')
        mockUseAuthSession.mockReturnValue({
            requireAuth: false,
            authenticated: true,
            loading: false,
            login: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn()
        })
    })

    it('bypasses the login gate for a space marked isPublic', async () => {
        mockUseAuthSession.mockReturnValue({
            requireAuth: true,
            authenticated: false,
            loading: false,
            login: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn()
        })
        window.history.pushState({}, '', '/wcc/scene')
        render(<RootApp />)

        expect(await screen.findByText('space-surface-app:editor:wcc')).toBeInTheDocument()
        expect(screen.queryByText('Enter your access token to continue.')).not.toBeInTheDocument()
    })

    it('still shows the login gate for a non-public space', async () => {
        mockUseAuthSession.mockReturnValue({
            requireAuth: true,
            authenticated: false,
            loading: false,
            login: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn()
        })
        window.history.pushState({}, '', '/main')
        render(<RootApp />)

        expect(await screen.findByText('Enter your access token to continue.')).toBeInTheDocument()
        expect(screen.queryByText('space-surface-app:editor:main')).not.toBeInTheDocument()
    })

    it('shows an access-restricted message for an authenticated but out-of-scope session', async () => {
        mockUseAuthSession.mockReturnValue({
            requireAuth: true,
            authenticated: true,
            spaces: ['main'],
            loading: false,
            login: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn()
        })
        window.history.pushState({}, '', '/gallery')
        render(<RootApp />)

        expect(await screen.findByText(/Access restricted/)).toBeInTheDocument()
        expect(screen.queryByText('space-surface-app:editor:gallery')).not.toBeInTheDocument()
    })
})
