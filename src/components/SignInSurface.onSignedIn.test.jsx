import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignInSurface } from './AuthGate.jsx'

// /device embeds the sign-in surface and must be told when a sign-in made ON it
// has finished, so it can show the code form where it stands. /login has nowhere
// of its own to stay, and goes to `/` — that stays exactly as it was.

const mockUseAuthSession = vi.fn()

vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => mockUseAuthSession()
}))

vi.mock('../services/apiClient.js', () => ({
    hasServerApi: true,
    getApiAuthProviders: () => Promise.resolve({ github: false, google: false, password: true }),
    getOAuthUrl: () => ''
}))

vi.mock('../services/serverSpaces.js', () => ({
    supportsServerSpaces: true,
    getServerSpace: () => Promise.reject(Object.assign(new Error('Space not found.'), { status: 404 }))
}))

const mockAppNavigate = vi.fn()

vi.mock('../utils/appNavigate.js', () => ({
    appNavigate: (...args) => mockAppNavigate(...args)
}))

vi.mock('./AccountButton.jsx', () => ({
    default: () => <div>account-button</div>
}))

// The password door, reduced to the one thing this test needs from it: the
// moment a sign-in on this surface succeeds.
vi.mock('./PasswordSignIn.jsx', () => ({
    default: ({ onSignedIn }) => (
        <button type="button" onClick={() => onSignedIn?.({})}>stub-password-sign-in</button>
    )
}))

const session = (overrides = {}) => ({
    requireAuth: true,
    authenticated: false,
    type: null,
    label: null,
    loading: false,
    error: null,
    refresh: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    ...overrides
})

const signedIn = () => session({ authenticated: true, type: 'session', label: 'Taron' })

describe('SignInSurface after a sign-in made on it', () => {
    afterEach(() => {
        mockAppNavigate.mockClear()
        mockUseAuthSession.mockReset()
    })

    it('tells the page that embeds it, and does not leave for /', async () => {
        const onSignedIn = vi.fn()
        mockUseAuthSession.mockReturnValue(session())
        const view = render(<SignInSurface onSignedIn={onSignedIn} />)

        fireEvent.click(await screen.findByText('stub-password-sign-in'))
        mockUseAuthSession.mockReturnValue(signedIn())
        view.rerender(<SignInSurface onSignedIn={onSignedIn} />)

        // rerender runs inside act, so the surface's effects have already run.
        expect(onSignedIn).toHaveBeenCalledTimes(1)
        expect(mockAppNavigate).not.toHaveBeenCalled()
    })

    it('still goes in to / when nothing embeds it (the /login behaviour)', async () => {
        mockUseAuthSession.mockReturnValue(session())
        const view = render(<SignInSurface />)

        fireEvent.click(await screen.findByText('stub-password-sign-in'))
        mockUseAuthSession.mockReturnValue(signedIn())
        view.rerender(<SignInSurface />)

        expect(mockAppNavigate).toHaveBeenCalledWith('/')
    })

    // Arriving signed in is not signing in here: the embedding page is told only
    // about a sign-in that happened on the surface.
    it('says nothing when the person arrives already signed in', async () => {
        const onSignedIn = vi.fn()
        mockUseAuthSession.mockReturnValue(signedIn())
        render(<SignInSurface onSignedIn={onSignedIn} />)

        expect(await screen.findByText(/You are signed in as Taron/)).toBeInTheDocument()
        expect(onSignedIn).not.toHaveBeenCalled()
        expect(mockAppNavigate).not.toHaveBeenCalled()
    })
})
