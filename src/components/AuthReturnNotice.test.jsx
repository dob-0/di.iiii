import React from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AuthReturnNotice from './AuthReturnNotice.jsx'

const getApiSessionMock = vi.hoisted(() => vi.fn())
vi.mock('../services/apiClient.js', () => ({
    getApiSession: (...args) => getApiSessionMock(...args)
}))

describe('AuthReturnNotice', () => {
    afterEach(() => {
        getApiSessionMock.mockReset()
        window.history.replaceState(null, '', '/')
    })

    it('renders nothing without an auth return marker', () => {
        const { container } = render(<AuthReturnNotice />)
        expect(container.firstChild).toBeNull()
    })

    // Regression guard: OAuth returns used to be completely silent — no
    // confirmation on success, and ?auth=error was ignored by the client.
    it('confirms a successful sign-in and strips the marker from the URL', async () => {
        window.history.replaceState(null, '', '/studio?auth=ok')
        getApiSessionMock.mockResolvedValue({ authenticated: true, label: 'Ada', subject: 'u1' })

        render(<AuthReturnNotice />)

        expect(await screen.findByText('Signed in as Ada.')).toBeInTheDocument()
        expect(window.location.search).toBe('')
        expect(window.location.pathname).toBe('/studio')
    })

    it('surfaces a failed sign-in', () => {
        window.history.replaceState(null, '', '/?auth=error')

        render(<AuthReturnNotice />)

        expect(screen.getByText('Sign-in failed — please try again.')).toBeInTheDocument()
        expect(window.location.search).toBe('')
        expect(getApiSessionMock).not.toHaveBeenCalled()
    })

    it('says the sandbox came along when the server marks a kept promotion', async () => {
        window.history.replaceState(null, '', '/?auth=ok&kept=1')
        getApiSessionMock.mockResolvedValue({ authenticated: true, label: 'Ada', subject: 'u1' })

        render(<AuthReturnNotice />)

        expect(await screen.findByText('Signed in as Ada — your sandbox came with you.')).toBeInTheDocument()
        expect(window.location.search).toBe('')
    })

    it('keeps unrelated query params while stripping the marker', async () => {
        window.history.replaceState(null, '', '/main?preview=1&auth=ok')
        getApiSessionMock.mockResolvedValue({ authenticated: true, label: 'Ada', subject: 'u1' })

        render(<AuthReturnNotice />)

        expect(await screen.findByText('Signed in as Ada.')).toBeInTheDocument()
        expect(window.location.search).toBe('?preview=1')
    })
})
