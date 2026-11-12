// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CUE_KEYS_STORAGE_KEY, getCueKeysOn, resetCueKeysForTest, setCueKeysOn, subscribeCueKeys } from './cueKeysSwitch.js'

beforeEach(() => { window.localStorage.clear(); resetCueKeysForTest() })
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); resetCueKeysForTest() })

describe('the number keys switch', () => {
    it('is ON by default', () => {
        expect(getCueKeysOn()).toBe(true)
    })

    it('OFF is remembered on this device and read back after a reload', () => {
        setCueKeysOn(false)
        expect(window.localStorage.getItem(CUE_KEYS_STORAGE_KEY)).toBe('0')
        resetCueKeysForTest()
        expect(getCueKeysOn()).toBe(false)
        setCueKeysOn(true)
        resetCueKeysForTest()
        expect(getCueKeysOn()).toBe(true)
    })

    it('a read that throws means ON', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        expect(getCueKeysOn()).toBe(true)
    })

    it('a write that throws keeps the value in memory', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
        expect(() => setCueKeysOn(false)).not.toThrow()
        expect(getCueKeysOn()).toBe(false)
    })

    it('tells every subscriber on a change, and stops after unsubscribe', () => {
        const a = vi.fn()
        const off = subscribeCueKeys(a)
        setCueKeysOn(false)
        expect(a).toHaveBeenCalledTimes(1)
        off()
        setCueKeysOn(true)
        expect(a).toHaveBeenCalledTimes(1)
    })
})
