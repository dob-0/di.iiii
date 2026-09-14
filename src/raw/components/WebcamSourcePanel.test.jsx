import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebcamSourcePanel, { WebcamFeed } from './WebcamSourcePanel.jsx'

afterEach(() => {
    vi.restoreAllMocks()
    delete navigator.mediaDevices
})

// The feed holds the camera for as long as the node exists; the window only
// looks. Rendered side by side here the way RawEditor mounts them.
describe('WebcamFeed + WebcamSourcePanel', () => {
    it('shows a requesting/unavailable status instead of sitting blank when there is no camera', async () => {
        await act(async () => {
            render(<><WebcamFeed node={{ id: 'cam-1' }} /><WebcamSourcePanel node={{ id: 'cam-1' }} /></>)
        })

        expect(screen.getByRole('status').textContent).toMatch(/no camera/i)
    })

    it('shows a denied message and does not report a frame when permission is refused', async () => {
        navigator.mediaDevices = {
            getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotAllowedError' }))
        }
        const onFrameChange = vi.fn()

        await act(async () => {
            render(<><WebcamFeed node={{ id: 'cam-2' }} onFrameChange={onFrameChange} /><WebcamSourcePanel node={{ id: 'cam-2' }} /></>)
        })

        expect(screen.getByRole('status').textContent).toMatch(/denied/i)
        expect(onFrameChange).not.toHaveBeenCalledWith('cam-2', expect.anything())
    })

    it('keeps capturing when the WINDOW unmounts; only the feed going away stops the camera', async () => {
        const track = { stop: vi.fn() }
        const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] })
        navigator.mediaDevices = { getUserMedia }
        const playing = []
        const create = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
            const element = create(tag, options)
            if (tag === 'video') playing.push(element)
            return element
        })
        const onFrameChange = vi.fn()

        let feed
        let windowView
        await act(async () => {
            feed = render(<WebcamFeed node={{ id: 'cam-3' }} onFrameChange={onFrameChange} />)
            windowView = render(<WebcamSourcePanel node={{ id: 'cam-3' }} />)
        })
        await act(async () => { playing[0].dispatchEvent(new Event('playing')) })

        expect(onFrameChange).toHaveBeenLastCalledWith('cam-3', expect.objectContaining({ isTexture: true }))
        expect(screen.queryByRole('status')).toBeNull()

        const callsBefore = onFrameChange.mock.calls.length
        windowView.unmount()
        expect(track.stop).not.toHaveBeenCalled()
        expect(onFrameChange.mock.calls.length).toBe(callsBefore)

        // Re-opening the window never asks the device a second time.
        await act(async () => { render(<WebcamSourcePanel node={{ id: 'cam-3' }} />) })
        expect(getUserMedia).toHaveBeenCalledTimes(1)

        feed.unmount()
        expect(onFrameChange).toHaveBeenLastCalledWith('cam-3', null)
        expect(track.stop).toHaveBeenCalled()
    })
})
