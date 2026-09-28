import { afterEach, describe, expect, it } from 'vitest'
import {
    LOOK_DEFAULTS,
    LOOK_STORAGE_KEY,
    __resetLookSettingsCacheForTests,
    getHeadBob,
    getLookFov,
    getLookRuntime,
    getLookSettings,
    loadLookSettings,
    lookFeelScale,
    sanitizeLookSettings,
    setLookSettings,
    subscribeLookSettings
} from './lookSettings.js'

const memoryStorage = () => {
    const m = new Map()
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}
const throwingStorage = {
    getItem: () => { throw new Error('SecurityError') },
    setItem: () => { throw new Error('QuotaExceededError') }
}

afterEach(() => {
    try { window.localStorage.removeItem(LOOK_STORAGE_KEY) } catch { /* none */ }
    __resetLookSettingsCacheForTests()
})

describe('sanitizeLookSettings', () => {
    it('fills defaults from nothing', () => {
        expect(sanitizeLookSettings(null)).toEqual({ ...LOOK_DEFAULTS })
    })
    it('rejects unknown games, clamps numbers, keeps booleans strict', () => {
        const s = sanitizeLookSettings({ game: 'quake99', sens: -3, dpi: 999999, fov: 5, invertY: 'yes', headBob: false })
        expect(s.game).toBe(LOOK_DEFAULTS.game)
        expect(s.sens).toBe(0.001)
        expect(s.dpi).toBe(32000)
        expect(s.fov).toBe(40)
        expect(s.invertY).toBe(false)
        expect(s.headBob).toBe(false)
    })
    it('accepts numeric strings from inputs', () => {
        expect(sanitizeLookSettings({ sens: '2.5', dpi: '1600' })).toMatchObject({ sens: 2.5, dpi: 1600 })
    })
})

describe('storage', () => {
    it('round-trips through storage', () => {
        const st = memoryStorage()
        st.setItem(LOOK_STORAGE_KEY, JSON.stringify({ game: 'valorant', sens: 0.4, dpi: 1600 }))
        expect(loadLookSettings(st)).toMatchObject({ game: 'valorant', sens: 0.4, dpi: 1600 })
    })
    it('survives storage that throws and garbage JSON', () => {
        expect(loadLookSettings(throwingStorage)).toEqual({ ...LOOK_DEFAULTS })
        const st = memoryStorage()
        st.setItem(LOOK_STORAGE_KEY, '{not json')
        expect(loadLookSettings(st)).toEqual({ ...LOOK_DEFAULTS })
    })
    it('setLookSettings persists, notifies and updates the runtime and getters', () => {
        const seen = []
        subscribeLookSettings((s) => seen.push(s))
        setLookSettings({ fov: 75, headBob: false, invertY: true })
        expect(getLookFov()).toBe(75)
        expect(getHeadBob()).toBe(false)
        expect(getLookRuntime().ySign).toBe(-1)
        expect(seen).toHaveLength(1)
        expect(JSON.parse(window.localStorage.getItem(LOOK_STORAGE_KEY)).fov).toBe(75)
        __resetLookSettingsCacheForTests()
        expect(getLookSettings().fov).toBe(75)
    })
})

describe('lookFeelScale — the drag/trackpad/touch family follows the mouse', () => {
    it('is 1 at the default', () => {
        expect(lookFeelScale(LOOK_DEFAULTS)).toBeCloseTo(1, 12)
    })
    it('halves when the viewer doubles cm/360, in any game', () => {
        expect(lookFeelScale({ ...LOOK_DEFAULTS, sens: LOOK_DEFAULTS.sens / 2 })).toBeCloseTo(0.5, 12)
        // Valorant at the same physical feel as the default is still 1.
        const val = { game: 'valorant', sens: (LOOK_DEFAULTS.sens * 0.022) / 0.07, dpi: LOOK_DEFAULTS.dpi }
        expect(lookFeelScale(val)).toBeCloseTo(1, 12)
    })
})
