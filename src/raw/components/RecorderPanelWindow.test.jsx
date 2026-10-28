import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import RecorderPanelWindow from './RecorderPanelWindow.jsx'

const node = { id: 'rec-1', typeId: 'stream.recorder', values: {} }
const START = Date.parse('2026-10-21T14:03:07Z')
const picture = { image: { videoWidth: 8, videoHeight: 6 } }

// MediaRecorder faked at its boundary: what it was made with, and a chunk on stop.
class FakeRecorder {
    static made = []
    static isTypeSupported = (type) => !type.includes('vp9')
    constructor(stream, options) {
        this.stream = stream
        this.options = options
        this.state = 'inactive'
        FakeRecorder.made.push(this)
    }
    start(timeslice) { this.state = 'recording'; this.timeslice = timeslice }
    stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['webm-bytes']) })
        this.onstop?.()
    }
}

const setup = (props = {}) => {
    let clock = START
    const videoTrack = { kind: 'video', stop: vi.fn() }
    const added = []
    const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => {} }),
        captureStream: vi.fn(() => ({ addTrack: (track) => added.push(track), getVideoTracks: () => [videoTrack] })),
    }
    const onSave = vi.fn(async (_id, file) => ({ id: 'a1', name: file.name }))
    const onReport = vi.fn()
    const frames = []
    const element = (values) => (
        <RecorderPanelWindow
            node={node}
            values={values}
            sourceLabel="Scene"
            onSave={onSave}
            onReport={onReport}
            createCanvas={() => canvas}
            getRecorder={() => FakeRecorder}
            requestFrame={(fn) => { frames.push(fn); return frames.length }}
            cancelFrame={() => {}}
            now={() => clock}
            {...props}
        />
    )
    const view = render(element(props.values || { video: picture }))
    return {
        ...view, element, canvas, videoTrack, added, onSave, onReport, frames,
        advance: (ms) => { clock += ms },
    }
}

describe('RecorderPanelWindow', () => {
    beforeEach(() => { FakeRecorder.made = []; vi.useFakeTimers({ shouldAdvanceTime: false }) })
    afterEach(() => { vi.useRealTimers() })

    it('records the picture to WebM between Start and Stop and lands it as a file', async () => {
        const t = setup()
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))
        expect(FakeRecorder.made).toHaveLength(1)
        const recorder = FakeRecorder.made[0]
        // vp9 is refused by this fake browser, so vp8; 6 Mbps; 30 fps from the canvas.
        expect(recorder.options).toEqual({ mimeType: 'video/webm;codecs=vp8,opus', videoBitsPerSecond: 6_000_000 })
        expect(t.canvas.captureStream).toHaveBeenCalledWith(30)
        expect(recorder.state).toBe('recording')
        expect(t.onReport).toHaveBeenLastCalledWith('rec-1', {
            recording: true, seconds: 0, status: 'Recording 0:00 — picture only, no sound wired', file: '',
        })

        t.advance(3200)
        act(() => { vi.advanceTimersByTime(250) })
        expect(t.onReport).toHaveBeenLastCalledWith('rec-1', expect.objectContaining({ recording: true, seconds: 3, status: 'Recording 0:03' }))
        expect(screen.getByLabelText('Seconds recorded').textContent).toBe('0:03')

        fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
        await act(async () => {})
        expect(t.onSave).toHaveBeenCalledTimes(1)
        const [, file] = t.onSave.mock.calls[0]
        expect(file.name).toBe('recording-scene-2026-10-21T14-03-07.webm')
        expect(file.type).toBe('video/webm')
        expect(file.size).toBe('webm-bytes'.length)
        expect(t.videoTrack.stop).toHaveBeenCalled()
        expect(t.onReport).toHaveBeenLastCalledWith('rec-1', {
            recording: false, seconds: 3,
            status: 'Saved recording-scene-2026-10-21T14-03-07.webm.',
            file: 'recording-scene-2026-10-21T14-03-07.webm',
        })
    })

    it('copies the picture into its canvas every frame while recording', () => {
        const t = setup()
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))
        const draws = vi.spyOn(t.canvas, 'getContext')
        expect(t.frames).toHaveLength(1)
        t.frames[0]()
        expect(draws).toHaveBeenCalledTimes(1)
        expect(t.frames).toHaveLength(2)
    })

    it('Start and Stop signals act on rising edges only', async () => {
        const t = setup()
        t.rerender(t.element({ video: picture, start: true }))
        expect(FakeRecorder.made).toHaveLength(1)
        t.rerender(t.element({ video: picture, start: true }))
        t.rerender(t.element({ video: picture, start: 1 }))
        expect(FakeRecorder.made).toHaveLength(1)
        t.rerender(t.element({ video: picture, start: true, stop: true }))
        await act(async () => {})
        expect(t.onSave).toHaveBeenCalledTimes(1)
        expect(FakeRecorder.made[0].state).toBe('inactive')
    })

    it('records the wired sound with the picture and never stops the sound’s own track', async () => {
        const audioTrack = { kind: 'audio', readyState: 'live', stop: vi.fn() }
        const sound = { getAudioTracks: () => [audioTrack] }
        const t = setup({ values: { video: picture, audio: sound } })
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))
        expect(t.added).toEqual([audioTrack])
        expect(t.onReport).toHaveBeenLastCalledWith('rec-1', expect.objectContaining({ status: 'Recording 0:00' }))
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
        await act(async () => {})
        expect(audioTrack.stop).not.toHaveBeenCalled()
    })

    it('does not start without a picture, and says why', () => {
        const t = setup({ values: {} })
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))
        expect(FakeRecorder.made).toHaveLength(0)
        expect(t.onReport).toHaveBeenLastCalledWith('rec-1', expect.objectContaining({ recording: false, status: 'No picture is arriving — not recording.' }))
    })

    it('does not start where the browser has no MediaRecorder', () => {
        const t = setup({ getRecorder: () => null })
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))
        expect(t.onReport).toHaveBeenLastCalledWith('rec-1', expect.objectContaining({ status: 'This browser cannot record (no MediaRecorder).' }))
    })

    it('a window closed mid-take still keeps the take', async () => {
        const t = setup()
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))
        t.unmount()
        await act(async () => {})
        expect(t.onSave).toHaveBeenCalledTimes(1)
    })

    it('says it could not save when the upload fails', async () => {
        const t = setup()
        t.onSave.mockImplementation(async () => { throw new Error('413') })
        fireEvent.click(screen.getByRole('button', { name: 'Start' }))
        fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
        await act(async () => {})
        expect(t.onReport).toHaveBeenLastCalledWith('rec-1', expect.objectContaining({
            recording: false, status: 'Could not save recording-scene-2026-10-21T14-03-07.webm.', file: '',
        }))
    })
})
