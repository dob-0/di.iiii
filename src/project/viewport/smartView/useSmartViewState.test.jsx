// @vitest-environment jsdom
// The audience's views (viewData.resolveViews through `select`): a key or a link to a view this audience does
// not get does nothing — a visitor cannot reach a work view by pressing its number or opening #view-<id>.
import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import useSmartViewState from './useSmartViewState.js'
import { resolveViews } from './viewData.js'
import { VIEW_PRESET_IDS } from './smartViewGeometry.js'

const computed = VIEW_PRESET_IDS.map((id, i) => ({ id, key: String(i + 1), label: id, title: id, position: [0, 1, 0], target: [0, 0, 0] }))
const press = (key) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key })) })

describe('useSmartViewState with a selection', () => {
    it('a visitor gets only the live views; the key of a work view does nothing', () => {
        const select = (presets) => resolveViews(presets, undefined, 'visitor')
        const { result } = renderHook(() => useSmartViewState({ select }))
        act(() => result.current.setPresets(computed))
        expect(result.current.presets.map((p) => p.id)).toEqual(['floor', 'top'])
        press('2')    // dj: a work view by default
        expect(result.current.activeId).toBe(null)
        press('3')    // top: live
        expect(result.current.activeId).toBe('top')
    })
    it('without a selection every computed view is there (unchanged for any other host)', () => {
        const { result } = renderHook(() => useSmartViewState({}))
        act(() => result.current.setPresets(computed))
        expect(result.current.presets).toHaveLength(6)
    })
})
