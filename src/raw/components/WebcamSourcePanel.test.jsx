import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebcamSourcePanel from './WebcamSourcePanel.jsx'

afterEach(() => {
    vi.restoreAllMocks()
    delete navigator.mediaDevices
})

describe('WebcamSourcePanel', () => {
    it('shows a requesting/unavailable status instead of sitting blank when there is no camera', async () => {
        await act(async () => {
            render(<WebcamSourcePanel node={{ id: 'cam-1' }} />)
        })

        expect(screen.getByRole('status').textContent).toMatch(/no camera/i)
    })

    it('shows a denied message and does not report a frame when permission is refused', async () => {
        navigator.mediaDevices = {
            getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotAllowedError' }))
        }
        const onFrameChange = vi.fn()

        await act(async () => {
            render(<WebcamSourcePanel node={{ id: 'cam-1' }} onFrameChange={onFrameChange} />)
        })

        expect(screen.getByRole('status').textContent).toMatch(/denied/i)
        expect(onFrameChange).not.toHaveBeenCalledWith('cam-1', expect.anything())
    })

    it('reports the captured frame up to the caller, keyed by node id, and clears it on unmount', async () => {
        const track = { stop: vi.fn() }
        navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) }
        const onFrameChange = vi.fn()

        let container
        let view
        await act(async () => {
            view = render(<WebcamSourcePanel node={{ id: 'cam-1' }} onFrameChange={onFrameChange} />)
            container = view.container
        })
        await act(async () => {
            container.querySelector('video').dispatchEvent(new Event('playing'))
        })

        expect(screen.queryByRole('status')).toBeNull()
        expect(onFrameChange).toHaveBeenLastCalledWith('cam-1', expect.objectContaining({ isTexture: true }))

        view.unmount()
        expect(onFrameChange).toHaveBeenLastCalledWith('cam-1', null)
        expect(track.stop).toHaveBeenCalled()
    })
})
