// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CC_ACTION, NAVIGATION_PRESETS, actionFor, controlBindingsFor, getNavigationPreset, mouseButtonsFor, normalizeNavigationPreset } from './mappings.js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { NONE, ROTATE, TRUCK, DOLLY, TOUCH_DOLLY_TRUCK } = CC_ACTION

describe('studio preset = the bindings Studio shipped before presets', () => {
    // Literal copied from StudioViewport.jsx at origin/dev e5d95ac9 (2026-10-01).
    it('mouse, touch, dollyToCursor are the old literal', () => {
        const p = NAVIGATION_PRESETS.studio
        expect({ ...p.mouseButtons }).toEqual({ left: 1, middle: 16, right: 2, wheel: 16 })
        expect({ ...p.touches }).toEqual({ one: 1, two: 4096 })
        expect(p.dollyToCursor).toBe(true)
        expect(p.autoDepth).toBe(false)
        expect(p.modifierGestures).toBe(false)
    })
    it('ortho view: left drag pans (was: isOrtho ? TRUCK : ROTATE)', () => {
        expect(mouseButtonsFor('studio', { ortho: true }).left).toBe(TRUCK)
        expect(mouseButtonsFor('studio', { ortho: false }).left).toBe(ROTATE)
    })
    it('modifiers change nothing in studio', () => {
        for (const mods of [{}, { shift: true }, { ctrl: true }, { alt: true }]) {
            expect(actionFor('studio', 0, mods)).toBe(ROTATE)
            expect(actionFor('studio', 1, mods)).toBe(DOLLY)
            expect(actionFor('studio', 2, mods)).toBe(TRUCK)
            expect(actionFor('studio', 0, mods, { ortho: true })).toBe(TRUCK)
        }
    })
})

describe('blender preset (Blender 5.2 manual behaviour)', () => {
    const table = [
        // button, mods, expected
        [1, {}, ROTATE, 'MMB orbit'],
        [1, { shift: true }, TRUCK, 'Shift-MMB pan'],
        [1, { ctrl: true }, DOLLY, 'Ctrl-MMB zoom'],
        [0, {}, NONE, 'LMB does not navigate'],
        [0, { shift: true }, NONE, 'Shift-LMB does not navigate'],
        [0, { alt: true }, ROTATE, 'emulate: Alt-LMB orbit'],
        [0, { alt: true, shift: true }, TRUCK, 'emulate: Shift-Alt-LMB pan'],
        [0, { alt: true, ctrl: true }, DOLLY, 'emulate: Ctrl-Alt-LMB zoom'],
        [2, {}, NONE, 'RMB does not navigate'],
        [3, {}, NONE, 'back button: nothing'],
    ]
    it.each(table)('button %i %o -> %i (%s)', (button, mods, expected) => {
        expect(actionFor('blender', button, mods)).toBe(expected)
    })
    it('ortho does not change blender mapping', () => {
        expect(actionFor('blender', 1, {}, { ortho: true })).toBe(ROTATE)
        expect(mouseButtonsFor('blender', { ortho: true }).left).toBe(NONE)
    })
    it('wheel zooms toward the pointer; touch keeps studio gestures', () => {
        const p = NAVIGATION_PRESETS.blender
        expect(p.mouseButtons.wheel).toBe(DOLLY)
        expect(p.dollyToCursor).toBe(true)
        expect(p.autoDepth).toBe(true)
        expect({ ...p.touches }).toEqual({ one: ROTATE, two: TOUCH_DOLLY_TRUCK })
    })
})

describe('normalize', () => {
    it('junk -> studio', () => {
        for (const junk of [null, undefined, '', 'maya', 'BLENDER', 42, {}]) expect(normalizeNavigationPreset(junk)).toBe('studio')
        expect(normalizeNavigationPreset('blender')).toBe('blender')
    })
})

// 2026-10-01: dev.diiii.xyz rendered every 3D room black. StudioViewport handed
// camera-controls the FROZEN preset bindings; camera-controls keeps that object,
// and the app's own writes into it (the ortho swap, the per-gesture action)
// threw "Cannot assign to read only property 'left'" and took the viewport down.
describe('controlBindingsFor — what camera-controls is handed', () => {
    it.each(['studio', 'blender'])('gives %s bindings that take every write the app makes', (id) => {
        const { mouseButtons, touches } = controlBindingsFor(id)
        expect(Object.isFrozen(mouseButtons)).toBe(false)
        expect(Object.isFrozen(touches)).toBe(false)
        const cc = { mouseButtons, touches }
        expect(() => Object.assign(cc.mouseButtons, mouseButtonsFor(id, { ortho: true }))).not.toThrow() // the ortho swap
        expect(() => { cc.mouseButtons.left = 0 }).not.toThrow() // useCameraNavigation's per-gesture write
        expect(mouseButtonsFor(id)).toEqual(getNavigationPreset(id).mouseButtons) // and the preset itself is untouched
    })

    it('is a fresh copy every call, equal to the preset', () => {
        const a = controlBindingsFor('studio')
        const b = controlBindingsFor('studio')
        expect(a.mouseButtons).not.toBe(b.mouseButtons)
        expect(a.mouseButtons).toEqual(getNavigationPreset('studio').mouseButtons)
        expect(a.touches).toEqual(getNavigationPreset('studio').touches)
    })

    it('the viewport hands camera-controls the copies, never the frozen preset', () => {
        const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../components/StudioViewport.jsx'), 'utf8')
        expect(source).not.toMatch(/mouseButtons=\{preset\.mouseButtons\}/)
        expect(source).not.toMatch(/touches=\{preset\.touches\}/)
        expect(source).toMatch(/mouseButtons=\{bindings\.mouseButtons\}/)
    })
})
