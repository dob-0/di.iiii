import { describe, it, expect, beforeEach } from 'vitest'
import { markArriveWalking, consumeArriveWalking } from './arriveWalking.js'

describe('arriveWalking', () => {
    beforeEach(() => window.sessionStorage.clear())

    it('is false when never marked', () => {
        expect(consumeArriveWalking()).toBe(false)
    })

    it('is true exactly once after a mark', () => {
        markArriveWalking()
        expect(consumeArriveWalking()).toBe(true)
        expect(consumeArriveWalking()).toBe(false)
    })
})
