import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import TiltFeed from './TiltFeed.jsx'

const node = { id: 't1', typeId: 'device.tilt', values: {} }

const orient = (beta, gamma) => {
    const event = new Event('deviceorientation')
    event.beta = beta
    event.gamma = gamma
    window.dispatchEvent(event)
}

let original
beforeEach(() => {
    original = window.DeviceOrientationEvent
    // the frame runs at once so the test reads what was published; it returns
    // 0 because a real frame id is handed back BEFORE its callback runs
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { fn(0); return 0 })
})
afterEach(() => {
    window.DeviceOrientationEvent = original
    vi.restoreAllMocks()
})

describe('TiltFeed', () => {
    it('without permission to ask (Android, desktop): listens at once, level is the first reading', () => {
        window.DeviceOrientationEvent = function DeviceOrientationEvent() {}
        const onTilt = vi.fn()
        const view = render(<TiltFeed node={node} range={30} onTilt={onTilt} />)
        expect(onTilt).toHaveBeenLastCalledWith('t1', { x: 0, y: 0, live: false })
        act(() => orient(50, 0))
        expect(onTilt).toHaveBeenLastCalledWith('t1', { x: 0, y: 0, live: true })
        act(() => orient(50, 15))
        expect(onTilt).toHaveBeenLastCalledWith('t1', { x: 0.5, y: 0, live: true })
        // a desktop's one null event is not a reading
        const calls = onTilt.mock.calls.length
        act(() => orient(null, null))
        expect(onTilt.mock.calls.length).toBe(calls)
        view.unmount()
        expect(onTilt).toHaveBeenLastCalledWith('t1', null)
    })

    it('iOS: asks nothing until the first tap, asks inside that tap, listens once granted', async () => {
        const requestPermission = vi.fn(() => Promise.resolve('granted'))
        window.DeviceOrientationEvent = Object.assign(function DeviceOrientationEvent() {}, { requestPermission })
        const onTilt = vi.fn()
        render(<TiltFeed node={node} onTilt={onTilt} />)
        act(() => orient(50, 0))
        expect(requestPermission).not.toHaveBeenCalled()
        expect(onTilt).toHaveBeenLastCalledWith('t1', { x: 0, y: 0, live: false })

        await act(async () => { window.dispatchEvent(new Event('touchend')) })
        expect(requestPermission).toHaveBeenCalledTimes(1)
        // the second tap does not ask again
        await act(async () => { window.dispatchEvent(new Event('click')) })
        expect(requestPermission).toHaveBeenCalledTimes(1)
        act(() => orient(50, 0))
        act(() => orient(35, 0))
        expect(onTilt).toHaveBeenLastCalledWith('t1', { x: 0, y: 0.5, live: true })
    })

    it('iOS refused: stays level and not live', async () => {
        window.DeviceOrientationEvent = Object.assign(function DeviceOrientationEvent() {}, {
            requestPermission: vi.fn(() => Promise.resolve('denied'))
        })
        const onTilt = vi.fn()
        render(<TiltFeed node={node} onTilt={onTilt} />)
        await act(async () => { window.dispatchEvent(new Event('click')) })
        act(() => orient(50, 15))
        expect(onTilt).toHaveBeenLastCalledWith('t1', { x: 0, y: 0, live: false })
    })

    it('no DeviceOrientationEvent at all: level, not live, nothing thrown', () => {
        delete window.DeviceOrientationEvent
        const onTilt = vi.fn()
        expect(() => render(<TiltFeed node={node} onTilt={onTilt} />)).not.toThrow()
        expect(onTilt).toHaveBeenLastCalledWith('t1', { x: 0, y: 0, live: false })
    })
})
