import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RootApp from './RootApp.jsx'

// The rig tools on a hosted tier (src/rigbuild/rigToolAccess.js, RIG_BUILD.md "Visitors:
// the tools read only"): a visitor on a PUBLIC space gets the page read only, a member
// gets it to edit, a PRIVATE space stays behind the gate.

const mockSession = vi.hoisted(() => ({ value: null }))
vi.mock('./hooks/useAuthSession.js', () => ({ default: () => mockSession.value }))
vi.mock('./services/apiClient.js', async (importOriginal) => ({ ...(await importOriginal()), hasServerApi: true }))

vi.mock('./services/serverSpaces.js', () => ({
    supportsServerSpaces: true,
    getServerConfig: () => Promise.resolve({ local: false }),
    listServerSpaces: () => Promise.resolve([]),
    getServerSpace: (spaceId) => Promise.resolve({ id: spaceId, isPublic: spaceId === 'pub' }),
    resolveVanityProjectLink: () => Promise.resolve(null)
}))

vi.mock('./components/AuthGate.jsx', () => ({
    default: function MockAuthGate({ children, requiredSpaceId = null }) {
        const { requireAuth, authenticated, spaces } = mockSession.value
        if (!requireAuth) return children
        if (!authenticated) return <div>Enter your access token to continue.</div>
        if (requiredSpaceId && Array.isArray(spaces) && !spaces.includes(requiredSpaceId)) {
            return <div>Access restricted — your session isn&apos;t scoped to &ldquo;{requiredSpaceId}&rdquo;.</div>
        }
        return children
    }
}))

const surface = (name) => ({ default: ({ readOnly, crew }) => <div>{name}:{String(Boolean(readOnly ?? crew))}</div> })
vi.mock('./rigbuild/PlotSurface.jsx', () => surface('plot'))
vi.mock('./rigbuild/CardsSurface.jsx', () => surface('cards'))
vi.mock('./rigbuild/EquipmentSurface.jsx', () => surface('equipment'))
vi.mock('./rigbuild/BuildSurface.jsx', () => surface('build-crew'))

const session = (over) => ({ requireAuth: true, authenticated: false, loading: false, spaces: [], login: vi.fn(), logout: vi.fn(), refresh: vi.fn(), ...over })
const visitor = () => { mockSession.value = session({ authenticated: true, type: 'guest', spaces: ['sandbox-1'] }) }
const member = () => { mockSession.value = session({ authenticated: true, type: 'account', spaces: ['pub', 'secret'] }) }

describe('the rig tools, for whoever opens the link', () => {
    afterEach(() => window.history.pushState({}, '', '/'))

    it.each([['plot'], ['cards'], ['equipment']])('a visitor on a public space reads the %s page', async (tool) => {
        visitor()
        window.history.pushState({}, '', `/pub/${tool}/hall`)
        render(<RootApp />)
        expect(await screen.findByText(`${tool}:true`)).toBeInTheDocument()
    })

    it('a visitor who may not build is handed the crew view', async () => {
        visitor()
        window.history.pushState({}, '', '/pub/build/hall')
        render(<RootApp />)
        expect(await screen.findByText('build-crew:true')).toBeInTheDocument()
    })

    it('a signed-out visitor on a public space reads it too, no sign-in card', async () => {
        mockSession.value = session({})
        window.history.pushState({}, '', '/pub/plot/hall')
        render(<RootApp />)
        expect(await screen.findByText('plot:true')).toBeInTheDocument()
        expect(screen.queryByText(/access token/)).toBeNull()
    })

    it.each([['plot'], ['cards'], ['equipment']])('a member edits the %s page', async (tool) => {
        member()
        window.history.pushState({}, '', `/pub/${tool}/hall`)
        render(<RootApp />)
        expect(await screen.findByText(`${tool}:false`)).toBeInTheDocument()
    })

    it('a member builds', async () => {
        member()
        window.history.pushState({}, '', '/pub/build/hall')
        render(<RootApp />)
        expect(await screen.findByText('build-crew:false')).toBeInTheDocument()
    })

    it('a private space stays behind the gate', async () => {
        visitor()
        window.history.pushState({}, '', '/secret/plot/hall')
        render(<RootApp />)
        expect(await screen.findByText(/Access restricted/)).toBeInTheDocument()
        expect(screen.queryByText(/plot:/)).toBeNull()
    })
})
