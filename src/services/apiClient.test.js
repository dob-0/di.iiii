import { afterEach, describe, expect, it } from 'vitest'
import {
    clearServerUnavailable,
    getServerUnavailableRetryDelay,
    isServerNetworkError,
    isServerTemporarilyUnavailable,
    markServerUnavailable
} from './apiClient.js'

afterEach(() => {
    clearServerUnavailable()
})

describe('server availability cooldown helpers', () => {
    it('tracks temporary server unavailability with a retry delay', () => {
        markServerUnavailable(250)
        expect(isServerTemporarilyUnavailable()).toBe(true)
        expect(getServerUnavailableRetryDelay()).toBeGreaterThan(0)

        clearServerUnavailable()
        expect(isServerTemporarilyUnavailable()).toBe(false)
        expect(getServerUnavailableRetryDelay()).toBe(0)
    })

    it('recognizes browser-style network failures', () => {
        expect(isServerNetworkError(new TypeError('Failed to fetch'))).toBe(true)
        expect(isServerNetworkError(new Error('NetworkError when attempting to fetch resource.'))).toBe(true)
        expect(isServerNetworkError(new Error('Unauthorized'))).toBe(false)
    })
})
