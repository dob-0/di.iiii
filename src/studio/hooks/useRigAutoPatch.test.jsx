import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRigAutoPatch } from './useRigAutoPatch.js'
import library from '../../rigbuild/types/moxir.json'

const mirrorOf = (present) => ({ getSnapshot: () => ({ present }), subscribe: () => () => {}, probe: vi.fn(async () => present), watch: vi.fn(() => () => {}) })
const lamp = (id, fixture) => ({ id, type: 'spotLight', components: { fixture } })
const answer = (body) => ({ ok: true, status: 200, json: async () => body })

describe('useRigAutoPatch', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(500) }) }

    it('never reaches the desk for a room with no typed lamps', async () => {
        const postImpl = vi.fn()
        let edits = 0
        let entities = []
        const { rerender } = renderHook(() => useRigAutoPatch({ projectId: 'p', entities, edits, applyOps: vi.fn(), library, mirror: mirrorOf(true), postImpl }))
        entities = [lamp('x', { index: 3 })]
        edits = 1
        rerender()
        await flush()
        expect(postImpl).not.toHaveBeenCalled()
    })

    it('does nothing where there is no desk', async () => {
        const postImpl = vi.fn()
        const { result } = renderHook(() => useRigAutoPatch({ projectId: 'p', entities: [lamp('a', { type: 'up-b380f' })], applyOps: vi.fn(), library, mirror: mirrorOf(false), postImpl }))
        await flush()
        await act(async () => { expect((await result.current.patchNow()).ok).toBe(false) })
        expect(postImpl).not.toHaveBeenCalled()
    })

    // A reader never writes (2026-10-01, MOXIR): the old hook patched 400 ms after mount,
    // and again on every change that arrived from a collaborator.
    it('never patches a room it only opened, nor a change that arrived from someone else', async () => {
        const postImpl = vi.fn(async () => answer({ ok: true, assignments: [], flags: [], removed: [] }))
        const applyOps = vi.fn()
        let entities = [lamp('a', { type: 'up-b380f', mode: '16ch', universe: 1, address: 1, index: 1 }), lamp('b', { type: 'up-b380f' })]
        const { rerender } = renderHook(() => useRigAutoPatch({ projectId: 'p', entities, applyOps, library, mirror: mirrorOf(true), postImpl }))
        await flush()
        entities = [...entities, lamp('c', { type: 'up-b380f' })]
        rerender()
        await flush()
        expect(postImpl).not.toHaveBeenCalled()
        expect(applyOps).not.toHaveBeenCalled()
    })

    it('an edit of this person that does not touch a lamp asks the desk nothing', async () => {
        const postImpl = vi.fn()
        let edits = 0
        let entities = [lamp('a', { type: 'up-b380f' })]
        const { rerender } = renderHook(() => useRigAutoPatch({ projectId: 'p', entities, edits, applyOps: vi.fn(), library, mirror: mirrorOf(true), postImpl }))
        entities = [...entities, { id: 'box', type: 'box', components: {} }]
        edits = 1
        rerender()
        await flush()
        expect(postImpl).not.toHaveBeenCalled()
    })

    // Review 2026-10-01: after a patch whose answer changed nothing in the room (a mode edit on a
    // lamp the desk kept in place), the NEXT edit that touched no lamp still patched the whole room.
    it('a lamp edit patches once; a later edit that touches no lamp asks nothing more', async () => {
        const postImpl = vi.fn(async () => answer({ ok: true, assignments: [{ key: 'p:a', index: 1, universe: 1, address: 1, footprint: 16, how: 'kept' }], flags: [], removed: [] }))
        let edits = 0
        let entities = [lamp('a', { type: 'up-b380f', mode: '16ch', universe: 1, address: 1, index: 1 })]
        const mirror = mirrorOf(true) // one desk for the whole test, as a page has
        const applyOps = vi.fn()
        const { rerender } = renderHook(() => useRigAutoPatch({ projectId: 'p', entities, edits, applyOps, library, mirror, postImpl }))
        await flush()
        entities = [lamp('a', { type: 'up-b380f', mode: '16ch-assumed', universe: 1, address: 1, index: 1 })]
        edits = 1
        rerender()
        await flush()
        expect(postImpl).toHaveBeenCalledTimes(1)
        entities = [...entities, { id: 'box', type: 'box', components: {} }]
        edits = 2
        rerender()
        await flush()
        expect(postImpl).toHaveBeenCalledTimes(1)
    })

    it('patchNow patches the whole room when a person asks', async () => {
        const postImpl = vi.fn(async () => answer({ ok: true, assignments: [{ key: 'p:a', index: 1, universe: 1, address: 1, footprint: 16, how: 'created' }], flags: [], removed: [] }))
        const applyOps = vi.fn()
        const { result } = renderHook(() => useRigAutoPatch({ projectId: 'p', entities: [lamp('a', { type: 'up-b380f' })], applyOps, library, mirror: mirrorOf(true), postImpl }))
        await flush()
        expect(postImpl).not.toHaveBeenCalled()
        await act(async () => { await result.current.patchNow() })
        expect(postImpl).toHaveBeenCalledTimes(1)
        expect(postImpl.mock.calls[0][1]).toMatchObject({ project: 'p', prune: true, group: false })
        expect(applyOps).toHaveBeenCalledTimes(1)
    })

    it('patches a lamp this person placed once, after the debounce, and writes the answer back', async () => {
        const postImpl = vi.fn(async () => answer({ ok: true, assignments: [{ key: 'p:a', index: 1, universe: 1, address: 1, footprint: 16, how: 'created' }], flags: [], removed: [] }))
        const applyOps = vi.fn()
        let edits = 0
        let entities = []
        const { result, rerender } = renderHook(() => useRigAutoPatch({ projectId: 'p', entities, edits, applyOps, library, mirror: mirrorOf(true), postImpl }))
        entities = [lamp('a', { type: 'up-b380f' })]
        edits = 1
        rerender()
        expect(postImpl).not.toHaveBeenCalled()
        await flush()
        expect(postImpl).toHaveBeenCalledTimes(1)
        expect(postImpl.mock.calls[0][0]).toBe('api/rig/patch')
        expect(postImpl.mock.calls[0][1].lamps[0]).toMatchObject({ key: 'p:a', footprint: 16, mode: '16ch' })
        expect(applyOps).toHaveBeenCalledWith([{ type: 'updateComponent', payload: { entityId: 'a', component: 'fixture', patch: { index: 1, universe: 1, address: 1, mode: '16ch' } } }])
        expect(result.current.message).toBe('1 patched')
    })

    it('sends a hand-typed address as a move, and patch-this-group as a repatch of just those lamps', async () => {
        const postImpl = vi.fn(async (route, body) => answer({ ok: true, assignments: body.lamps.map((l) => ({ key: l.key, index: 1, universe: l.universe || 1, address: l.address || 1, footprint: 16, how: 'kept' })), flags: [], removed: [] }))
        let entities = [lamp('a', { type: 'up-b380f', mode: '16ch', universe: 1, address: 1, index: 1 }), lamp('b', { type: 'up-b380f', mode: '16ch', universe: 1, address: 17, index: 2 })]
        let edits = 0
        const { rerender, result } = renderHook(() => useRigAutoPatch({ projectId: 'p', entities, edits, applyOps: vi.fn(), library, mirror: mirrorOf(true), postImpl }))
        await flush()
        entities = [lamp('a', { type: 'up-b380f', mode: '16ch', universe: 2, address: 1, index: 1 }), entities[1]]
        edits = 1
        rerender()
        await flush()
        expect(postImpl).toHaveBeenCalledTimes(1)
        const moved = postImpl.mock.calls[0][1].lamps.find((l) => l.key === 'p:a')
        expect(moved.move).toBe(true)
        await act(async () => { await result.current.patchGroup(['b']) })
        const group = postImpl.mock.calls[1][1]
        expect(group).toMatchObject({ group: true, repatch: true, prune: false })
        expect(group.lamps.map((l) => l.key)).toEqual(['p:b'])
    })
})
