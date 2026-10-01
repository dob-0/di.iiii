import { describe, expect, it } from 'vitest'
import { CC_ACTION, NAVIGATION_PRESETS, actionFor, mouseButtonsFor, normalizeNavigationPreset } from './mappings.js'

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
