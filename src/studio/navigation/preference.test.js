import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    NAVIGATION_STORAGE_KEY, getNavigationPreference, getOrbitSelectionPreference,
    resetNavigationPreferenceMemory, setNavigationPreference, setOrbitSelectionPreference,
} from './preference.js'

beforeEach(() => {
    resetNavigationPreferenceMemory()
    try { window.localStorage.clear() } catch { /* noop */ }
})
afterEach(() => vi.restoreAllMocks())

describe('navigation preference', () => {
    it('defaults to studio', () => {
        expect(getNavigationPreference()).toBe('studio')
        expect(getOrbitSelectionPreference()).toBe(false)
    })
    it('round-trips blender under di.studio.navigation', () => {
        expect(setNavigationPreference('blender')).toBe('blender')
        expect(window.localStorage.getItem(NAVIGATION_STORAGE_KEY)).toBe('blender')
        expect(getNavigationPreference()).toBe('blender')
    })
    it('junk stored value -> studio; junk set -> studio', () => {
        window.localStorage.setItem(NAVIGATION_STORAGE_KEY, 'maya')
        expect(getNavigationPreference()).toBe('studio')
        expect(setNavigationPreference('<script>')).toBe('studio')
    })
    it('storage that throws never throws out', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
        expect(getNavigationPreference()).toBe('studio')
        expect(getOrbitSelectionPreference()).toBe(false)
        expect(() => setNavigationPreference('blender')).not.toThrow()
        expect(() => setOrbitSelectionPreference(true)).not.toThrow()
    })
    it('orbit-selection flag round-trips', () => {
        setOrbitSelectionPreference(true)
        expect(getOrbitSelectionPreference()).toBe(true)
    })
})
