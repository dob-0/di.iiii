import { describe, expect, it, vi } from 'vitest'
import {
    createWalkRecorder,
    extensionForMime,
    pickRecorderMime,
    PIECE_MS,
    RECORDER_MIME_CANDIDATES
} from './walkRecorder.js'

// A stand-in MediaRecorder: no camera, and the test drives the clock.
const makeFakeRecorder = () => {
    const built = []
    class FakeRecorder {
        constructor(stream, options = {}) {
            this.stream = stream
            this.mimeType = options.mimeType || ''
            this.state = 'inactive'
            this.ondataavailable = null
            this.onstop = null
            this.onerror = null
            built.push(this)
        }

        start() {
            this.state = 'recording'
        }

        stop() {
            this.state = 'inactive'
            // A real recorder hands over its bytes and then says it stopped.
            this.ondataavailable?.({ data: new Blob(['bytes'], { type: this.mimeType || 'video/webm' }) })
            this.onstop?.()
        }
    }
    return { FakeRecorder, built }
}

// A clock the test turns by hand: setTimer collects, tick fires.
const makeClock = () => {
    const timers = new Map()
    let nextHandle = 1
    let millis = 0
    return {
        now: () => millis,
        setTimer: (fn, ms) => {
            const handle = nextHandle
            nextHandle += 1
            timers.set(handle, { fn, at: millis + ms })
            return handle
        },
        clearTimer: (handle) => timers.delete(handle),
        /** Advance to the next due timer, firing it. */
        tick: (ms) => {
            millis += ms
            const due = [...timers.entries()].filter(([, entry]) => entry.at <= millis)
            due.forEach(([handle, entry]) => {
                timers.delete(handle)
                entry.fn()
            })
        },
        pending: () => timers.size
    }
}

describe('pickRecorderMime', () => {
    // VP9 before VP8: more detail at the same bitrate, and detail is what the
    // matcher eats.
    it('takes the most wanted mime the phone actually has', () => {
        expect(pickRecorderMime((mime) => mime === 'video/webm;codecs=vp8')).toBe('video/webm;codecs=vp8')
        expect(pickRecorderMime(() => true)).toBe(RECORDER_MIME_CANDIDATES[0])
    })

    // iOS records MP4 and knows none of the WebM strings.
    it('lands on mp4 on a phone that has no WebM', () => {
        expect(pickRecorderMime((mime) => mime.startsWith('video/mp4'))).toBe('video/mp4;codecs=avc1')
    })

    // Not a failure: MediaRecorder with no mimeType records in whatever the
    // browser likes, which is better than refusing to record.
    it('asks for nothing rather than forcing a codec the phone lacks', () => {
        expect(pickRecorderMime(() => false)).toBe('')
        expect(pickRecorderMime(null)).toBe('')
        expect(pickRecorderMime(() => { throw new Error('nope') })).toBe('')
    })
})

describe('extensionForMime', () => {
    it('names the container', () => {
        expect(extensionForMime('video/webm;codecs=vp9')).toBe('webm')
        expect(extensionForMime('video/mp4;codecs=avc1')).toBe('mp4')
        expect(extensionForMime('video/quicktime')).toBe('mp4')
    })

    // An asset with no extension is refused by isAllowedUpload when the mime is
    // octet-stream, so there is always an extension.
    it('never hands over a file with no extension', () => {
        expect(extensionForMime('')).toBe('webm')
        expect(extensionForMime(null)).toBe('webm')
        expect(extensionForMime('video/x-matroska;codecs=avc1')).toBe('webm')
    })
})

describe('createWalkRecorder', () => {
    const build = (overrides = {}) => {
        const { FakeRecorder, built } = makeFakeRecorder()
        const clock = makeClock()
        const pieces = []
        const problems = []
        const recorder = createWalkRecorder({
            stream: {},
            mimeType: 'video/webm;codecs=vp9',
            onPiece: (piece) => pieces.push(piece),
            onProblem: (message) => problems.push(message),
            Recorder: FakeRecorder,
            setTimer: clock.setTimer,
            clearTimer: clock.clearTimer,
            now: clock.now,
            ...overrides
        })
        return { recorder, pieces, problems, clock, built }
    }

    it('refuses to exist without a recorder or a piece handler', () => {
        expect(() => createWalkRecorder({ Recorder: null, onPiece: () => {} }))
            .toThrow(/cannot record/)
        const { FakeRecorder } = makeFakeRecorder()
        expect(() => createWalkRecorder({ Recorder: FakeRecorder })).toThrow(/onPiece/)
    })

    // THE POINT OF THE WHOLE FILE: each piece is its own recorder, so each piece
    // is its own file with its own container headers. A timeslice would have
    // given one file's byte ranges, and only the first would be playable.
    it('cuts a walk into a new recorder every thirty seconds', () => {
        const { recorder, pieces, clock, built } = build()
        recorder.start()
        expect(built).toHaveLength(1)
        clock.tick(PIECE_MS)
        expect(pieces).toHaveLength(1)
        expect(built).toHaveLength(2)
        clock.tick(PIECE_MS)
        expect(pieces).toHaveLength(2)
        expect(built).toHaveLength(3)
        expect(built[0]).not.toBe(built[1])
    })

    it('numbers the pieces in order and says how long each one held', () => {
        const { recorder, pieces, clock } = build()
        recorder.start()
        clock.tick(PIECE_MS)
        clock.tick(PIECE_MS)
        expect(pieces.map((piece) => piece.index)).toEqual([1, 2])
        expect(pieces.map((piece) => piece.seconds)).toEqual([30, 30])
    })

    // The tail is whatever was left, and it must say so: a four-second tail
    // called half a minute would make the "enough to build a room" gate lie.
    it('closes the piece in progress when told to stop, at its real length', () => {
        const { recorder, pieces, clock } = build()
        recorder.start()
        clock.tick(PIECE_MS)
        clock.tick(4000)
        recorder.stop()
        expect(pieces).toHaveLength(2)
        expect(pieces[1].seconds).toBe(4)
        expect(recorder.isRecording()).toBe(false)
    })

    it('does not start another piece after stopping', () => {
        const { recorder, pieces, clock, built } = build()
        recorder.start()
        recorder.stop()
        const madeSoFar = built.length
        clock.tick(PIECE_MS * 3)
        expect(built).toHaveLength(madeSoFar)
        expect(pieces).toHaveLength(1)
    })

    it('leaves no timer behind when it stops', () => {
        const { recorder, clock } = build()
        recorder.start()
        recorder.stop()
        expect(clock.pending()).toBe(0)
    })

    it('ignores a second start — one walk at a time', () => {
        const { recorder, built } = build()
        recorder.start()
        recorder.start()
        expect(built).toHaveLength(1)
    })

    // A black rectangle nobody can explain is worse than nothing on the wall.
    it('throws away a piece with no bytes in it', () => {
        const { FakeRecorder, built } = makeFakeRecorder()
        const clock = makeClock()
        const pieces = []
        const recorder = createWalkRecorder({
            stream: {},
            onPiece: (piece) => pieces.push(piece),
            Recorder: FakeRecorder,
            setTimer: clock.setTimer,
            clearTimer: clock.clearTimer,
            now: clock.now
        })
        recorder.start()
        // A recorder that hands over nothing — a double tap on the button.
        built[0].ondataavailable = null
        recorder.stop()
        expect(pieces).toHaveLength(0)
    })

    // A codec the phone does not have is a recorder that throws on construction.
    // Saying so beats a button that does nothing for six minutes.
    it('says so when the camera will not record at all', () => {
        class Refuses {
            constructor() {
                throw new Error('mime not supported')
            }
        }
        const { recorder, problems } = build({ Recorder: Refuses })
        recorder.start()
        expect(problems).toEqual(['mime not supported'])
        expect(recorder.isRecording()).toBe(false)
    })

    it('carries the mime and the extension the file will be named with', () => {
        const { recorder, pieces, clock } = build()
        recorder.start()
        clock.tick(PIECE_MS)
        expect(pieces[0].mimeType).toBe('video/webm;codecs=vp9')
        expect(pieces[0].extension).toBe('webm')
    })

    // The stream pulled out from under a live recorder: onstop never fires, so
    // nothing would restart. Stalling in "recording" for the rest of the walk is
    // the failure this guards.
    it('says so when the stream is pulled out mid-piece', () => {
        const { FakeRecorder } = makeFakeRecorder()
        const clock = makeClock()
        const problems = []
        class DiesOnStop extends FakeRecorder {
            stop() {
                throw new Error('gone')
            }
        }
        const recorder = createWalkRecorder({
            stream: {},
            onPiece: () => {},
            onProblem: (message) => problems.push(message),
            Recorder: DiesOnStop,
            setTimer: clock.setTimer,
            clearTimer: clock.clearTimer,
            now: clock.now
        })
        recorder.start()
        clock.tick(PIECE_MS)
        expect(problems).toEqual(['the camera stopped'])
        expect(recorder.isRecording()).toBe(false)
    })

    it('passes a recorder error on rather than swallowing it', () => {
        const { recorder, problems, built } = build()
        recorder.start()
        built[0].onerror({ error: new Error('camera in use') })
        expect(problems).toEqual(['camera in use'])
    })

    it('records with no mimeType when the phone offered none', () => {
        const constructed = vi.fn()
        class Watcher {
            constructor(stream, options) {
                constructed(options)
                this.state = 'inactive'
            }

            start() { this.state = 'recording' }
            stop() { this.state = 'inactive'; this.onstop?.() }
        }
        const { recorder } = build({ Recorder: Watcher, mimeType: '' })
        recorder.start()
        expect(constructed).toHaveBeenCalledWith(undefined)
    })
})
