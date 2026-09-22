// A SPACE IS A PLACE, AND THIS IS WHERE THE PLACE WALKS IN.
//
// The owner's words were "create new space and start to scan". No Polycam, no
// second application, no file to find afterwards and carry across: di.iiii itself
// takes the walk and the photographs, and they land in the space's own `sources`
// room as they are taken. The 3D copy is built from them afterwards by the place
// pipeline (scripts/place/) and arrives in the same space as `hall`. Every layer
// is kept, because the space is the thing that lasts and the scan is only its
// first layer (docs/architecture/PLACE.md).
//
// THE CAMERA COACHES, because the footage cannot be re-taken. A hall is somewhere
// you had to arrange access to; the person is standing in it now, and finding out
// at the desk an hour later that every frame was too soft to match is the whole
// walk wasted. So the page measures what it can while there is still time to act
// on it — sharpness, which way the lens has pointed, whether the floor is in the
// picture — and says one short thing at a time.
//
// AND IT DOES NOT FLATTER. The ring counts DIRECTIONS COVERED and says so: a
// person can turn on the spot in a doorway and fill all 36 having seen almost
// nothing of the hall. The number of sharp frames is a count of samples, not a
// promise about the reconstruction. The measured wall is the one number the
// machine cannot work out, and until somebody types it the room's size is a guess
// — which every part of the pipeline already says in capitals, and so does this.
//
// ONE FINGER, and the phone may be sideways. A hall is wider than it is tall, so
// landscape is asked for and both ways round work. Everything is at the bottom
// edge where a thumb reaches, nothing is smaller than 44 px, and `touch-action:
// none` is on the record button alone — anywhere else it would stop the page
// being scrolled by somebody wearing gloves in a cold building.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildAppSpacePath, buildPublicProjectPath } from '../utils/spaceRouting.js'
import { getServerSpace } from '../services/serverSpaces.js'
import { cameraAim, floorHint } from './deviceAim.js'
import { laplacianVariance, readSharpness, sampleSize } from './sharpness.js'
import { coveredCount, emptyRing, markHeading, ringReading, SECTOR_COUNT } from './sectorRing.js'
import { createUploadQueue } from './uploadQueue.js'
import { createWalkRecorder, pickRecorderMime } from './walkRecorder.js'
import {
    buildReadiness,
    dressSourcesRoom,
    ensureSourcesProject,
    hangCapture,
    scanProgress,
    setMeasuredWall,
    stillName,
    walkPieceName
} from './scanSources.js'
import { getProjectDocument } from '../project/services/projectsApi.js'
import { requestPlaceBuild, readPlaceBuild } from './placeBuildApi.js'
import './scanSurface.css'

const SAMPLE_EVERY_MS = 400
// How many readings the coach looks back over: about twelve seconds, which is
// long enough for a median to mean something and short enough that walking into
// a dark bay changes it.
const READINGS_KEPT = 30

// The camera, asked for at the size the phone will actually give. `ideal` and
// never `exact`: a phone that cannot do 4K must hand over 1080 rather than refuse
// the whole request, and a hall walked at 1080 is a hall, while a hall not walked
// is nothing.
const CAMERA_WANTED = {
    video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 30 }
    },
    audio: false
}

const isPortrait = () => typeof window !== 'undefined' && window.innerHeight > window.innerWidth

export default function ScanSurface({ spaceId }) {
    const videoRef = useRef(null)
    const sampleCanvasRef = useRef(null)
    const stillCanvasRef = useRef(null)
    const streamRef = useRef(null)
    const recorderRef = useRef(null)
    const readingsRef = useRef([])
    const aboveHorizonSinceRef = useRef(null)
    const aimRef = useRef({ heading: null, elevation: null })

    const [cameraProblem, setCameraProblem] = useState('')
    const [cameraReady, setCameraReady] = useState(false)
    const [spaceLabel, setSpaceLabel] = useState('')
    const [sourcesProject, setSourcesProject] = useState('')
    const [setupProblem, setSetupProblem] = useState('')
    const [standing, setStanding] = useState(true)
    const [recording, setRecording] = useState(false)
    // Seconds since Record was pressed. The `walk` figure is read out of the
    // ROOM, so it does not move until a piece has landed — which is up to thirty
    // seconds of a person holding a phone in a hall with nothing telling them
    // anything is happening. This is the one number that has to be live.
    const [recordingSeconds, setRecordingSeconds] = useState(0)
    const [ring, setRing] = useState(emptyRing)
    const [compass, setCompass] = useState('unasked')
    const [sharpFrames, setSharpFrames] = useState(0)
    const [reading, setReading] = useState({ sharpness: 0, floor: 0, sharp: false, hint: '' })
    const [floorSays, setFloorSays] = useState('')
    const [backlog, setBacklog] = useState({ pending: 0, sending: 0, done: 0, failed: 0 })
    const [progress, setProgress] = useState({ walkSeconds: 0, stills: 0, pieces: 0, measuredMetres: null })
    const [measuring, setMeasuring] = useState(false)
    const [metres, setMetres] = useState('')
    const [note, setNote] = useState('')
    const [portrait, setPortrait] = useState(isPortrait)
    const [build, setBuild] = useState(null)
    const [building, setBuilding] = useState(false)
    // The space's real id, once the server has said what it is. Starts as the
    // address segment so nothing waits on a round trip; see the resolve below.
    const [placeSpaceId, setPlaceSpaceId] = useState(spaceId)

    // ── the room this walk fills ──────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        const open = async () => {
            let label = spaceId
            // The segment in the address is not always the space's id — a space
            // can be reached by its slug (`main` answers to `di-iiii`), and both
            // exist on this machine today. The server stems the footage room off
            // the REAL id (spaceIdParam rewrites the param before the build route
            // sees it), so a page that stems it off the segment builds
            // `di-iiii-sources` and the build route then looks for `main-sources`
            // and reports that nothing was collected. Resolve once, here, and
            // stem everything server-facing off the answer.
            let realId = spaceId
            try {
                const space = await getServerSpace(spaceId)
                label = space?.label || spaceId
                realId = space?.id || spaceId
                if (!cancelled) {
                    setSpaceLabel(label)
                    setPlaceSpaceId(realId)
                }
            } catch {
                // A space that will not load is still a space this person was
                // sent to; the name is decoration and the walk is not.
                if (!cancelled) setSpaceLabel(spaceId)
            }
            try {
                const { projectId, created } = await ensureSourcesProject(realId, { label })
                if (cancelled) return
                setSourcesProject(projectId)
                // Only on the way in. A room dressed on every visit would undo
                // an arrival point somebody has since moved.
                if (created) await dressSourcesRoom(projectId)
            } catch (error) {
                if (!cancelled) {
                    setSetupProblem(error?.status === 403 || error?.status === 401
                        ? 'You can look at this space but not add to it. Ask whoever owns it for editing access.'
                        : `Could not open the footage room: ${error?.message || 'unknown'}`)
                }
            }
        }
        void open()
        return () => { cancelled = true }
    }, [spaceId])

    const refreshProgress = useCallback(async (projectId) => {
        const id = projectId || sourcesProject
        if (!id) return
        try {
            const current = await getProjectDocument(id)
            setProgress(scanProgress(current?.document))
        } catch {
            // The count is read again after every capture; one failed read is a
            // stale number on a screen, not a lost picture.
        }
    }, [sourcesProject])

    useEffect(() => {
        if (sourcesProject) void refreshProgress(sourcesProject)
    }, [sourcesProject, refreshProgress])

    // ── the queue that carries the walk up ────────────────────────────────────
    const queue = useMemo(() => createUploadQueue(async (item) => {
        const projectId = item.projectId
        const file = new File([item.blob], item.filename, { type: item.blob.type || 'application/octet-stream' })
        const hung = await hangCapture(projectId, file, { name: item.label, kind: item.kind })
        return hung
    }, { onChange: setBacklog }), [])

    // The count is re-read after every piece lands, so what the button says about
    // "enough to build a room from" is what the room actually holds.
    useEffect(() => {
        if (backlog.done) void refreshProgress()
    }, [backlog.done, refreshProgress])

    // ── the camera ────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : null
        if (!media?.getUserMedia) {
            setCameraProblem('This browser cannot open a camera. Open the page in Chrome or Safari.')
            return undefined
        }
        media.getUserMedia(CAMERA_WANTED)
            .then(async (stream) => {
                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop())
                    return
                }
                streamRef.current = stream
                if (videoRef.current) videoRef.current.srcObject = stream
                setCameraReady(true)
                // EXPOSURE, HELD STILL IF THE PHONE ALLOWS IT. A camera that
                // re-exposes every few steps hands the matcher the same wall at
                // two brightnesses and it reads them as two walls. Almost no
                // phone browser supports this, so it is attempted and never
                // mentioned: a line of text about a setting nobody can change is
                // noise in a hall.
                const [track] = stream.getVideoTracks()
                try {
                    await track?.applyConstraints({ advanced: [{ exposureMode: 'manual' }] })
                } catch {
                    // Not supported here. Nothing is said, because there is
                    // nothing a person could do about it.
                }
            })
            .catch((error) => {
                if (cancelled) return
                setCameraProblem(error?.name === 'NotAllowedError'
                    ? 'The camera is not allowed on this page. Allow it in the address bar, then reload.'
                    : 'No camera answered. Check that nothing else is using it.')
            })
        return () => {
            cancelled = true
            recorderRef.current?.stop()
            streamRef.current?.getTracks().forEach((track) => track.stop())
            streamRef.current = null
        }
    }, [])

    // ── which way the lens points ─────────────────────────────────────────────
    const listenToOrientation = useCallback(() => {
        const onReading = (event) => {
            const aim = cameraAim({
                alpha: event.alpha,
                beta: event.beta,
                gamma: event.gamma,
                compassHeading: typeof event.webkitCompassHeading === 'number' ? event.webkitCompassHeading : null
            })
            aimRef.current = aim
            if (aim.heading !== null) {
                setCompass('reading')
                // Only while recording: the ring is a record of the walk, not of
                // the phone lying on a table before it.
                if (recorderRef.current?.isRecording()) {
                    setRing((current) => markHeading(current, aim.heading))
                }
            }
            if (aim.elevation === null) return
            if (aim.elevation > 0) {
                if (aboveHorizonSinceRef.current === null) aboveHorizonSinceRef.current = Date.now()
            } else {
                aboveHorizonSinceRef.current = null
            }
        }
        // `deviceorientationabsolute` is the one that knows where north is.
        // Plain `deviceorientation` still gives gravity, which is all the floor
        // hint needs, so both are listened to.
        window.addEventListener('deviceorientationabsolute', onReading)
        window.addEventListener('deviceorientation', onReading)
        return () => {
            window.removeEventListener('deviceorientationabsolute', onReading)
            window.removeEventListener('deviceorientation', onReading)
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const Orientation = window.DeviceOrientationEvent
        // iOS will not deliver a single reading until a person taps something.
        // Until they do, the ring says so rather than showing 0/36 as if the
        // walk had covered nothing.
        if (Orientation && typeof Orientation.requestPermission === 'function') {
            setCompass('needs-a-tap')
            return undefined
        }
        if (!Orientation) {
            setCompass('none')
            return undefined
        }
        setCompass('waiting')
        return listenToOrientation()
    }, [listenToOrientation])

    const askForOrientation = useCallback(async () => {
        const Orientation = typeof window !== 'undefined' ? window.DeviceOrientationEvent : null
        if (!Orientation || typeof Orientation.requestPermission !== 'function') return
        try {
            const answer = await Orientation.requestPermission()
            if (answer === 'granted') {
                setCompass('waiting')
                listenToOrientation()
            } else {
                setCompass('refused')
            }
        } catch {
            setCompass('refused')
        }
    }, [listenToOrientation])

    // ── the sharpness clock ───────────────────────────────────────────────────
    useEffect(() => {
        if (!cameraReady) return undefined
        const tick = () => {
            const video = videoRef.current
            const canvas = sampleCanvasRef.current
            if (!video || !canvas) return
            const size = sampleSize(video.videoWidth, video.videoHeight)
            if (!size.width) return
            canvas.width = size.width
            canvas.height = size.height
            const context = canvas.getContext('2d', { willReadFrequently: true })
            if (!context) return
            context.drawImage(video, 0, 0, size.width, size.height)
            let sharpness = 0
            try {
                sharpness = laplacianVariance(context.getImageData(0, 0, size.width, size.height))
            } catch {
                // A canvas the browser will not let us read — nothing measured
                // this tick, and the next one will try again.
                return
            }
            readingsRef.current = [...readingsRef.current, sharpness].slice(-READINGS_KEPT)
            const next = readSharpness(readingsRef.current)
            setReading(next)
            if (next.sharp && recorderRef.current?.isRecording()) {
                setSharpFrames((count) => count + 1)
            }
            const since = aboveHorizonSinceRef.current
            setFloorSays(floorHint(aimRef.current.elevation, since === null ? 0 : Date.now() - since))
        }
        const timer = window.setInterval(tick, SAMPLE_EVERY_MS)
        return () => window.clearInterval(timer)
    }, [cameraReady])

    useEffect(() => {
        if (!recording) {
            setRecordingSeconds(0)
            return undefined
        }
        const startedAt = Date.now()
        const timer = window.setInterval(() => {
            setRecordingSeconds(Math.floor((Date.now() - startedAt) / 1000))
        }, 500)
        return () => window.clearInterval(timer)
    }, [recording])

    useEffect(() => {
        const onResize = () => setPortrait(isPortrait())
        window.addEventListener('resize', onResize)
        window.addEventListener('orientationchange', onResize)
        return () => {
            window.removeEventListener('resize', onResize)
            window.removeEventListener('orientationchange', onResize)
        }
    }, [])

    // ── recording ─────────────────────────────────────────────────────────────
    const toggleRecording = useCallback(() => {
        if (!sourcesProject || !streamRef.current) return
        if (recorderRef.current?.isRecording()) {
            recorderRef.current.stop()
            setRecording(false)
            return
        }
        setStanding(false)
        setNote('')
        const mimeType = pickRecorderMime((mime) => window.MediaRecorder?.isTypeSupported?.(mime))
        let recorder = null
        try {
            recorder = createWalkRecorder({
                stream: streamRef.current,
                mimeType,
                onPiece: (piece) => {
                    queue.add({
                        projectId: sourcesProject,
                        blob: piece.blob,
                        filename: `walk-${String(piece.index).padStart(3, '0')}.${piece.extension}`,
                        label: walkPieceName(piece.index, piece.seconds),
                        kind: 'walk'
                    })
                },
                onProblem: (message) => {
                    setNote(message)
                    setRecording(false)
                }
            })
        } catch (error) {
            setNote(String(error?.message || error))
            return
        }
        recorderRef.current = recorder
        recorder.start()
        setRecording(recorder.isRecording())
    }, [queue, sourcesProject])

    // ── one photograph ────────────────────────────────────────────────────────
    const takeStill = useCallback(async () => {
        if (!sourcesProject) return
        setStanding(false)
        const video = videoRef.current
        const canvas = stillCanvasRef.current
        if (!video || !canvas || !video.videoWidth) {
            setNote('The camera has not started yet.')
            return
        }
        let blob = null
        // ImageCapture.takePhoto gives the SENSOR's full resolution, which on a
        // phone is several times the preview's — and the preview is what the
        // canvas can see. Where it exists it is much the better picture; almost
        // nowhere does, so the canvas is not a fallback so much as the usual path.
        const [track] = streamRef.current?.getVideoTracks?.() || []
        if (typeof window.ImageCapture === 'function' && track) {
            try {
                blob = await new window.ImageCapture(track).takePhoto()
            } catch {
                blob = null
            }
        }
        if (!blob) {
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            canvas.getContext('2d')?.drawImage(video, 0, 0)
            // 0.92 rather than the default: the matcher reads edges, and JPEG
            // throws edges away first. frames.mjs asks ffmpeg for `-qscale:v 2`
            // for the same reason.
            blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
        }
        if (!blob) {
            setNote('That photograph did not come out.')
            return
        }
        const index = (progress.stills || 0) + 1
        queue.add({
            projectId: sourcesProject,
            blob,
            filename: `still-${String(index).padStart(3, '0')}.jpg`,
            label: stillName(index),
            kind: 'still'
        })
    }, [progress.stills, queue, sourcesProject])

    // ── the measured wall ─────────────────────────────────────────────────────
    const submitMeasurement = useCallback(async (event) => {
        event.preventDefault()
        const value = Number(metres)
        if (!Number.isFinite(value) || value <= 0) {
            setNote('Type the length in metres — 8.3, not "about eight".')
            return
        }
        try {
            await setMeasuredWall(sourcesProject, value)
            // The picture of the wall that was measured goes up too, so the
            // number can be checked against the thing afterwards.
            await takeStill()
            setMeasuring(false)
            setMetres('')
            setNote('')
            await refreshProgress()
        } catch (error) {
            setNote(`Could not write the measurement: ${error?.message || 'unknown'}`)
        }
    }, [metres, refreshProgress, sourcesProject, takeStill])

    // ── making the hall ───────────────────────────────────────────────────────
    const readiness = buildReadiness(progress)

    useEffect(() => {
        let cancelled = false
        const look = async () => {
            try {
                const state = await readPlaceBuild(placeSpaceId)
                if (!cancelled) setBuild(state)
            } catch {
                if (!cancelled) setBuild(null)
            }
        }
        void look()
        // Only while something is running: a phone in a hall should not poll a
        // route that answered "nothing here" for the whole walk.
        if (!build || build.status === 'running') {
            const timer = window.setInterval(look, 5000)
            return () => { cancelled = true; window.clearInterval(timer) }
        }
        return () => { cancelled = true }
    }, [placeSpaceId, build?.status]) // eslint-disable-line react-hooks/exhaustive-deps

    const makeTheHall = useCallback(async () => {
        setBuilding(true)
        setNote('')
        try {
            const started = await requestPlaceBuild(placeSpaceId, { scaleEdge: progress.measuredMetres })
            setBuild(started)
        } catch (error) {
            // 404 — this server does not build. 403 — it does, but only for a
            // browser on the machine itself, which a PHONE never is: the whole
            // surface is a phone surface, so without this the most likely
            // refusal of all printed a developer's sentence about loopback.
            // Both are the same news to the person holding it — the walk is
            // safe, the room gets made elsewhere — and neither is a fault.
            setNote(error?.status === 404 || error?.status === 403
                ? 'The copy is built on the studio machine. The footage is safe here — open this space on the machine that runs the pipeline and press this again.'
                : `Could not start the build: ${error?.message || 'unknown'}`)
        } finally {
            setBuilding(false)
        }
    }, [progress.measuredMetres, placeSpaceId])

    // ── the screen ────────────────────────────────────────────────────────────
    const covered = coveredCount(ring)
    const ringSays = ringReading(ring)
    const coaching = floorSays || reading.hint || ringSays.hint
    const waiting = backlog.pending + backlog.sending
    const sourcesHref = sourcesProject ? buildPublicProjectPath(spaceId, sourcesProject) : null

    if (cameraProblem) {
        return (
            <div className="scan scan-blocked">
                <div className="scan-card">
                    <p className="scan-card-eyebrow">scanning {spaceLabel || spaceId}</p>
                    <p className="scan-card-line">{cameraProblem}</p>
                    <a className="scan-btn scan-btn-quiet" href={buildAppSpacePath(spaceId)}>Back to the space</a>
                </div>
            </div>
        )
    }

    return (
        <div className={`scan${recording ? ' scan-live' : ''}`}>
            <video
                ref={videoRef}
                className="scan-view"
                autoPlay
                muted
                playsInline
            />
            <canvas ref={sampleCanvasRef} className="scan-hidden" />
            <canvas ref={stillCanvasRef} className="scan-hidden" />

            <header className="scan-top">
                <span className="scan-where">
                    <span className="scan-eyebrow">scanning</span>
                    <span className="scan-place">{spaceLabel || spaceId}</span>
                </span>
                <a className="scan-out" href={buildAppSpacePath(spaceId)} aria-label="Leave scanning">✕</a>
            </header>

            {portrait && (
                <p className="scan-turn">Turn the phone sideways — a hall is wider than it is tall.</p>
            )}

            {setupProblem && <p className="scan-note scan-note-bad">{setupProblem}</p>}

            <section className="scan-readings" aria-live="polite">
                <div className="scan-ring" role="img" aria-label={`${covered} of ${SECTOR_COUNT} directions covered`}>
                    {ring.map((filled, sector) => (
                        <i
                            key={sector}
                            className={`scan-ring-mark${filled ? ' is-covered' : ''}`}
                            style={{ transform: `rotate(${sector * (360 / SECTOR_COUNT)}deg) translateY(-50%)` }}
                        />
                    ))}
                </div>
                <dl className="scan-figures">
                    <div className="scan-figure">
                        <dt>directions covered</dt>
                        <dd>
                            {compass === 'reading' || compass === 'waiting'
                                ? `${covered}/${SECTOR_COUNT}`
                                : '—'}
                        </dd>
                    </div>
                    <div className="scan-figure">
                        <dt>sharp frames</dt>
                        <dd>{sharpFrames}</dd>
                    </div>
                    <div className={`scan-figure${recording ? ' is-live' : ''}`}>
                        <dt>{recording ? 'recording' : 'walk'}</dt>
                        <dd>{recording ? recordingSeconds : Math.round(progress.walkSeconds)} s</dd>
                    </div>
                    <div className="scan-figure">
                        <dt>photographs</dt>
                        <dd>{progress.stills}</dd>
                    </div>
                </dl>
                {compass === 'needs-a-tap' && (
                    <button className="scan-btn scan-btn-quiet scan-compass-ask" type="button" onClick={askForOrientation}>
                        Let the page read the compass
                    </button>
                )}
                {compass === 'refused' && <p className="scan-small">No compass, so no ring of directions. Everything else works.</p>}
                {compass === 'none' && <p className="scan-small">This phone reports no orientation, so there is no ring of directions.</p>}
                {coaching && <p className="scan-coach">{coaching}</p>}
                {waiting > 0 && (
                    <p className="scan-small">{waiting} {waiting === 1 ? 'piece' : 'pieces'} still going up</p>
                )}
                {backlog.failed > 0 && (
                    <button className="scan-btn scan-btn-quiet" type="button" onClick={() => queue.retryFailed()}>
                        {backlog.failed} {backlog.failed === 1 ? 'piece' : 'pieces'} did not send — try again
                    </button>
                )}
                {progress.measuredMetres
                    ? <p className="scan-small">wall · {progress.measuredMetres.toFixed(2)} m — the size is measured</p>
                    : <p className="scan-small scan-small-warn">Nobody has measured a wall yet, so the room’s size will be a GUESS.</p>}
            </section>

            {/* ONE column at the bottom, in reading order. These were five
                absolutely-positioned layers stacked by hand against
                `bottom: calc(… + … + …)`, and at 390x844 they overlapped: the
                footage-room link landed on top of "Understood" and swallowed its
                taps. Playwright named the intercepting element; looking at the
                page would not have. */}
            <div className="scan-foot">
                {standing && !setupProblem && (
                    <div className="scan-standing">
                        <p className="scan-standing-head">Before you start</p>
                        <ul className="scan-standing-list">
                            <li>Walk slowly. Slower than feels right.</li>
                            <li>Keep the floor in the picture — it is what stands the room up.</li>
                            <li>Circle every pillar, all the way round.</li>
                            <li>Nobody in the shot.</li>
                        </ul>
                        <button className="scan-btn scan-btn-quiet" type="button" onClick={() => setStanding(false)}>
                            Understood
                        </button>
                    </div>
                )}

                {measuring && (
                    <form className="scan-measure" onSubmit={submitMeasurement}>
                        <label className="scan-measure-label" htmlFor="scan-metres">
                            One wall, measured with a tape. In metres.
                        </label>
                        <input
                            id="scan-metres"
                            className="scan-measure-input"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0.1"
                            placeholder="8.3"
                            value={metres}
                            onChange={(event) => setMetres(event.target.value)}
                        />
                        <p className="scan-small">
                            Point the camera at that wall — the photograph goes up with the number, so it can be checked later.
                        </p>
                        <div className="scan-measure-actions">
                            <button className="scan-btn" type="submit">Save and photograph it</button>
                            <button className="scan-btn scan-btn-quiet" type="button" onClick={() => setMeasuring(false)}>Not now</button>
                        </div>
                    </form>
                )}

                {note && <p className="scan-note">{note}</p>}

                <section className="scan-after">
                    {sourcesHref && (
                        <a className="scan-btn scan-btn-quiet" href={sourcesHref}>See the footage room</a>
                    )}
                    {build?.status === 'running' && (
                        <p className="scan-small">Building the hall — {build.step || 'starting'}{Number.isFinite(build.minutes) ? `, ${build.minutes} min so far` : ''}</p>
                    )}
                    {build?.status === 'done' && (
                        <a className="scan-btn" href={buildPublicProjectPath(spaceId, build.hallProject || `${placeSpaceId}-hall`)}>Walk the hall</a>
                    )}
                    {build?.status === 'failed' && (
                        <p className="scan-note scan-note-bad">The build stopped: {build.error || 'no reason given'}</p>
                    )}
                    {(!build || build.status === 'idle' || build.status === 'failed') && (
                        readiness.ready
                            ? (
                                <button className="scan-btn" type="button" onClick={makeTheHall} disabled={building}>
                                    {building ? 'Starting…' : 'Make the hall'}
                                </button>
                            )
                            : <p className="scan-small">Make the hall once there is {readiness.missing}.</p>
                    )}
                </section>

                {/* The bar is LAST, because it is nearest the thumb. Everything
                    else in this column reads above it. */}
                <footer className="scan-bar">
                    <button
                        className="scan-btn scan-btn-wide"
                        type="button"
                        onClick={takeStill}
                        disabled={!cameraReady || !sourcesProject}
                    >Photograph</button>
                    <button
                        className={`scan-record${recording ? ' is-recording' : ''}`}
                        type="button"
                        onClick={toggleRecording}
                        disabled={!cameraReady || !sourcesProject}
                        aria-label={recording ? 'Stop the walk' : 'Start the walk'}
                    >
                        <span className="scan-record-mark" />
                    </button>
                    <button
                        className="scan-btn scan-btn-wide"
                        type="button"
                        onClick={() => setMeasuring((open) => !open)}
                        disabled={!sourcesProject}
                    >Measure a wall</button>
                </footer>
            </div>
        </div>
    )
}
