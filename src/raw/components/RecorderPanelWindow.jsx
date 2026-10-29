import { useCallback, useEffect, useRef, useState } from 'react'
import LiveTextureView, { isLiveTexture } from './LiveTextureView.jsx'
import {
    RECORDER_BITS_PER_SECOND, RECORDER_FPS,
    audioTracksOf, drawPicture, formatSeconds, pickRecorderMimeType, pictureMediaOf, takeFileName,
} from '../utils/recording.js'

const defaultCanvas = () => globalThis.document?.createElement('canvas') || null
const defaultRecorder = () => (typeof MediaRecorder === 'undefined' ? null : MediaRecorder)
const defaultFrame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 1000 / RECORDER_FPS))
const defaultCancel = (id) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id))

const IDLE = { recording: false, seconds: 0, status: '', file: '' }

// Recorder: a picture wire, and a sound if one is wired, to WebM between
// Start and Stop. The window owns everything a graph cannot — the canvas the
// picture is copied into every frame, its captureStream, the MediaRecorder —
// and reports Recording, Seconds, Status and File back for the graph to read
// (stream.recorder/runtime.js). The file lands through the editor's upload
// path (onSave), named after its source and the moment recording began.
//
// The picture is copied, not captured directly, because a wire's picture is
// a texture whose pixels sit in a <video> or a canvas owned by someone else
// (LiveTextureView.jsx); a copy is the one thing every source agrees on.
export default function RecorderPanelWindow({
    node,
    values = {},
    sourceLabel = '',
    onSave = null,
    onReport = null,
    createCanvas = defaultCanvas,
    getRecorder = defaultRecorder,
    requestFrame = defaultFrame,
    cancelFrame = defaultCancel,
    now = () => Date.now(),
}) {
    const nodeId = node?.id
    const [state, setState] = useState(IDLE)
    const session = useRef(null)
    const stateRef = useRef(IDLE)
    const latest = useRef({ values, onSave, onReport, sourceLabel })
    useEffect(() => { latest.current = { values, onSave, onReport, sourceLabel } })

    const report = useCallback((patch) => {
        const next = { ...stateRef.current, ...patch }
        stateRef.current = next
        setState(next)
        latest.current.onReport?.(nodeId, next)
    }, [nodeId])

    const stop = useCallback(() => {
        const current = session.current
        if (!current || current.stopping) return
        current.stopping = true
        cancelFrame(current.frame)
        clearInterval(current.timer)
        try { current.recorder.stop() } catch { current.finish() }
    }, [cancelFrame])

    const start = useCallback(() => {
        if (session.current) return
        const media = pictureMediaOf(latest.current.values?.video)
        if (!media) {
            report({ status: 'No picture is arriving — not recording.' })
            return
        }
        const Recorder = getRecorder()
        if (!Recorder) {
            report({ status: 'This browser cannot record (no MediaRecorder).' })
            return
        }
        const canvas = createCanvas()
        if (!canvas || !drawPicture(media, canvas)) {
            report({ status: 'The picture has no frame yet — not recording.' })
            return
        }
        if (typeof canvas.captureStream !== 'function') {
            report({ status: 'This browser cannot record a canvas.' })
            return
        }
        let stream
        let recorder
        const mimeType = pickRecorderMimeType(Recorder.isTypeSupported?.bind(Recorder))
        try {
            stream = canvas.captureStream(RECORDER_FPS)
            const sound = audioTracksOf(latest.current.values?.audio)
            sound.forEach((track) => stream.addTrack(track))
            recorder = new Recorder(stream, {
                ...(mimeType ? { mimeType } : {}),
                videoBitsPerSecond: RECORDER_BITS_PER_SECOND,
            })
        } catch {
            stream?.getVideoTracks?.().forEach((track) => track.stop())
            report({ status: 'The recording did not start.' })
            return
        }
        const startedAt = now()
        const name = takeFileName({ kind: 'recording', source: latest.current.sourceLabel, date: new Date(startedAt) })
        const chunks = []
        const withSound = audioTracksOf(latest.current.values?.audio).length > 0
        const current = { recorder, stream, frame: null, timer: null, stopping: false, finished: false }
        current.finish = async () => {
            if (current.finished) return
            current.finished = true
            // Only the canvas's own track: a sound track belongs to its source.
            stream.getVideoTracks?.().forEach((track) => track.stop())
            session.current = null
            const seconds = Math.floor((now() - startedAt) / 1000)
            const blob = new Blob(chunks, { type: (mimeType || 'video/webm').split(';')[0] })
            if (!blob.size) {
                report({ recording: false, seconds, status: 'Nothing was recorded.' })
                return
            }
            report({ recording: false, seconds, status: 'Saving…' })
            try {
                const file = new File([blob], name, { type: blob.type })
                const asset = latest.current.onSave ? await latest.current.onSave(nodeId, file) : null
                if (!asset?.id) throw new Error('not saved')
                report({ status: `Saved ${asset.name || name}.`, file: asset.name || name })
            } catch {
                report({ status: `Could not save ${name}.` })
            }
        }
        recorder.ondataavailable = (event) => { if (event?.data?.size) chunks.push(event.data) }
        recorder.onstop = () => { current.finish() }
        recorder.onerror = () => { stop() }
        const draw = () => {
            if (current.stopping) return
            const picture = pictureMediaOf(latest.current.values?.video)
            if (picture) drawPicture(picture, canvas)
            current.frame = requestFrame(draw)
        }
        session.current = current
        try {
            recorder.start(1000)
        } catch {
            session.current = null
            stream.getVideoTracks?.().forEach((track) => track.stop())
            report({ status: 'The recording did not start.' })
            return
        }
        current.frame = requestFrame(draw)
        let shown = 0
        current.timer = setInterval(() => {
            const seconds = Math.floor((now() - startedAt) / 1000)
            if (seconds === shown) return
            shown = seconds
            report({ seconds, status: `Recording ${formatSeconds(seconds)}` })
        }, 250)
        report({
            recording: true,
            seconds: 0,
            status: withSound ? 'Recording 0:00' : 'Recording 0:00 — picture only, no sound wired',
        })
    }, [createCanvas, getRecorder, nodeId, now, report, requestFrame, stop])

    // Rising edges only: holding Start high starts once.
    const edges = useRef({ start: Boolean(values?.start), stop: Boolean(values?.stop) })
    const actions = useRef({ start, stop })
    useEffect(() => { actions.current = { start, stop } })
    useEffect(() => {
        const high = Boolean(values?.start)
        const rose = high && !edges.current.start
        edges.current.start = high
        if (rose) actions.current.start()
    }, [values?.start])
    useEffect(() => {
        const high = Boolean(values?.stop)
        const rose = high && !edges.current.stop
        edges.current.stop = high
        if (rose) actions.current.stop()
    }, [values?.stop])

    // A window closed mid-take still keeps the take: stop saves what was recorded.
    useEffect(() => () => { actions.current.stop() }, [])

    const picture = values?.video
    return (
        <div className="raw-window-stack raw-take-panel">
            <div className="raw-take-preview">
                {isLiveTexture(picture)
                    ? <LiveTextureView texture={picture} label="Picture to record" className="raw-take-media" />
                    : <p className="raw-take-empty">Wire a picture into Picture — a Scene’s Picture or a Picture Out.</p>}
            </div>
            <div className="raw-take-controls">
                <button type="button" className="raw-take-button" onClick={start} disabled={state.recording}>Start</button>
                <button type="button" className="raw-take-button" onClick={stop} disabled={!state.recording}>Stop</button>
                <span className="raw-take-time" aria-label="Seconds recorded">{formatSeconds(state.seconds)}</span>
            </div>
            <p className="raw-take-status" role="status">{state.status || 'Start records the picture to WebM in this project’s files.'}</p>
        </div>
    )
}
