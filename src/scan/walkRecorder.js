// THE WALK, CUT INTO PIECES THAT CAN EACH STAND ALONE.
//
// A walk round a factory hall is six or eight minutes. Recorded as one file it
// reaches the server at the end, and a connection that dies at minute seven
// loses seven minutes of walking somebody did once, in a building they may have
// had to arrange access to. Cut into thirty-second pieces and sent as each one
// closes, a dead connection loses the piece in the air.
//
// THE PART THAT IS NOT OBVIOUS: `recorder.start(30000)` looks like it does this
// and does not. A timeslice makes MediaRecorder hand over a chunk every thirty
// seconds, but only the FIRST chunk carries the container's headers — the rest
// are byte ranges of one file and are not playable, not decodable by ffmpeg, and
// therefore worth nothing to frames.mjs on their own. A piece that stands alone
// needs its own recorder: start, stop, start again. So that is what this does.
//
// The cost is a gap between pieces — the few milliseconds a recorder takes to
// finalise its container and the next to begin. It is real and it is accepted:
// the pipeline pulls frames at 2 fps (scripts/place/frames.mjs), so a 40 ms seam
// is a twelfth of one frame's worth of walking, and the alternative is losing a
// whole walk to one lift shaft.
//
// WHAT MIME. Whatever the phone offers, asked for in order of what the
// reconstruction would rather have, and never forced: a codec a phone does not
// have is a recorder that throws on construction and a walk that never starts.
// Android gives WebM/VP9 or VP8; iOS gives MP4. Both are already allowed by the
// server (serverXR/src/index.js: the `video/` prefix passes, and `.webm` and
// `.mp4` are both in ALLOWED_EXTENSIONS), and both are already understood by the
// extractor, which names `-pix_fmt yuvj420p` precisely because a phone's clip is
// usually limited-range.

export const PIECE_MS = 30000

// Most wanted first. VP9 before VP8 (more detail at the same bitrate, and detail
// is what a matcher eats); a plain `video/webm` and `video/mp4` last, because a
// browser that recognises neither of the specific strings may still record.
export const RECORDER_MIME_CANDIDATES = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4'
]

/**
 * The best mime this phone will actually record, or '' — which is not a failure:
 * MediaRecorder with no mimeType at all records in whatever the browser likes,
 * and that is the right thing to do rather than refuse.
 */
export const pickRecorderMime = (isSupported, candidates = RECORDER_MIME_CANDIDATES) => {
    if (typeof isSupported !== 'function') return ''
    return candidates.find((mime) => {
        try {
            return isSupported(mime)
        } catch {
            return false
        }
    }) || ''
}

/** `video/webm;codecs=vp9` → `webm`. What the file is called when it lands. */
export const extensionForMime = (mime) => {
    const base = String(mime || '').split(';')[0].trim().toLowerCase()
    if (base === 'video/mp4' || base === 'video/quicktime') return 'mp4'
    if (base === 'video/webm') return 'webm'
    // An unknown container is still a video, and `.webm` is the one both the
    // server's list and ffmpeg will take a guess at. Named rather than silently
    // extensionless: an asset with no extension is refused by isAllowedUpload
    // when the mime is octet-stream.
    return 'webm'
}

/**
 * A recorder that keeps cutting until it is told to stop.
 *
 * Everything the browser provides is injected, so the cutting can be tested
 * without a camera: `Recorder` (MediaRecorder), `setTimer`/`clearTimer`
 * (setTimeout/clearTimeout) and `now` (Date.now).
 *
 * @param {{
 *   stream: MediaStream,
 *   mimeType?: string,
 *   pieceMs?: number,
 *   onPiece: (piece: {blob: Blob, seconds: number, index: number, mimeType: string, extension: string}) => void,
 *   onProblem?: (message: string) => void,
 *   Recorder?: any, setTimer?: Function, clearTimer?: Function, now?: () => number
 * }} options
 */
export const createWalkRecorder = ({
    stream,
    mimeType = '',
    pieceMs = PIECE_MS,
    onPiece,
    onProblem = null,
    Recorder = (typeof window !== 'undefined' ? window.MediaRecorder : null),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle),
    now = () => Date.now()
} = {}) => {
    if (!Recorder) throw new Error('this browser cannot record video')
    if (typeof onPiece !== 'function') throw new Error('createWalkRecorder needs onPiece')

    let recorder = null
    let timer = null
    let wanted = false
    let index = 0
    let startedAt = 0

    const fail = (message) => {
        wanted = false
        if (onProblem) onProblem(message)
    }

    const startPiece = () => {
        let chunks = []
        try {
            recorder = mimeType ? new Recorder(stream, { mimeType }) : new Recorder(stream)
        } catch (error) {
            fail(String(error?.message || error || 'the camera would not record'))
            return
        }
        startedAt = now()
        index += 1
        const pieceIndex = index
        recorder.ondataavailable = (event) => {
            if (event?.data?.size) chunks.push(event.data)
        }
        recorder.onerror = (event) => fail(String(event?.error?.message || 'recording stopped'))
        recorder.onstop = () => {
            const seconds = Math.max(0, (now() - startedAt) / 1000)
            const blob = chunks.length
                ? new Blob(chunks, { type: chunks[0].type || mimeType || 'video/webm' })
                : null
            chunks = []
            recorder = null
            // A piece with no bytes in it is not a piece. It happens when a
            // recorder is stopped in the same tick it started — a double tap on
            // the button — and hanging an empty video on the wall would be a
            // black rectangle nobody can explain.
            if (blob && blob.size > 0) {
                onPiece({
                    blob,
                    seconds,
                    index: pieceIndex,
                    mimeType: blob.type || mimeType || '',
                    extension: extensionForMime(blob.type || mimeType)
                })
            }
            // The next piece starts only if nobody has asked us to stop. This is
            // where the cutting actually happens.
            if (wanted) startPiece()
        }
        try {
            recorder.start()
        } catch (error) {
            recorder = null
            fail(String(error?.message || error || 'the camera would not record'))
            return
        }
        timer = setTimer(() => {
            timer = null
            // Stopping is what closes the piece; onstop starts the next one.
            if (recorder && recorder.state !== 'inactive') {
                try {
                    recorder.stop()
                } catch {
                    // A recorder the browser already tore down — the stream was
                    // pulled out from under it. onstop will not fire, so nothing
                    // would restart; say so rather than stall in "recording".
                    fail('the camera stopped')
                }
            }
        }, pieceMs)
    }

    return {
        start: () => {
            if (wanted) return
            wanted = true
            startPiece()
        },
        /** Closes the piece in progress and does NOT start another. */
        stop: () => {
            wanted = false
            if (timer !== null) {
                clearTimer(timer)
                timer = null
            }
            if (recorder && recorder.state !== 'inactive') {
                try {
                    recorder.stop()
                } catch {
                    recorder = null
                }
            }
        },
        isRecording: () => wanted,
        pieceCount: () => index
    }
}
