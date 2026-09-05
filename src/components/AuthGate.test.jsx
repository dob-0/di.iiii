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
    // 'ghost' plays the mistyped id: the server 404s for a space that was
    // never created, and the card must say so instead of talking scope.
    getServerSpace: (spaceId) => (spaceId === 'ghost'
        ? Promise.reject(Object.assign(new Error('Space not found.'), { status: 404 }))
        : Promise.resolve({ id: spaceId, isPublic: spaceId === 'pub' }))
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
    openSpaceId: 'open',
    sandboxSpaceId: 'sandbox-guestfa58',
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

// The restricted card used to be a dead end: raw session ids as prose
// ("Allowed: open, sandbox-guestfa58…") and not a single way onward. The user
// hit it himself by mistyping a space name. It now offers doors — the spaces
// the session CAN use, named, never as ids — plus the sign-in buttons, and a
// mistyped address gets its own honest sentence instead of scope language
// about a space that never existed.
describe('AuthGate restricted card doors', () => {
    afterEach(() => {
        mockAppNavigate.mockClear()
        providersState.current = { github: false, google: false }
    })

    it('never prints raw session space ids', async () => {
        mockUseAuthSession.mockReturnValue(scopedElsewhereSession(['open', 'sandbox-guestfa58']))
        render(<AuthGate requiredSpaceId="secret">editor</AuthGate>)

        await screen.findByText(/Access restricted/)
        expect(screen.queryByText(/sandbox-guestfa58/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Allowed:/)).not.toBeInTheDocument()
    })

    it('offers the open space and the private sandbox as doors', async () => {
        mockUseAuthSession.mockReturnValue(scopedElsewhereSession(['open', 'sandbox-guestfa58']))
        render(<AuthGate requiredSpaceId="secret">editor</AuthGate>)

        fireEvent.click(await screen.findByRole('button', { name: 'Open Space' }))
        expect(mockAppNavigate).toHaveBeenCalledWith('/open')

        fireEvent.click(screen.getByRole('button', { name: 'Your private sandbox' }))
        expect(mockAppNavigate).toHaveBeenCalledWith('/sandbox-guestfa58')
    })

    it('offers the sign-in buttons when OAuth providers are on', async () => {
        providersState.current = { github: true, google: true }
        mockUseAuthSession.mockReturnValue(scopedElsewhereSession(['open']))
        render(<AuthGate requiredSpaceId="secret">editor</AuthGate>)

        expect(await screen.findByRole('button', { name: /Continue with GitHub/ })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /Continue with Google/ })).toBeInTheDocument()
    })

    it('says nothing lives at a mistyped address instead of talking scope', async () => {
        mockUseAuthSession.mockReturnValue(scopedElsewhereSession(['open', 'sandbox-guestfa58']))
        render(<AuthGate requiredSpaceId="ghost">editor</AuthGate>)

        expect(await screen.findByText(/Nothing lives at/)).toBeInTheDocument()
        expect(screen.queryByText(/Access restricted/)).not.toBeInTheDocument()
        // the same doors are still on the card
        expect(screen.getByRole('button', { name: 'Open Space' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Your private sandbox' })).toBeInTheDocument()
    })
})

// On a local install (`di up`) the server reports requireAuth: false, and
// AuthGate must let everything through — the restricted card is unreachable
// no matter what space the URL names. Both fixtures used to hardcode
// requireAuth: true, so this short-circuit was never asserted.
describe('AuthGate on a local install (requireAuth off)', () => {
    it('renders children for any space and never shows a card', () => {
        mockUseAuthSession.mockReturnValue({
            requireAuth: false,
            local: true,
            authenticated: false,
            loading: false,
            error: null,
            spaces: null,
            login: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn()
        })
        render(<AuthGate requiredSpaceId="anything-at-all">editor</AuthGate>)

        expect(screen.getByText('editor')).toBeInTheDocument()
        expect(screen.queryByText(/Access restricted/)).not.toBeInTheDocument()
        expect(screen.queryByText(/Sign in/)).not.toBeInTheDocument()
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

// Sign in with Telegram, the client half. Unlike GitHub and Google this is not
// an OAuth hop: the bot mints the single-use link, so the button is a plain
// link to the bot and the server has to name the bot for it to exist at all.
describe('AuthGate Telegram sign-in', () => {
    afterEach(() => {
        providersState.current = { github: false, google: false }
    })

    it('offers Continue with Telegram, pointed at the bot with the login payload', async () => {
        providersState.current = { github: true, google: true, telegram: true, telegramBot: 'diiii111bot' }
        mockUseAuthSession.mockReturnValue(signedOutSession())
        render(<AuthGate>editor</AuthGate>)

        const button = await screen.findByRole('link', { name: /Continue with Telegram/ })
        expect(button).toHaveAttribute('href', 'https://t.me/diiii111bot?start=login')
    })

    it('leaves the button out when the server says telegram is off', async () => {
        providersState.current = { github: true, google: true, telegram: false }
        mockUseAuthSession.mockReturnValue(signedOutSession())
        render(<AuthGate>editor</AuthGate>)

        expect(await screen.findByRole('button', { name: /Continue with GitHub/ })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Continue with Telegram/ })).not.toBeInTheDocument()
    })

    // /api/auth/providers reports telegram without telegramBot when
    // TELEGRAM_BOT_USERNAME is unset. There is no address to send anyone to,
    // so a button here would be a dead end.
    it('leaves the button out when the bot has no username to open', async () => {
        providersState.current = { github: true, google: false, telegram: true }
        mockUseAuthSession.mockReturnValue(signedOutSession())
        render(<AuthGate>editor</AuthGate>)

        expect(await screen.findByRole('button', { name: /Continue with GitHub/ })).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: /Continue with Telegram/ })).not.toBeInTheDocument()
    })
})
