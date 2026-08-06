import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MEDIA_CAPTURE_STATUS, useMicCapture } from './micCapture.js'

function Probe({ onLevels, onValue }) {
    const state = useMicCapture(onLevels)
    onValue(state)
    return null
}

const makeTrack = () => ({ stop: vi.fn() })

class FakeAnalyser {
    constructor() {
        this.fftSize = 1024
        this.frequencyBinCount = 512
    }
    getByteTimeDomainData(array) { array.fill(128) }
    getByteFrequencyData(array) { array.fill(7) }
}

function installFakeAudioContext() {
    const closeSpy = vi.fn()
    const connectSpy = vi.fn()
    window.AudioContext = function FakeAudioContext() {
        this.createMediaStreamSource = vi.fn(() => ({ connect: connectSpy }))
        this.createAnalyser = vi.fn(() => new FakeAnalyser())
        this.close = closeSpy
    }
    return { closeSpy, connectSpy }
}

// The hook's own tick() re-schedules itself via requestAnimationFrame — a
// mock that invokes the callback synchronously would recurse forever in one
// call stack. Capture the callback and let each test step it explicitly.
let pendingFrame = null

beforeEach(() => {
    let raf = 0
    pendingFrame = null
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        pendingFrame = cb
        return ++raf
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

const stepFrame = async () => {
    const cb = pendingFrame
    pendingFrame = null
    await act(async () => { cb?.() })
}

afterEach(() => {
    vi.restoreAllMocks()
    delete navigator.mediaDevices
    delete window.AudioContext
})

describe('useMicCapture', () => {
    it('is unavailable when the browser has no getUserMedia', async () => {
        const values = []
        await act(async () => { render(<Probe onLevels={() => {}} onValue={(v) => values.push(v)} />) })
        expect(values.at(-1).status).toBe(MEDIA_CAPTURE_STATUS.UNAVAILABLE)
    })

    it('is unavailable when there is no Web Audio API, even with getUserMedia present', async () => {
        navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }) }
        const values = []
        await act(async () => { render(<Probe onLevels={() => {}} onValue={(v) => values.push(v)} />) })
        expect(values.at(-1).status).toBe(MEDIA_CAPTURE_STATUS.UNAVAILABLE)
    })

    it('goes active and reports volume/frequency every animation frame once captured', async () => {
        const track = makeTrack()
        navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) }
        installFakeAudioContext()

        const levels = []
        const values = []
        await act(async () => {
            render(<Probe onLevels={(v, f) => levels.push([v, f])} onValue={(v) => values.push(v)} />)
        })
        await stepFrame()

        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false })
        expect(values.at(-1).status).toBe(MEDIA_CAPTURE_STATUS.ACTIVE)
        expect(levels.length).toBeGreaterThan(0)
        // getByteTimeDomainData filled with 128 (silence, centered) -> RMS 0.
        expect(levels[0][0]).toBe(0)
        expect(Array.from(levels[0][1])).toEqual(Array(512).fill(7))
    })

    it('reports denied when getUserMedia rejects with NotAllowedError', async () => {
        navigator.mediaDevices = {
            getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotAllowedError' }))
        }
        installFakeAudioContext()

        const values = []
        await act(async () => { render(<Probe onLevels={() => {}} onValue={(v) => values.push(v)} />) })
        expect(values.at(-1).status).toBe(MEDIA_CAPTURE_STATUS.DENIED)
    })

    // "a leaked mic stream is a hot mic the user cannot explain" — same
    // reasoning docs/roadmaps/NODE_BACKLOG.md gives for source.webcam.
    it('stops every track, closes the audio context, and cancels the frame loop on unmount', async () => {
        const track = makeTrack()
        navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) }
        const { closeSpy } = installFakeAudioContext()
        const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame')

        let view
        await act(async () => { view = render(<Probe onLevels={() => {}} onValue={() => {}} />) })

        view.unmount()

        expect(track.stop).toHaveBeenCalled()
        expect(closeSpy).toHaveBeenCalled()
        expect(cancelSpy).toHaveBeenCalled()
    })
})
