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

const mockSpacePublicOverrides = {}
const mockVanityResolutions = {}

vi.mock('./services/serverSpaces.js', () => ({
    supportsServerSpaces: true,
    getServerSpace: (spaceId) => Promise.resolve({
        id: spaceId,
        isPublic: spaceId === 'pub' || Boolean(mockSpacePublicOverrides[spaceId])
    }),
    resolveVanityProjectLink: (spaceSegment, projectSegment) =>
        Promise.resolve(mockVanityResolutions[`${spaceSegment}/${projectSegment}`] || null)
}))

vi.mock('./components/AuthGate.jsx', () => ({
    default: function MockAuthGate({ children, requiredSpaceId = null, showAccountButton = true }) {
        const { requireAuth, authenticated, spaces } = mockUseAuthSession()
        const chip = showAccountButton ? <div>mock-account-chip</div> : null
        if (!requireAuth) return <>{chip}{children}</>
        if (!authenticated) {
            return <div>Enter your access token to continue.</div>
        }
        if (requiredSpaceId && Array.isArray(spaces) && !spaces.includes(requiredSpaceId)) {
            return <div>Access restricted — your session isn&apos;t scoped to &ldquo;{requiredSpaceId}&rdquo;.</div>
        }
        return children
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

vi.mock('./raw/RawApp.jsx', () => ({
    default: function MockRawApp({ initialRoute }) {
        return <div>raw-app:{initialRoute.page}</div>
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

vi.mock('./wcc/WccExperience.jsx', () => ({
    default: function MockWccExperience({ initialMode }) {
        return <div>wcc-experience:{initialMode}</div>
    }
}))

vi.mock('./algoVrithm/AlgoVrithmExperience.jsx', () => ({
    default: function MockAlgoVrithmExperience() {
        return <div>algovrithm-experience</div>
    }
}))

vi.mock('./algoVrithm/landing/AlgoVrithmLanding.jsx', () => ({
    default: function MockAlgoVrithmLanding() {
        return <div>algovrithm-landing</div>
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

    it('routes /wcc and /wcc/scene to the WCC experience', async () => {
        window.history.pushState({}, '', '/wcc')
        const { unmount } = render(<RootApp />)
        expect(await screen.findByText('wcc-experience:landing')).toBeInTheDocument()
        unmount()

        window.history.pushState({}, '', '/wcc/scene')
        render(<RootApp />)
        expect(await screen.findByText('wcc-experience:scene')).toBeInTheDocument()
    })

    it('routes /algovrithm to the landing page and /algovrithm/scene to the piece', async () => {
        // The split is load-bearing: entering costs three.js and a strobing
        // piece, so the bare URL must never mount the experience.
        window.history.pushState({}, '', '/algovrithm')
        const { unmount } = render(<RootApp />)
        expect(await screen.findByText('algovrithm-landing')).toBeInTheDocument()
        expect(screen.queryByText('algovrithm-experience')).not.toBeInTheDocument()
        unmount()

        window.history.pushState({}, '', '/algovrithm/scene')
        render(<RootApp />)
        expect(await screen.findByText('algovrithm-experience')).toBeInTheDocument()
    })

    it('keeps legacy routes intact, and retired Beta URLs fall through like any unclaimed space', async () => {
        // Beta was retired 2026-08-06 (absorbed into Raw) — 'beta' stays a
        // reserved segment (see RESERVED_APP_SEGMENTS) so it can never collide
        // with a real space slug, but no lane claims it anymore. A visitor on
        // an old /beta link lands on the same unclaimed-space path as any
        // other nonexistent space id, not a broken/blank screen.
        window.history.pushState({}, '', '/beta')
        const { unmount } = render(<RootApp />)
        expect(await screen.findByText('space-surface-app:editor:beta')).toBeInTheDocument()
        unmount()

        window.history.pushState({}, '', '/main')
        render(<RootApp />)
        expect(await screen.findByText('space-surface-app:editor:main')).toBeInTheDocument()
    })
})

// docs/architecture/SPEC_space_urls_and_portability.md — the bare
// /{space}/{project} public link shape.
describe('RootApp /out chrome', () => {
    afterEach(() => {
        window.history.pushState({}, '', '/')
    })

    // The projector image: the gate stays, the floating account chip must not
    // hang over the show (plan PR 1.2).
    it('renders no account chip over the /out route', async () => {
        window.history.pushState({}, '', '/gallery/raw/out')
        render(<RootApp />)
        expect(await screen.findByText('raw-app:out')).toBeInTheDocument()
        expect(screen.queryByText('mock-account-chip')).toBeNull()
    })

    it('keeps the account chip on the ordinary editor route', async () => {
        window.history.pushState({}, '', '/gallery/raw')
        render(<RootApp />)
        expect(await screen.findByText('raw-app:hub')).toBeInTheDocument()
        expect(screen.getByText('mock-account-chip')).toBeInTheDocument()
    })
})

describe('RootApp vanity project links', () => {
    afterEach(() => {
        window.history.pushState({}, '', '/')
        for (const key of Object.keys(mockVanityResolutions)) delete mockVanityResolutions[key]
    })

    it('resolves a real slug pair to the REAL ids, not the raw URL segments', async () => {
        mockVanityResolutions['wcc/artistplace'] = {
            space: { id: 'wcc-space-real-id', isPublic: true },
            project: { id: 'artistplace-project-real-id' }
        }
        window.history.pushState({}, '', '/wcc/artistplace')
        render(<RootApp />)

        expect(await screen.findByText('space-surface-app:editor:wcc-space-real-id')).toBeInTheDocument()
    })

    it('falls through to a plain space route when the second segment is not a real project slug', async () => {
        // No entry in mockVanityResolutions for 'somespace/randomtext' — the
        // hook resolves to null (mocked 404), same as production.
        window.history.pushState({}, '', '/somespace/randomtext')
        render(<RootApp />)

        expect(await screen.findByText('space-surface-app:editor:somespace')).toBeInTheDocument()
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
        delete mockSpacePublicOverrides.wcc
    })

    it('gates /wcc behind login when the wcc space is not marked public, like any other space', async () => {
        mockUseAuthSession.mockReturnValue({
            requireAuth: true,
            authenticated: false,
            loading: false,
            login: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn()
        })
        window.history.pushState({}, '', '/wcc')
        render(<RootApp />)

        expect(await screen.findByText('Enter your access token to continue.')).toBeInTheDocument()
        expect(screen.queryByText('wcc-experience:landing')).not.toBeInTheDocument()
    })

    it('lets an unauthenticated visitor into /wcc once the space is marked public', async () => {
        mockSpacePublicOverrides.wcc = true
        mockUseAuthSession.mockReturnValue({
            requireAuth: true,
            authenticated: false,
            loading: false,
            login: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn()
        })
        window.history.pushState({}, '', '/wcc')
        render(<RootApp />)

        expect(await screen.findByText('wcc-experience:landing')).toBeInTheDocument()
        expect(screen.queryByText('Enter your access token to continue.')).not.toBeInTheDocument()
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
        window.history.pushState({}, '', '/pub')
        render(<RootApp />)

        expect(await screen.findByText('space-surface-app:editor:pub')).toBeInTheDocument()
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
