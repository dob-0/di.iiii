import { describe, expect, it } from 'vitest'
import { clockOps, isProductionApi, parseEpoch } from './show-clock.mjs'

describe('show-clock.mjs', () => {
    it('reads now, an ISO time or ms', () => {
        expect(parseEpoch('now', 5)).toBe(5)
        expect(parseEpoch(undefined, 5)).toBe(5)
        expect(parseEpoch('2026-09-28T20:00:00Z', 5)).toBe(Date.UTC(2026, 8, 28, 20))
        expect(parseEpoch('1790000000000', 5)).toBe(1790000000000)
        expect(() => parseEpoch('tomorrow-ish', 5)).toThrow(/not a time/)
    })
    it('writes one setMappingState op; off clears the epoch', () => {
        expect(clockOps({ epoch: 7 })).toEqual([{ type: 'setMappingState', payload: { patch: { showEpoch: 7, loop: true } } }])
        expect(clockOps({ off: true })).toEqual([{ type: 'setMappingState', payload: { patch: { showEpoch: null } } }])
    })
    it('refuses production hosts, never the dev tier', () => {
        expect(isProductionApi('https://diiii.xyz/serverXR')).toBe(true)
        expect(isProductionApi('https://di-studio.xyz/serverXR')).toBe(true)
        expect(isProductionApi('https://dev.diiii.xyz/serverXR')).toBe(false)
        expect(isProductionApi('https://local.thedi.studio/serverXR')).toBe(false)
    })
})
