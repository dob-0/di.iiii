import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COALESCE_MS, readHistoryIntent, useEditHistory } from './useEditHistory.js'

const A = ['a']
const B = ['b']
const C = ['c']

const press = (key, overrides = {}) => {
    act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
            key,
            bubbles: true,
            cancelable: true,
            ctrlKey: true,
            ...overrides
        }))
    })
}

describe('readHistoryIntent', () => {
    it('reads Ctrl+Z and Cmd+Z as undo', () => {
        expect(readHistoryIntent({ key: 'z', ctrlKey: true })).toBe('undo')
        expect(readHistoryIntent({ key: 'z', metaKey: true })).toBe('undo')
        expect(readHistoryIntent({ key: 'Z', ctrlKey: true })).toBe('undo')
    })

    it('reads the shifted form and Ctrl+Y as redo', () => {
        expect(readHistoryIntent({ key: 'z', ctrlKey: true, shiftKey: true })).toBe('redo')
        expect(readHistoryIntent({ key: 'y', ctrlKey: true })).toBe('redo')
    })

    it('ignores a bare z, so typing is untouched', () => {
        expect(readHistoryIntent({ key: 'z' })).toBe(null)
    })

    it('leaves text fields their own undo', () => {
        // Rewinding the timeline while someone fixes a typo in a sequence title
        // is a far bigger surprise than the one it would fix.
        const input = document.createElement('input')
        expect(readHistoryIntent({ key: 'z', ctrlKey: true, target: input })).toBe(null)
    })

    it('survives a missing event', () => {
        expect(readHistoryIntent()).toBe(null)
        expect(readHistoryIntent(null)).toBe(null)
    })
})

describe('useEditHistory', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    // Separate two edits by a real quiet gap so they are two undoable acts.
    const settle = () => {
        act(() => {
            vi.advanceTimersByTime(COALESCE_MS + 50)
        })
    }

    it('starts with the initial value and nothing to undo', () => {
        const { result } = renderHook(() => useEditHistory(A))
        expect(result.current.present).toBe(A)
        expect(result.current.canUndo).toBe(false)
        expect(result.current.canRedo).toBe(false)
    })

    it('undoes a discrete edit', () => {
        const { result } = renderHook(() => useEditHistory(A))

        settle()
        act(() => result.current.set(B))
        expect(result.current.present).toBe(B)
        expect(result.current.canUndo).toBe(true)

        act(() => result.current.undo())
        expect(result.current.present).toBe(A)
        expect(result.current.canUndo).toBe(false)
        expect(result.current.canRedo).toBe(true)
    })

    it('redoes what it undid', () => {
        const { result } = renderHook(() => useEditHistory(A))
        settle()
        act(() => result.current.set(B))
        act(() => result.current.undo())
        act(() => result.current.redo())
        expect(result.current.present).toBe(B)
    })

    it('accepts an updater function', () => {
        const { result } = renderHook(() => useEditHistory(A))
        settle()
        act(() => result.current.set((previous) => [...previous, 'x']))
        expect(result.current.present).toEqual(['a', 'x'])
    })

    it('collapses one continuous drag into a single undo', () => {
        // The reason this hook exists. A gizmo drag calls set() on every
        // pointer move; undo must return to before the drag, not step back
        // through it one frame at a time.
        const { result } = renderHook(() => useEditHistory(A))

        settle()
        act(() => {
            for (let index = 0; index < 40; index++) {
                result.current.set([`drag-${index}`])
                vi.advanceTimersByTime(16)
            }
        })

        expect(result.current.present).toEqual(['drag-39'])

        act(() => result.current.undo())
        expect(result.current.present).toBe(A)
        expect(result.current.canUndo).toBe(false)
    })

    it('keeps two deliberate edits as two undos', () => {
        const { result } = renderHook(() => useEditHistory(A))

        settle()
        act(() => result.current.set(B))
        settle()
        act(() => result.current.set(C))

        act(() => result.current.undo())
        expect(result.current.present).toBe(B)
        act(() => result.current.undo())
        expect(result.current.present).toBe(A)
    })

    it('ignores a set that changes nothing', () => {
        const { result } = renderHook(() => useEditHistory(A))
        settle()
        act(() => result.current.set(A))
        expect(result.current.canUndo).toBe(false)
    })

    it('drops the redo branch once a new edit lands', () => {
        const { result } = renderHook(() => useEditHistory(A))

        settle()
        act(() => result.current.set(B))
        act(() => result.current.undo())
        expect(result.current.canRedo).toBe(true)

        settle()
        act(() => result.current.set(C))
        expect(result.current.canRedo).toBe(false)
        expect(result.current.present).toBe(C)
    })

    it('does not weld the next edit onto the step it just undid', () => {
        // An edit arriving inside the coalescing gap right after an undo would
        // merge into the undone entry and silently swallow it.
        const { result } = renderHook(() => useEditHistory(A))

        settle()
        act(() => result.current.set(B))
        act(() => result.current.undo())
        act(() => result.current.set(C)) // immediately, no gap

        act(() => result.current.undo())
        expect(result.current.present).toBe(A)
    })

    it('undoes nothing at the bottom of the stack', () => {
        const { result } = renderHook(() => useEditHistory(A))
        act(() => result.current.undo())
        act(() => result.current.redo())
        expect(result.current.present).toBe(A)
    })

    describe('keyboard', () => {
        it('undoes and redoes from Ctrl+Z', () => {
            const { result } = renderHook(() => useEditHistory(A, { enabled: true }))

            settle()
            act(() => result.current.set(B))

            press('z')
            expect(result.current.present).toBe(A)

            press('z', { shiftKey: true })
            expect(result.current.present).toBe(B)
        })

        it('carries no listener for the audience', () => {
            const { result } = renderHook(() => useEditHistory(A, { enabled: false }))

            settle()
            act(() => result.current.set(B))

            press('z')
            expect(result.current.present).toBe(B)
        })

        it('detaches on unmount', () => {
            const { unmount } = renderHook(() => useEditHistory(A, { enabled: true }))
            unmount()
            expect(() => press('z')).not.toThrow()
        })
    })
})
