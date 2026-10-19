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

describe('the standard move\'s settings (speed, turning)', () => {
    it('default auto and place (where you stand); set values stick; junk falls back', async () => {
        const m = await import('./preference.js')
        m.resetNavigationPreferenceMemory()
        try { window.localStorage.removeItem(m.SPEED_STORAGE_KEY); window.localStorage.removeItem(m.TURN_STORAGE_KEY) } catch { /* no storage */ }
        expect(m.getSpeedPreference()).toBe('auto'); expect(m.getTurnPreference()).toBe('place')
        expect(m.setSpeedPreference('2.5')).toBe(2.5); expect(m.getSpeedPreference()).toBe(2.5)
        expect(m.setTurnPreference('place')).toBe('place'); expect(m.getTurnPreference()).toBe('place')
        expect(m.setSpeedPreference('nonsense')).toBe('auto'); expect(m.setTurnPreference('spin')).toBe('place')
    })
})
