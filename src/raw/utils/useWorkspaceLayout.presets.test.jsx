import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import useWorkspaceLayout from './useWorkspaceLayout.js'
import { layoutScopeKey } from './workspaceLayout.js'

// The `presets` slot of dii.rawLayout.* was carried empty from the day the
// envelope was made; the Perform line (2026-09-24) fills it with the person's
// own presets ("mine", this device) and remembers which one was open.

afterEach(() => window.localStorage.clear())

const scope = { spaceId: 'lab', projectId: 'show', viewportWidth: 1440 }
const preset = { id: 'mine:fri', name: 'friday at MOCT', windows: [{ id: 'deck', kind: 'deck' }], wide: { deck: [0, 0, 100, 100] } }

describe('the presets slot', () => {
    it('a preset saved as mine is there after a reload, with the one that was open', () => {
        const first = renderHook(() => useWorkspaceLayout(scope))
        act(() => {
            first.result.current.setPresets([preset])
            first.result.current.setActivePreset('mine:fri')
        })
        act(() => first.result.current.flush())
        first.unmount()

        const again = renderHook(() => useWorkspaceLayout(scope))
        expect(again.result.current.presets).toEqual([preset])
        expect(again.result.current.activePreset).toBe('mine:fri')
    })

    it('is written at once, not after the drag debounce', () => {
        const { result } = renderHook(() => useWorkspaceLayout(scope))
        act(() => result.current.setPresets([preset]))
        const stored = JSON.parse(window.localStorage.getItem(layoutScopeKey(scope)))
        expect(stored.presets).toEqual([preset])
    })

    it('a phone keeps its own presets, apart from the desk’s', () => {
        const desk = renderHook(() => useWorkspaceLayout(scope))
        act(() => desk.result.current.setPresets([preset]))
        const phone = renderHook(() => useWorkspaceLayout({ ...scope, viewportWidth: 390 }))
        expect(phone.result.current.presets).toEqual([])
    })

    it('moving a window afterwards does not drop the presets', () => {
        const { result } = renderHook(() => useWorkspaceLayout(scope))
        act(() => result.current.setPresets([preset]))
        act(() => result.current.setLocalFrame('n1', { x: 5 }))
        act(() => result.current.flush())
        const stored = JSON.parse(window.localStorage.getItem(layoutScopeKey(scope)))
        expect(stored.presets).toEqual([preset])
        expect(stored.frames.n1).toEqual({ x: 5 })
    })
})
