import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import useAuthSession, { announceSessionChanged } from './useAuthSession.js'
import { getApiSession } from '../services/apiClient.js'

vi.mock('../services/apiClient.js', () => ({
    hasServerApi: true,
    getApiSession: vi.fn(),
    loginApiSession: vi.fn(),
    logoutApiSession: vi.fn()
}))

beforeEach(() => {
    vi.clearAllMocks()
})

describe('useAuthSession', () => {
    // A gate mounted before a scope-granting write (opening a file, making a
    // space) kept the old scope and refused the space just made.
    it('asks the server again when a write announces the session changed', async () => {
        getApiSession.mockResolvedValueOnce({ requireAuth: true, authenticated: true, type: 'session', spaces: [] })
        const { result } = renderHook(() => useAuthSession())
        await waitFor(() => expect(result.current.loading).toBe(false))
        expect(result.current.spaces).toEqual([])

        getApiSession.mockResolvedValueOnce({ requireAuth: true, authenticated: true, type: 'session', spaces: ['brought-from-home'] })
        announceSessionChanged()
        await waitFor(() => expect(result.current.spaces).toEqual(['brought-from-home']))
    })

    it('loads the session on mount', async () => {
        getApiSession.mockResolvedValue({ requireAuth: true, authenticated: true, type: 'guest', role: 'editor' })
        const { result } = renderHook(() => useAuthSession())
        expect(result.current.loading).toBe(true)
        await waitFor(() => expect(result.current.loading).toBe(false))
        expect(result.current.authenticated).toBe(true)
        expect(result.current.type).toBe('guest')
    })

    // Regression guard: an in-flight session fetch used to outlive the
    // component and call setState after teardown — a CI-only timing race that
    // surfaced as "ReferenceError: window is not defined" inside react-dom
    // (see docs/ai/known-fixes.md). The unmount must abort the fetch and the
    // settled promise must not update state afterwards.
    it('aborts the in-flight session fetch on unmount and drops late updates', async () => {
        let capturedSignal = null
        getApiSession.mockImplementation(({ signal }) => {
            capturedSignal = signal
            return new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
            })
        })

        const { unmount } = renderHook(() => useAuthSession())
        expect(capturedSignal).not.toBeNull()
        expect(capturedSignal.aborted).toBe(false)

        unmount()
        expect(capturedSignal.aborted).toBe(true)

        // Let the rejected fetch settle — must not throw or warn.
        await new Promise((resolve) => setTimeout(resolve, 0))
    })
})
