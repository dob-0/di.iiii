import { beforeEach, describe, expect, it } from 'vitest'
import {
    VIEW_SETTINGS, VIEW_SETTING_DEFAULTS, VIEW_SETTINGS_KEY, clipFor, controlsPropsFor, getViewSettings,
    resetViewSettings, resetViewSettingsForTests, setViewSetting, settingOf, settingsOf
} from './viewSettings.js'

beforeEach(() => { window.localStorage.clear(); resetViewSettingsForTests() })

describe('view settings', () => {
    it('every default sits inside its own range and has a label and a group', () => {
        for (const s of VIEW_SETTINGS) {
            expect(s.label, s.key).toBeTruthy()
            expect(s.group, s.key).toBeTruthy()
            if (s.type === 'range') { expect(s.def).toBeGreaterThanOrEqual(s.min); expect(s.def).toBeLessThanOrEqual(s.max) }
        }
    })
    it('ships unlimited zoom and auto depth on', () => {
        expect(VIEW_SETTING_DEFAULTS.unlimitedZoom).toBe(true)
        expect(VIEW_SETTING_DEFAULTS.autoDepth).toBe(true)
    })
    it('clamps ranges, takes only booleans for toggles, defaults junk, drops unknown keys', () => {
        expect(settingOf('zoomSpeed', 99)).toBe(5)
        expect(settingOf('clipEnd', 1e12)).toBe(1000000)
        expect(settingOf('zoomSpeed', -1)).toBe(0.1)
        expect(settingOf('zoomSpeed', 'abc')).toBe(1)
        expect(settingOf('unlimitedZoom', 'yes')).toBe(true)
        expect(settingOf('nope', 1)).toBeUndefined()
        expect(Object.keys(settingsOf({ zoomSpeed: 2, evil: 1 }))).not.toContain('evil')
    })
    it('maps to camera-controls props: Dolly through is switched per wheel notch by the hook (so the prop rests off); the zoom-out limit is always finite (a quarter of Clip End)', () => {
        const s = { ...VIEW_SETTING_DEFAULTS }
        expect(controlsPropsFor(s, { dollyToCursor: true })).toMatchObject({ infinityDolly: false, maxDistance: 5000, truckSpeed: 2, dollySpeed: 1, smoothTime: 0.15, dollyToCursor: true })
        expect(Number.isFinite(controlsPropsFor(s).maxDistance)).toBe(true)
        expect(controlsPropsFor({ ...s, panSpeed: 2.5 }).truckSpeed).toBe(5)
        expect(controlsPropsFor({ ...s, invertWheel: true }).dollySpeed).toBe(-1)
        expect(controlsPropsFor({ ...s, smoothViewMs: 0 }).smoothTime).toBe(0)
    })
    it('clip planes: follow the distance inside Clip Start/End, or sit exactly at them', () => {
        const d = VIEW_SETTING_DEFAULTS
        expect(clipFor(1, d)).toEqual({ near: 0.05, far: 400 })
        const c = clipFor(5000, d)
        expect(c.far).toBeGreaterThan(5000)
        expect(c.far).toBeLessThanOrEqual(d.clipEnd)
        expect(c.near).toBeGreaterThan(0.05)
        expect(c.far / c.near).toBeLessThan(1e5)
        expect(clipFor(NaN, d)).toEqual({ near: 0.05, far: 400 })
        expect(clipFor(1e9, d)).toEqual({ near: 100, far: d.clipEnd })
        expect(clipFor(5000, { ...d, autoClip: false })).toEqual({ near: 0.05, far: 20000 })
    })
    it('remembers per browser and Reset restores the shipped values', () => {
        setViewSetting('zoomSpeed', 2)
        expect(JSON.parse(window.localStorage.getItem(VIEW_SETTINGS_KEY)).zoomSpeed).toBe(2)
        resetViewSettingsForTests()
        expect(getViewSettings().zoomSpeed).toBe(2)
        resetViewSettings()
        expect(getViewSettings()).toEqual(VIEW_SETTING_DEFAULTS)
    })
})
