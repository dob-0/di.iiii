import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuthGate from './AuthGate.jsx'

const mockUseAuthSession = vi.fn()

vi.mock('../hooks/useAuthSession.js', () => ({
    default: () => mockUseAuthSession()
}))

vi.mock('../services/apiClient.js', () => ({
    hasServerApi: true,
    getApiAuthProviders: () => Promise.resolve({ github: false, google: false }),
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
