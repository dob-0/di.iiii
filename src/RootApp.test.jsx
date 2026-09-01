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

// What the server says about itself. ModeMark asks on every surface, and it
// decides what "/" renders, so tests set it per case.
const mockServerConfig = vi.hoisted(() => ({ value: { local: true } }))

vi.mock('./services/serverSpaces.js', () => ({
    supportsServerSpaces: true,
    getServerConfig: () => Promise.resolve(mockServerConfig.value),
    listServerSpaces: () => Promise.resolve([]),
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

vi.mock('./landing/LandingPage.jsx', () => ({
    default: function MockLandingPage() {
        return <div>landing-page</div>
    }
}))

vi.mock('./landing/LocalHome.jsx', () => ({
    default: function MockLocalHome() {
        return <div>local-home</div>
    }
}))

// `di up` used to open a tour of a hosted product, to somebody who had just
// finished installing it, with their own spaces two clicks away.
describe('what "/" opens', () => {
    afterEach(() => {
        window.history.pushState({}, '', '/')
        mockServerConfig.value = { local: true }
    })

    it('opens your spaces on a local install, not the landing page', async () => {
        window.history.pushState({}, '', '/')
        render(<RootApp />)
        expect(await screen.findByText('local-home')).toBeInTheDocument()
        expect(screen.queryByText('landing-page')).toBeNull()
    })

    // Moved, not deleted.
    it('still shows the tour at /?tour=1', async () => {
        window.history.pushState({}, '', '/?tour=1')
        render(<RootApp />)
        expect(await screen.findByText('landing-page')).toBeInTheDocument()
    })

    // The front door IS the room. `/` used to draw that same space as a
    // decorative backdrop with the name written in HTML on top of it; it now
    // opens the room itself, which carries the name as a thing standing in it.
    it('opens the home room on a hosted server, not a picture of it', async () => {
        mockServerConfig.value = { local: false }
        window.history.pushState({}, '', '/')
        render(<RootApp />)
        expect(await screen.findByText(/space-surface-app:.*:main/)).toBeInTheDocument()
        expect(screen.queryByText('landing-page')).toBeNull()
        expect(screen.queryByText('local-home')).toBeNull()
    })

    // Someone serving other people from their own machine has turned auth ON.
    // They get the ordinary front door, because their visitors are not them.
    it('opens the home room on a local install that requires auth', async () => {
        mockServerConfig.value = { local: true, requireAuth: true }
        window.history.pushState({}, '', '/')
        render(<RootApp />)
        expect(await screen.findByText(/space-surface-app:.*:main/)).toBeInTheDocument()
    })
})

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
        expect(await screen.findByText('raw-app:canvas')).toBeInTheDocument()
        expect(screen.getByText('mock-account-chip')).toBeInTheDocument()
    })

    // A projector link that signs its audience out is not a projector link.
    // /out is the only Raw address meant for people who are not authoring, and
    // it was gated like the editor — so "Copy projector link" handed a show
    // machine a sign-in card. The space viewer next door has had this bypass
    // all along.
    describe('the projector image of a public space', () => {
        // These tests need a session scoped to nothing, and the auth mock is
        // shared file-wide — restore it or every later test inherits it.
        afterEach(() => {
            mockUseAuthSession.mockReturnValue({
                requireAuth: false,
                authenticated: true,
                loading: false,
                login: vi.fn(),
                logout: vi.fn(),
                refresh: vi.fn()
            })
        })

        const scopedOut = () => {
            mockUseAuthSession.mockReturnValue({
                requireAuth: true,
                authenticated: true,
                loading: false,
                spaces: [],
                login: vi.fn(),
                logout: vi.fn(),
                refresh: vi.fn()
            })
        }

        it('opens a public space\'s /out to a session scoped to nothing', async () => {
            scopedOut()
            window.history.pushState({}, '', '/pub/raw/projects/team-1/out')
            render(<RootApp />)
            expect(await screen.findByText('raw-app:out')).toBeInTheDocument()
        })

        it('still gates the EDITOR of that same public space', async () => {
            scopedOut()
            window.history.pushState({}, '', '/pub/raw/projects/team-1')
            render(<RootApp />)
            expect(await screen.findByText(/Access restricted/)).toBeInTheDocument()
        })

        it('still gates /out of a PRIVATE space', async () => {
            scopedOut()
            window.history.pushState({}, '', '/secret/raw/projects/team-1/out')
            render(<RootApp />)
            expect(await screen.findByText(/Access restricted/)).toBeInTheDocument()
        })

        it('still gates a space CANVAS /out, which has no project', async () => {
            // It renders the viewer's own localStorage, so opening it to a
            // stranger would show them their own empty canvas — nothing is
            // gained, and the surface stays an authoring one.
            scopedOut()
            window.history.pushState({}, '', '/pub/raw/out')
            render(<RootApp />)
            expect(await screen.findByText(/Access restricted/)).toBeInTheDocument()
        })
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
