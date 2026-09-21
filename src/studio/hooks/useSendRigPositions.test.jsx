import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSendRigPositions } from './useSendRigPositions.js'

const mirrorOf = (snapshot) => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, probe: vi.fn(), watch: vi.fn(() => () => {}) })
const lamp = (index) => ({ id: `l${index}`, type: 'pointLight', components: { transform: { position: [0, 2, 0] }, light: {}, fixture: { index } } })
const FIXTURES = [{ id: 'fx', index: 1, name: 'One', x: 0, y: 0, colour: { r: 0, g: 0, b: 0 }, level: 0 }]

describe('useSendRigPositions', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

    it('reads the desk at the click, shows the answer, and lets it go after a moment', async () => {
        const fetchImpl = vi.fn(async () => ({ ok: true, status: 200 }))
        vi.stubGlobal('fetch', fetchImpl)
        const mirror = mirrorOf({ present: true, fixtures: FIXTURES, master: 255, blackout: false })
        const { result } = renderHook(() => useSendRigPositions({ entities: [lamp(1)], mirror, noteMs: 1000 }))
        expect(result.current.note).toBe('')
        await act(async () => { await result.current.send() })
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(result.current.note).toBe('1 lamp moved')
        act(() => { vi.advanceTimersByTime(1000) })
        expect(result.current.note).toBe('')
    })

    it('says there is no desk when the store says so, without a request', async () => {
        const fetchImpl = vi.fn()
        vi.stubGlobal('fetch', fetchImpl)
        const mirror = mirrorOf({ present: false, fixtures: [], master: null, blackout: false })
        const { result } = renderHook(() => useSendRigPositions({ entities: [lamp(1)], mirror }))
        await act(async () => { await result.current.send() })
        expect(fetchImpl).not.toHaveBeenCalled()
        expect(result.current.note).toBe('no desk on this machine')
    })
})
