import React from 'react'
import { act, render, screen } from '@testing-library/react'
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

    // Audit 2026-10-21 R1: a failed sign-in was a polite status that took itself
    // away after 6 s (measured on /wiki?auth=error: gone at 7.5 s). A refusal is
    // an alert, and it stays until the person closes it (WCAG 4.1.3, 2.2.1).
    it('keeps a failed sign-in on screen, as an alert, until it is dismissed', () => {
        vi.useFakeTimers()
        try {
            window.history.replaceState(null, '', '/?auth=error')
            render(<AuthReturnNotice />)
            act(() => { vi.advanceTimersByTime(60000) })
            const notice = screen.getByText('Sign-in failed — please try again.')
            expect(notice.getAttribute('role')).toBe('alert')
            act(() => { screen.getByRole('button', { name: 'Dismiss' }).click() })
            expect(screen.queryByText('Sign-in failed — please try again.')).toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })

    it('still lets a success note go by itself', async () => {
        vi.useFakeTimers()
        try {
            window.history.replaceState(null, '', '/?auth=ok')
            getApiSessionMock.mockReturnValue(new Promise(() => {}))
            render(<AuthReturnNotice />)
            expect(screen.getByText('Signed in.')).toBeInTheDocument()
            act(() => { vi.advanceTimersByTime(7000) })
            expect(screen.queryByText('Signed in.')).toBeNull()
        } finally {
            vi.useRealTimers()
        }
    })
})
