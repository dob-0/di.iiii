import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import useShowClock from './useShowClock.js'

afterEach(() => {
    vi.useRealTimers()
    try { window.localStorage.clear() } catch { /* private */ }
})

// A desk whose clock runs 4000 ms ahead of this browser, answering in 10 ms.
const deskAhead = (state) => async ({ now }) => {
    const sentAt = now()
    const receivedAt = sentAt + 10
    if (!state.up) return { up: false, reachable: true, serverNow: sentAt + 5 + 4000, sentAt, receivedAt }
    return { up: true, reachable: true, bpm: state.bpm, epoch: state.epoch, serverNow: sentAt + 5 + 4000, sentAt, receivedAt }
}

describe('useShowClock', () => {
    it('the deck keeps its own tempo while no Light desk is up', async () => {
        const state = { up: false }
        const { result } = renderHook(() => useShowClock({ deck: { bpm: 96, epoch: 10 }, readClock: deskAhead(state), now: () => 50000 }))
        await waitFor(() => expect(result.current.light).not.toBe(null))
        expect(result.current.leader).toBe('deck')
        expect(result.current.timeline).toEqual({ bpm: 96, epoch: 10 })
    })

    it('a Light desk leads, its epoch moved into this browser’s time by the measured offset', async () => {
        const state = { up: true, bpm: 128, epoch: 104000 }
        const { result } = renderHook(() => useShowClock({ deck: { bpm: 96 }, readClock: deskAhead(state), now: () => 50000 }))
        await waitFor(() => expect(result.current.leader).toBe('light'))
        expect(result.current.offset.offset).toBe(4000)
        expect(result.current.timeline).toEqual({ bpm: 128, epoch: 100000 })
    })

    it('a tap while the Light desk leads is proposed to it in ITS time, and kept on the deck too', async () => {
        const state = { up: true, bpm: 128, epoch: 0 }
        const sendTempo = vi.fn(async () => true)
        const onDeckTempo = vi.fn()
        let t = 50000
        const { result } = renderHook(() => useShowClock({ deck: { bpm: 96 }, onDeckTempo, readClock: deskAhead(state), sendTempo, now: () => t }))
        await waitFor(() => expect(result.current.leader).toBe('light'))
        act(() => { result.current.tap() })
        t += 500
        act(() => { result.current.tap() })
        expect(onDeckTempo).toHaveBeenCalledWith(120, 50500)
        expect(sendTempo).toHaveBeenCalledWith({ bpm: 120, epoch: 54500 })
    })

    it('when the Light desk goes away, the deck carries on at the room’s tempo and phase', async () => {
        const state = { up: true, bpm: 128, epoch: 104000 }
        const onDeckTempo = vi.fn()
        const { result } = renderHook(() => useShowClock({ deck: { bpm: 96, epoch: 0 }, onDeckTempo, readClock: deskAhead(state), now: () => 50000 }))
        await waitFor(() => expect(result.current.leader).toBe('light'))
        state.up = false
        await waitFor(() => expect(result.current.leader).toBe('deck'), { timeout: 2000 })
        expect(onDeckTempo).toHaveBeenCalledWith(128, 100000)
    })

    it('Follow Light off: this device keeps the deck’s tempo, and remembers the choice', async () => {
        const state = { up: true, bpm: 128, epoch: 0 }
        const { result } = renderHook(() => useShowClock({ deck: { bpm: 96 }, readClock: deskAhead(state), now: () => 50000 }))
        await waitFor(() => expect(result.current.leader).toBe('light'))
        act(() => result.current.setFollow(false))
        expect(result.current.leader).toBe('deck')
        expect(window.localStorage.getItem('dii.perform.followLight')).toBe('off')
    })
})
