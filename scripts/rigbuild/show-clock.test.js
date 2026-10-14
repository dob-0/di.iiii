import { describe, expect, it } from 'vitest'
import { clockOps, isProductionApi, parseEpoch, tokenKeysFor } from './show-clock.mjs'

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

    // 2026-10-01: the local key went to dev and the clock write came back 401 after the data push had landed.
    it('picks the key that belongs to the server --api names', () => {
        expect(tokenKeysFor('https://dev.diiii.xyz/serverXR')[0]).toBe('LIVE_API_TOKEN')
        expect(tokenKeysFor('https://diiii.xyz/serverXR')).toEqual(['PROD_API_TOKEN'])
        expect(tokenKeysFor('https://di-studio.xyz/serverXR')).toEqual(['PROD_API_TOKEN'])
        expect(tokenKeysFor('https://local.thedi.studio/serverXR')).toEqual(['ADMIN_API_TOKEN', 'API_TOKEN'])
        expect(tokenKeysFor('http://localhost:4000/serverXR')).toEqual(['ADMIN_API_TOKEN', 'API_TOKEN'])
        expect(tokenKeysFor('https://dev.diiii.xyz/serverXR')).not.toContain('API_TOKEN')
    })
})
