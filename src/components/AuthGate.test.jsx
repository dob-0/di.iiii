import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuthGate from './AuthGate.jsx'

const mockUseAuthSession = vi.fn()

vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => mockUseAuthSession()
}))

const providersState = vi.hoisted(() => ({ current: { github: false, google: false } }))

vi.mock('../services/apiClient.js', () => ({
    hasServerApi: true,
    getApiAuthProviders: () => Promise.resolve(providersState.current),
    getOAuthUrl: () => ''
}))

vi.mock('../services/serverSpaces.js', () => ({
    supportsServerSpaces: true,
    getServerSpace: (spaceId) => Promise.resolve({ id: spaceId, isPublic: spaceId === 'pub' })
}))

const mockAppNavigate = vi.fn()

vi.mock('../utils/appNavigate.js', () => ({
    appNavigate: (...args) => mockAppNavigate(...args)
}))

vi.mock('./AccountButton.jsx', () => ({
    default: () => <div>account-button</div>
}))

const scopedElsewhereSession = (spaces) => ({
    requireAuth: true,
    authenticated: true,
    loading: false,
    error: null,
    spaces,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn()
})

describe('AuthGate out-of-scope handling', () => {
    afterEach(() => {
        mockAppNavigate.mockClear()
    })

    it('redirects to the live view when the required space is public', async () => {
        mockUseAuthSession.mockReturnValue(scopedElsewhereSession(['main']))
        render(<AuthGate requiredSpaceId="pub">editor</AuthGate>)

        await waitFor(() => {
            expect(mockAppNavigate).toHaveBeenCalledWith('/pub', { replace: true })
        })
        expect(screen.queryByText(/Access restricted/)).not.toBeInTheDocument()
        expect(screen.queryByText('editor')).not.toBeInTheDocument()
    })

    it('keeps the restricted card when the required space is private', async () => {
        mockUseAuthSession.mockReturnValue(scopedElsewhereSession(['main']))
        render(<AuthGate requiredSpaceId="secret">editor</AuthGate>)

        expect(await screen.findByText(/Access restricted/)).toBeInTheDocument()
        expect(mockAppNavigate).not.toHaveBeenCalled()
    })

    it('renders children untouched when the session is in scope', () => {
        mockUseAuthSession.mockReturnValue(scopedElsewhereSession(['pub']))
        render(<AuthGate requiredSpaceId="pub">editor</AuthGate>)

        expect(screen.getByText('editor')).toBeInTheDocument()
        expect(mockAppNavigate).not.toHaveBeenCalled()
    })
})

const signedOutSession = () => ({
    requireAuth: true,
    authenticated: false,
    loading: false,
    error: null,
    spaces: null,
    login: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn()
})

// Regression guard: the sign-in card used to lead with the machine-oriented
// access-token field while OAuth (the human path) popped in late below an
// "or" divider (UX audit 2026-07-10).
describe('AuthGate sign-in card priority', () => {
    afterEach(() => {
        providersState.current = { github: false, google: false }
    })

    it('leads with OAuth and keeps the token behind a disclosure', async () => {
        providersState.current = { github: true, google: true }
        mockUseAuthSession.mockReturnValue(signedOutSession())
        render(<AuthGate>editor</AuthGate>)

        expect(await screen.findByRole('button', { name: /Continue with GitHub/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument()
        expect(screen.queryByPlaceholderText('Access token')).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Use an access token instead' }))
        expect(screen.getByPlaceholderText('Access token')).toBeInTheDocument()
    })

    it('falls back to the token form when no OAuth provider is enabled', async () => {
        mockUseAuthSession.mockReturnValue(signedOutSession())
        render(<AuthGate>editor</AuthGate>)

        expect(await screen.findByPlaceholderText('Access token')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Continue with/ })).not.toBeInTheDocument()
    })
})

// An invite link lands on this card before it can be redeemed. It used to say
// only "Sign in to continue" — the invitee was never told what they were
// accepting, nor that the grant follows whichever account they pick.
describe('AuthGate invite arrival', () => {
    afterEach(() => {
        window.history.replaceState({}, '', '/')
    })

    it('names the space and points at the collaborator guide', async () => {
        window.history.replaceState({}, '', '/?invite=dii_invite_x.y')
        mockUseAuthSession.mockReturnValue(signedOutSession())
        render(<AuthGate requiredSpaceId="secret">editor</AuthGate>)

        expect(await screen.findByText(/You’ve been invited to “secret”/)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: /What a collaborator can do/ }))
            .toHaveAttribute('href', expect.stringContaining('#joining-a-space'))
    })

    it('says nothing extra when there is no invite in the URL', async () => {
        mockUseAuthSession.mockReturnValue(signedOutSession())
        render(<AuthGate requiredSpaceId="secret">editor</AuthGate>)

        expect(await screen.findByText('Sign in to continue.')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /What a collaborator can do/ })).not.toBeInTheDocument()
    })
})
