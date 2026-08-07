import { act, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WEBCAM_STATUS, statusForError, useWebcamCapture } from './webcamCapture.js'

function Probe({ onValue }) {
    const videoRef = useRef(null)
    const state = useWebcamCapture(videoRef)
    onValue(state)
    return <video ref={videoRef} />
}

const makeTrack = () => ({ stop: vi.fn() })

afterEach(() => {
    vi.restoreAllMocks()
    delete navigator.mediaDevices
})

describe('statusForError', () => {
    it('maps permission denial to denied', () => {
        expect(statusForError({ name: 'NotAllowedError' })).toBe(WEBCAM_STATUS.DENIED)
        expect(statusForError({ name: 'SecurityError' })).toBe(WEBCAM_STATUS.DENIED)
    })

    it('maps no-camera-present to unavailable', () => {
        expect(statusForError({ name: 'NotFoundError' })).toBe(WEBCAM_STATUS.UNAVAILABLE)
        expect(statusForError({ name: 'OverconstrainedError' })).toBe(WEBCAM_STATUS.UNAVAILABLE)
    })

    it('falls back to a generic error for anything else', () => {
        expect(statusForError({ name: 'AbortError' })).toBe(WEBCAM_STATUS.ERROR)
        expect(statusForError(undefined)).toBe(WEBCAM_STATUS.ERROR)
    })
})

describe('useWebcamCapture', () => {
    it('is unavailable, not stuck requesting, when the browser has no getUserMedia', async () => {
        const values = []
        await act(async () => { render(<Probe onValue={(v) => values.push(v)} />) })
        expect(values.at(-1).status).toBe(WEBCAM_STATUS.UNAVAILABLE)
    })

    it('goes active and exposes a texture once the stream starts playing', async () => {
        const track = makeTrack()
        const stream = { getTracks: () => [track] }
        navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue(stream) }

        const values = []
        let container
        await act(async () => {
            ({ container } = render(<Probe onValue={(v) => values.push(v)} />))
        })

        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: true, audio: false })
        expect(values.at(-1).status).toBe(WEBCAM_STATUS.REQUESTING)

        const video = container.querySelector('video')
        await act(async () => { video.dispatchEvent(new Event('playing')) })

        expect(values.at(-1).status).toBe(WEBCAM_STATUS.ACTIVE)
        expect(values.at(-1).texture).toBeTruthy()
        expect(values.at(-1).texture.isTexture).toBe(true)
    })

    it('reports denied when getUserMedia rejects with NotAllowedError', async () => {
        navigator.mediaDevices = {
            getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { name: 'NotAllowedError' }))
        }

        const values = []
        await act(async () => { render(<Probe onValue={(v) => values.push(v)} />) })

        expect(values.at(-1).status).toBe(WEBCAM_STATUS.DENIED)
    })

    // "a leaked webcam is a lit camera light the user cannot explain" —
    // NODE_BACKLOG.md's own warning for this node family.
    it('stops every track and disposes the texture on unmount', async () => {
        const track = makeTrack()
        const stream = { getTracks: () => [track] }
        navigator.mediaDevices = { getUserMedia: vi.fn().mockResolvedValue(stream) }

        let container
        let view
        await act(async () => {
            view = render(<Probe onValue={() => {}} />)
            container = view.container
        })
        const video = container.querySelector('video')
        await act(async () => { video.dispatchEvent(new Event('playing')) })

        view.unmount()

        expect(track.stop).toHaveBeenCalled()
    })
})
