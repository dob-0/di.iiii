import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOpHistory } from './useOpHistory.js'
import { normalizeProjectDocument } from '../../shared/projectSchema.js'

const baseDoc = () => normalizeProjectDocument({
    entities: [
        { id: 'box-1', type: 'box', components: { transform: { position: [0, 0, 0] } } },
        { id: 'box-2', type: 'box', components: { transform: { position: [5, 0, 0] } } }
    ]
})

const moveOp = (entityId, position) => ({
    type: 'updateComponent',
    payload: { entityId, component: 'transform', patch: { position } }
})

describe('useOpHistory', () => {
    let applied
    let apply

    beforeEach(() => {
        vi.useFakeTimers()
        applied = []
        apply = vi.fn((ops) => applied.push(Array.isArray(ops) ? ops : [ops]))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    const setup = (options = {}) => renderHook(() => useOpHistory({
        projectId: 'p1',
        document: baseDoc(),
        applyLocalOps: apply,
        ...options
    }))

    it('coalesces a rapid same-target stream into one undo frame', () => {
        const { result } = setup()
        act(() => {
            result.current.applyLocalOps(moveOp('box-1', [1, 0, 0]))
            vi.advanceTimersByTime(100)
            result.current.applyLocalOps(moveOp('box-1', [2, 0, 0]))
            vi.advanceTimersByTime(100)
            result.current.applyLocalOps(moveOp('box-1', [3, 0, 0]))
        })
        act(() => { result.current.undo() })

        expect(applied.at(-1)).toEqual([moveOp('box-1', [0, 0, 0])])
        expect(result.current.canUndo()).toBe(false)
    })

    it('keeps separate frames for different targets and for edits outside the window', () => {
        const { result } = setup()
        act(() => {
            result.current.applyLocalOps(moveOp('box-1', [1, 0, 0]))
            result.current.applyLocalOps(moveOp('box-2', [6, 0, 0]))
            vi.advanceTimersByTime(1000)
            result.current.applyLocalOps(moveOp('box-2', [7, 0, 0]))
        })
        act(() => { result.current.undo() })
        expect(applied.at(-1)).toEqual([moveOp('box-2', [6, 0, 0])])
        act(() => { result.current.undo() })
        expect(applied.at(-1)).toEqual([moveOp('box-2', [5, 0, 0])])
        act(() => { result.current.undo() })
        expect(applied.at(-1)).toEqual([moveOp('box-1', [0, 0, 0])])
        expect(result.current.canUndo()).toBe(false)
    })

    it('redo replays the newest forward ops of a coalesced frame', () => {
        const { result } = setup()
        act(() => {
            result.current.applyLocalOps(moveOp('box-1', [1, 0, 0]))
            result.current.applyLocalOps(moveOp('box-1', [2, 0, 0]))
        })
        act(() => { result.current.undo() })
        act(() => { result.current.redo() })

        expect(applied.at(-1)).toEqual([moveOp('box-1', [2, 0, 0])])
        expect(result.current.canUndo()).toBe(true)
        expect(result.current.canRedo()).toBe(false)
    })

    it('a new edit clears the redo stack', () => {
        const { result } = setup()
        act(() => { result.current.applyLocalOps(moveOp('box-1', [1, 0, 0])) })
        act(() => { result.current.undo() })
        expect(result.current.canRedo()).toBe(true)
        act(() => { result.current.applyLocalOps(moveOp('box-2', [8, 0, 0])) })
        expect(result.current.canRedo()).toBe(false)
    })

    it('history() exposes labeled steps in timeline order with a cursor', () => {
        const { result } = setup()
        act(() => {
            result.current.applyLocalOps({ type: 'createEntity', payload: { entity: { id: 'box-3', type: 'box' } } })
            vi.advanceTimersByTime(1000)
            result.current.applyLocalOps(moveOp('box-1', [1, 0, 0]))
        })
        act(() => { result.current.undo() })

        const { steps, cursor } = result.current.history()
        expect(steps.map((s) => s.label)).toEqual(['Create box', 'Transform Box Entity'])
        expect(steps.map((s) => s.applied)).toEqual([true, false])
        expect(cursor).toBe(1)
    })

    it('jumpTo replays several backward steps as one batch, newest inverse first', () => {
        const { result } = setup()
        act(() => {
            result.current.applyLocalOps(moveOp('box-1', [1, 0, 0]))
            vi.advanceTimersByTime(1000)
            result.current.applyLocalOps(moveOp('box-2', [6, 0, 0]))
            vi.advanceTimersByTime(1000)
            result.current.applyLocalOps(moveOp('box-1', [2, 0, 0]))
        })
        const batchesBefore = applied.length
        act(() => { result.current.jumpTo(0) })

        expect(applied.length).toBe(batchesBefore + 1)
        expect(applied.at(-1)).toEqual([
            moveOp('box-1', [1, 0, 0]),
            moveOp('box-2', [5, 0, 0]),
            moveOp('box-1', [0, 0, 0])
        ])
        expect(result.current.history().cursor).toBe(0)
    })

    it('jumpTo forward redoes in timeline order and a new edit drops the rest', () => {
        const { result } = setup()
        act(() => {
            result.current.applyLocalOps(moveOp('box-1', [1, 0, 0]))
            vi.advanceTimersByTime(1000)
            result.current.applyLocalOps(moveOp('box-2', [6, 0, 0]))
            vi.advanceTimersByTime(1000)
            result.current.applyLocalOps(moveOp('box-1', [2, 0, 0]))
        })
        act(() => { result.current.jumpTo(0) })
        act(() => { result.current.jumpTo(2) })

        expect(applied.at(-1)).toEqual([
            moveOp('box-1', [1, 0, 0]),
            moveOp('box-2', [6, 0, 0])
        ])
        expect(result.current.history().cursor).toBe(2)

        act(() => {
            vi.advanceTimersByTime(1000)
            result.current.applyLocalOps(moveOp('box-2', [9, 0, 0]))
        })
        const { steps, cursor } = result.current.history()
        expect(steps).toHaveLength(3)
        expect(cursor).toBe(3)
        expect(steps.every((s) => s.applied)).toBe(true)
    })

    it('ignoreTypes batches still apply but never enter history', () => {
        const { result } = setup({ ignoreTypes: ['setWorkspaceState'] })
        act(() => {
            result.current.applyLocalOps({ type: 'setWorkspaceState', payload: { patch: { selectedNodeId: null } } })
        })
        expect(apply).toHaveBeenCalledTimes(1)
        expect(result.current.canUndo()).toBe(false)
    })
})
