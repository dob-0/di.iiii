import { describe, expect, it } from 'vitest'
import {
    HEAD_LIGHT, HEAD_LIGHT_KEY,
    headLightCastsShadow, isHeadLightKey, resolveHeadLight, toggleHeadLight
} from './headLight.js'
import { applyProjectOps, normalizeProjectDocument } from '../shared/projectSchema.js'
import { outputRenderSettings } from '../shared/renderPlan.js'

describe('head light: the project setting (worldState.headLight)', () => {
    it('is off unless the document says worldState.headLight.enabled === true', () => {
        expect(resolveHeadLight(undefined).available).toBe(false)
        expect(resolveHeadLight({}).available).toBe(false)
        expect(resolveHeadLight({ headLight: null }).available).toBe(false)
        expect(resolveHeadLight({ headLight: { enabled: false } }).available).toBe(false)
        expect(resolveHeadLight({ headLight: { enabled: 'yes' } }).available).toBe(false)
        expect(resolveHeadLight({ headLight: { enabled: true } }).available).toBe(true)
    })

    it('survives the document schema: kept when on, null otherwise (old documents have no field)', () => {
        const on = normalizeProjectDocument({ worldState: { headLight: { enabled: true, junk: 1 } } })
        expect(on.worldState.headLight).toEqual({ enabled: true })
        expect(normalizeProjectDocument({ worldState: {} }).worldState.headLight).toBeNull()
        expect(normalizeProjectDocument({ worldState: { headLight: { enabled: false } } }).worldState.headLight).toBeNull()
        expect(normalizeProjectDocument({ worldState: { headLight: { enabled: 'yes' } } }).worldState.headLight).toBeNull()
        expect(normalizeProjectDocument({}).worldState.headLight).toBeNull()
    })

    it('a project turns it on and off through a setWorldState op', () => {
        const on = applyProjectOps({}, [{ type: 'setWorldState', payload: { patch: { headLight: { enabled: true } } } }])
        expect(resolveHeadLight(on.worldState).available).toBe(true)
        const off = applyProjectOps(on, [{ type: 'setWorldState', payload: { patch: { headLight: null } } }])
        expect(off.worldState.headLight).toBeNull()
        expect(resolveHeadLight(off.worldState).available).toBe(false)
    })
})

describe('head light: the toggle', () => {
    it('flips only when the project makes it available, and never turns on otherwise', () => {
        expect(toggleHeadLight(false, true)).toBe(true)
        expect(toggleHeadLight(true, true)).toBe(false)
        expect(toggleHeadLight(false, false)).toBe(false)
        expect(toggleHeadLight(true, false)).toBe(false)
    })

    it('answers the L key, either case, and nothing else (F is Fly\'s, in every project)', () => {
        expect(HEAD_LIGHT_KEY).toBe('l')
        expect(isHeadLightKey({ key: 'l' })).toBe(true)
        expect(isHeadLightKey({ key: 'L' })).toBe(true)
        expect(isHeadLightKey({ key: 'f' })).toBe(false)
        expect(isHeadLightKey({ key: 'g' })).toBe(false)
        expect(isHeadLightKey({ key: 'l', repeat: true })).toBe(false)
        expect(isHeadLightKey({ key: 'l', ctrlKey: true })).toBe(false)
        expect(isHeadLightKey({ key: 'l', metaKey: true })).toBe(false)
        expect(isHeadLightKey({ key: 'l', altKey: true })).toBe(false)
        expect(isHeadLightKey({ key: 'l' }, true)).toBe(false)
        expect(isHeadLightKey(null)).toBe(false)
    })
})

describe('head light: quality decides the shadow', () => {
    it('casts a shadow wherever the renderer allows shadows (High quality, default settings)', () => {
        expect(headLightCastsShadow(undefined)).toBe(true)
        expect(headLightCastsShadow({})).toBe(true)
        expect(headLightCastsShadow({ shadows: true })).toBe(true)
    })
    it('casts none when the project switched shadows off', () => {
        expect(headLightCastsShadow({ shadows: false })).toBe(false)
    })
    it('casts none in Low quality (the output mode drops shadows), whatever the project saved', () => {
        expect(headLightCastsShadow(outputRenderSettings({}))).toBe(false)
        expect(headLightCastsShadow(outputRenderSettings({ shadows: true, shadowCasting: { enabled: true } }))).toBe(false)
    })
})

describe('head light: the look that was asked for', () => {
    it('is a ~35 degree cone, ~10 m, decay 2, warm white', () => {
        expect(HEAD_LIGHT.coneDeg).toBe(35)
        expect(HEAD_LIGHT.range).toBe(10)
        expect(HEAD_LIGHT.decay).toBe(2)
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(HEAD_LIGHT.color.slice(i, i + 2), 16))
        expect(r).toBeGreaterThanOrEqual(g)
        expect(g).toBeGreaterThan(b) // warm: red >= green > blue
    })
})
