import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MicSourcePanel, { MicFeed } from './MicSourcePanel.jsx'

let pendingFrame = null
class FakeAnalyser {
    constructor() { this.fftSize = 1024; this.frequencyBinCount = 512 }
    getByteTimeDomainData(array) { array.fill(160) } // above-center -> nonzero RMS
    getByteFrequencyData(array) { array.fill(9) }
}

beforeEach(() => {
    pendingFrame = null
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { pendingFrame = cb; return 1 })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
    delete navigator.mediaDevices
    delete window.AudioContext
})

const stepFrame = async () => {
    const cb = pendingFrame
    pendingFrame = null
    await act(async () => { cb?.() })
}

describe('MicFeed + MicSourcePanel', () => {
    it('shows an unavailable status instead of sitting blank when there is no microphone', async () => {
        await act(async () => { render(<><MicFeed node={{ id: 'mic-1' }} /><MicSourcePanel node={{ id: 'mic-1' }} /></>) })
        expect(screen.getByRole('status').textContent).toMatch(/no microphone/i)
    })

    it('shows a denied message and does not report levels when permission is refused', async () => {
        navigator.mediaDevices = {
            getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotAllowedError' }))
        }
        window.AudioContext = function FakeAudioContext() {
            this.createMediaStreamSource = () => ({ connect: () => {} })
            this.createAnalyser = () => new FakeAnalyser()
            this.close = () => {}
        }
        const onLevelsChange = vi.fn()

        await act(async () => { render(<><MicFeed node={{ id: 'mic-2' }} onLevelsChange={onLevelsChange} /><MicSourcePanel node={{ id: 'mic-2' }} /></>) })

        expect(screen.getByRole('status').textContent).toMatch(/denied/i)
        expect(onLevelsChange).not.toHaveBeenCalledWith('mic-2', expect.any(Number), expect.anything())
    })

    it('reports levels while the window is closed, and clears them only when the feed goes', async () => {
        const track = { stop: vi.fn() }
        navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) }
        window.AudioContext = function FakeAudioContext() {
            this.createMediaStreamSource = () => ({ connect: () => {} })
            this.createAnalyser = () => new FakeAnalyser()
            this.close = vi.fn()
        }
        const onLevelsChange = vi.fn()

        let feed
        await act(async () => {
            feed = render(<MicFeed node={{ id: 'mic-3' }} onLevelsChange={onLevelsChange} />)
        })
        await stepFrame()

        expect(onLevelsChange).toHaveBeenCalled()
        const [nodeId, volume, frequency] = onLevelsChange.mock.calls[0]
        expect(nodeId).toBe('mic-3')
        expect(volume).toBeGreaterThan(0)
        expect(Array.from(frequency)).toEqual(Array(512).fill(9))

        // The window is a meter over Volume; opening it asks nothing.
        await act(async () => { render(<MicSourcePanel node={{ id: 'mic-3' }} volume={volume} />) })
        expect(screen.queryByRole('status')).toBeNull()
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1)

        feed.unmount()
        expect(onLevelsChange).toHaveBeenLastCalledWith('mic-3', null, null)
        expect(track.stop).toHaveBeenCalled()
    })
})
