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
        renderHook(() => useRigAutoPatch({ projectId: 'p', entities: [lamp('x', { index: 3 })], applyOps: vi.fn(), library, mirror: mirrorOf(true), postImpl }))
        await flush()
        expect(postImpl).not.toHaveBeenCalled()
    })

    it('does nothing where there is no desk', async () => {
        const postImpl = vi.fn()
        renderHook(() => useRigAutoPatch({ projectId: 'p', entities: [lamp('a', { type: 'up-b380f' })], applyOps: vi.fn(), library, mirror: mirrorOf(false), postImpl }))
        await flush()
        expect(postImpl).not.toHaveBeenCalled()
    })

    it('patches a placed lamp once, after the debounce, and writes the answer back', async () => {
        const postImpl = vi.fn(async () => answer({ ok: true, assignments: [{ key: 'p:a', index: 1, universe: 1, address: 1, footprint: 16, how: 'created' }], flags: [], removed: [] }))
        const applyOps = vi.fn()
        const { result } = renderHook(() => useRigAutoPatch({ projectId: 'p', entities: [lamp('a', { type: 'up-b380f' })], applyOps, library, mirror: mirrorOf(true), postImpl }))
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
        const { rerender, result } = renderHook(() => useRigAutoPatch({ projectId: 'p', entities, applyOps: vi.fn(), library, mirror: mirrorOf(true), postImpl }))
        await flush()
        entities = [lamp('a', { type: 'up-b380f', mode: '16ch', universe: 2, address: 1, index: 1 }), entities[1]]
        rerender()
        await flush()
        const moved = postImpl.mock.calls[1][1].lamps.find((l) => l.key === 'p:a')
        expect(moved.move).toBe(true)
        await act(async () => { await result.current.patchGroup(['b']) })
        const group = postImpl.mock.calls[2][1]
        expect(group).toMatchObject({ group: true, repatch: true, prune: false })
        expect(group.lamps.map((l) => l.key)).toEqual(['p:b'])
    })
})
