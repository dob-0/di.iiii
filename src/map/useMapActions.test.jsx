import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useMapActions } from './useMapDocument.js'

// 2026-09-28: the desk records its edits for undo and never a fired cue — firing is a
// performance. The two go through different appliers so Ctrl+Z after a cue undoes
// the last EDIT, not the cue.
describe('useMapActions', () => {
    it('sends edits to the recorded path and a fired cue to the performance path', () => {
        const recorded = vi.fn()
        const perform = vi.fn()
        const { result } = renderHook(() => useMapActions(recorded, perform))

        result.current.updateSurface('srf-a', { enabled: false })
        expect(recorded).toHaveBeenCalledTimes(1)
        expect(perform).not.toHaveBeenCalled()

        result.current.fireCue({ id: 'cue-1', fade: 0, surfaces: {} })
        expect(perform).toHaveBeenCalledTimes(1)
        expect(recorded).toHaveBeenCalledTimes(1)
    })
})
