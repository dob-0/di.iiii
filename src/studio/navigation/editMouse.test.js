// The Edit mouse (editMouse.js): Pull to move (default) or Like Blender, which must be EXACTLY origin/dev's Edit before View | Edit
// (owner 2026-10-29: "what we have never lose"). The snapshots below were read from origin/dev's mappings.js on 2026-10-29
// (git show origin/dev:src/studio/navigation/mappings.js; actionFor('blender', …) for every button, Alt/Shift/Ctrl and ortho).
import { describe, expect, it } from 'vitest'
import { DEFAULT_EDIT_MOUSE, EDIT_MOUSES, normalizeEditMouse, presetForTool, pullOnFor } from './editMouse.js'
import { NAVIGATION_PRESETS, actionFor, controlBindingsFor, mouseButtonsFor } from './mappings.js'

const ORIGIN_DEV_BLENDER_ACTIONS = {"p0000":0,"p0001":0,"p0010":0,"p0011":0,"p0100":1,"p0101":16,"p0110":2,"p0111":2,"p1000":1,"p1001":16,"p1010":2,"p1011":2,"p1100":1,"p1101":16,"p1110":2,"p1111":2,"p2000":0,"p2001":0,"p2010":0,"p2011":0,"p2100":0,"p2101":0,"p2110":0,"p2111":0,"o0000":0,"o0001":0,"o0010":0,"o0011":0,"o0100":1,"o0101":16,"o0110":2,"o0111":2,"o1000":1,"o1001":16,"o1010":2,"o1011":2,"o1100":1,"o1101":16,"o1110":2,"o1111":2,"o2000":0,"o2001":0,"o2010":0,"o2011":0,"o2100":0,"o2101":0,"o2110":0,"o2111":0}
const ORIGIN_DEV_BLENDER_BINDINGS = { mouseButtons: { left: 0, middle: 1, right: 0, wheel: 0 }, touches: { one: 1, two: 4096 } }

// origin/dev's StudioOrbit: getNavigationPreset(editMode === 'edit' ? 'blender' : 'studio').
const originDevPreset = (editMode) => (editMode === 'edit' ? 'blender' : 'studio')

describe('the Edit mouse', () => {
    it('is Pull to move until a person picks, and junk reads as Pull to move', () => {
        expect(DEFAULT_EDIT_MOUSE).toBe('pull')
        expect(normalizeEditMouse(undefined)).toBe('pull')
        expect(normalizeEditMouse('garbage')).toBe('pull')
        expect(normalizeEditMouse('blender')).toBe('blender')
        expect(EDIT_MOUSES.map((m) => m.label)).toEqual(['Pull to move', 'Like Blender'])
    })

    it('never changes View: View is Move 1 (studio) and has no pull with either choice', () => {
        for (const mouse of ['pull', 'blender']) {
            expect(presetForTool('navigate', mouse)).toBe('studio')
            expect(pullOnFor('navigate', mouse)).toBe(false)
        }
    })

    it('Pull to move is unchanged: Edit keeps the studio map and the pull', () => {
        expect(presetForTool('edit', 'pull')).toBe('studio')
        expect(pullOnFor('edit', 'pull')).toBe(true)
    })

    it('Like Blender picks the same map as origin/dev for every tool, and no pull', () => {
        for (const tool of ['navigate', 'edit', 'select']) expect(presetForTool(tool, 'blender')).toBe(originDevPreset(tool))
        expect(pullOnFor('edit', 'blender')).toBe(false)
    })

    it("Like Blender's Edit mouse map equals origin/dev's Edit map, button by button", () => {
        const id = presetForTool('edit', 'blender')
        const now = {}
        for (const ortho of [false, true]) for (const b of [0, 1, 2]) for (const alt of [0, 1]) for (const shift of [0, 1]) for (const ctrl of [0, 1]) {
            now[(ortho ? 'o' : 'p') + [b, alt, shift, ctrl].join('')] = actionFor(id, b, { alt: !!alt, shift: !!shift, ctrl: !!ctrl }, { ortho })
        }
        expect(now).toEqual(ORIGIN_DEV_BLENDER_ACTIONS)
        expect(controlBindingsFor(id)).toEqual(ORIGIN_DEV_BLENDER_BINDINGS)
        expect(controlBindingsFor(id, { ortho: true })).toEqual(ORIGIN_DEV_BLENDER_BINDINGS)
        expect(mouseButtonsFor(id)).toEqual(ORIGIN_DEV_BLENDER_BINDINGS.mouseButtons)
        expect(NAVIGATION_PRESETS[id].modifierGestures).toBe(true)
    })
})
