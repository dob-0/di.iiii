import { useEffect, useRef, useState } from 'react'
import MapTestPattern from './mapTestPattern.jsx'
import { startMotionGlow } from './motionGlow.js'
import { useTopNetwork } from '../project/tops/useTopNetwork.js'
import { buildPublicProjectPath } from '../utils/spaceRouting.js'
import { createPreviewBootQueue } from '../utils/previewBootQueue.js'
import { PREVIEW_READY_MESSAGE } from '../utils/previewMode.js'
import { mountRelativeApiUrl } from '../services/assetSources.js'
import { useRetryingMedia } from './useRetryingMedia.js'

// A brought-in file's ref is recorded exactly as the manifest stores it — a
// project-relative `/api/projects/.../assets/...` path, written once and read
// on whichever machine opens the mapping next. Each machine mounts it onto
// its OWN deployed API base at render time; used verbatim, a path written on
// one host 404s (or hits the SPA fallback) on every other one. A typed web
// address is already absolute and is returned untouched.
export const resolveMapSourceRef = (ref = '') => mountRelativeApiUrl(ref) || ref

// One surface's content, unwarped. Everything here draws into a plain
// width x height box at the surface's own resolution; the corner-pin above it
// does the geometry. Nothing in this file knows the wall exists.
//
// WHY A PROJECT IS AN IFRAME AND NOT A MOUNTED SCENE
//
// The first build mounted <LiveProjectScene> directly. It rendered — at about
// a third of its surface, anchored top-left. @react-three/fiber sizes its
// drawing surface from getBoundingClientRect(), and a rect measured under a
// corner-pin is the TRANSFORMED rect: a 1600x900 surface pinned into a 509x208
// patch of wall made a 509x208 canvas and then laid it out inside the
// untransformed 1600x900 box.
//
// An iframe has its own layout viewport, so the page inside it is laid out at
// the surface's real size and the transform scales the finished picture as one
// piece. It is also what the platform already does for a project in a box —
// SpaceHub's space cards embed `?preview=1` for its static camera, absent
// chrome and low-power render loop — and it collapses project and url onto one
// code path, which is one fewer thing to be wrong about on a show night.
const projectPreviewUrl = (spaceId, projectId) =>
    `${buildPublicProjectPath(spaceId, projectId)}?preview=1`

// Page surfaces boot through a queue. Five project surfaces asked to start at
// the same moment ALL stalled on "Loading live experience" and the output
// stayed black indefinitely; one at a time they are up in seconds. Measured on
// the real output route, not reasoned about.
const requestSurfaceBoot = createPreviewBootQueue()

// A page that never fires `load` must not hold the queue shut behind it — the
// surfaces after it would never start at all. The slot is given back either
// way; a slow page keeps loading, it just stops blocking its neighbours.
const BOOT_SLOT_TIMEOUT_MS = 15000

export default function MapSourceView({ surface, spaceId = '', live = true, network = null, label = '' }) {
    const [width, height] = surface.resolution
    const kind = surface.source?.kind || 'test'
    const ref = surface.source?.ref || ''

    if (kind === 'colour') {
        return <div className="map-source-fill" style={{ background: ref || '#ffffff' }} />
    }

    if (kind === 'network') {
        if (!ref) return <MapSourcePlaceholder label={label} detail="no Picture Out chosen" width={width} height={height} />
        // Off the output, a network runs only when Live is on — the desk and
        // the wall would otherwise each open the camera and run every operator.
        if (!live) return <MapSourcePlaceholder label={label} detail="pictures — turn Live on to run them here" width={width} height={height} />
        return <MapNetworkSource network={network} spaceId={spaceId} outNodeId={ref} label={label} width={width} height={height} />
    }

    if (kind === 'camera') {
        return <MapCameraSource deviceId={ref} effect={surface.effect} label={label} width={width} height={height} />
    }

    // Only the kinds that are MEANINGLESS without a reference fall back to a
    // test pattern. An earlier version tested `!ref` against everything, which
    // quietly swallowed the ordinary camera surface — kind 'camera' with an
    // empty ref IS the default camera, not an unfinished surface — and made
    // that whole branch unreachable.
    if (kind === 'test' || (!ref && ['url', 'video', 'image'].includes(kind))) {
        return <MapTestPattern pattern={kind === 'test' ? (ref || 'grid') : 'grid'} width={width} height={height} label={label} />
    }

    if (kind === 'image') {
        return <MapImageSource fileRef={ref} />
    }

    if (kind === 'video') {
        return <MapVideoSource fileRef={ref} />
    }

    if (kind === 'project' && !ref) {
        return <MapSourcePlaceholder label={label} detail="no project chosen" width={width} height={height} />
    }

    if (kind === 'project' || kind === 'url') {
        // Off the output, a page surface stays a card unless Live is on: the
        // desk and the wall would otherwise each run every source, and the
        // wall is the one that matters. Geometry gets aligned against a test
        // pattern anyway, which is what test patterns are for.
        if (!live) {
            return <MapSourcePlaceholder label={label} detail={ref} width={width} height={height} />
        }
        const isProject = kind === 'project'
        const src = isProject ? projectPreviewUrl(spaceId, ref) : ref
        return (
            <MapPageSource
                src={src}
                isProject={isProject}
                label={label}
                width={width}
                height={height}
            />
        )
    }

    return <MapSourcePlaceholder label={label} detail={kind} width={width} height={height} />
}

// A brought-in image. `key={attempt}` is what actually retries: the src stays
// the same content address, so only remounting the element makes the browser
// ask again. Nothing else changes while it is failing — no placeholder, no
// text — the element itself is what MapSourceView already shows for a source
// that has not loaded yet, and a wall must never go white or gain new text.
function MapImageSource({ fileRef }) {
    const { attempt, onError, onLoaded } = useRetryingMedia(fileRef)
    return (
        <img
            key={attempt}
            className="map-source-media"
            src={resolveMapSourceRef(fileRef)}
            alt=""
            draggable="false"
            onError={onError}
            onLoad={onLoaded}
        />
    )
}

// A brought-in video. Same retry as the image above. muted is not a style
// choice: a wall plays several things at once and autoplay is refused
// outright for anything with sound.
function MapVideoSource({ fileRef }) {
    const { attempt, onError, onLoaded } = useRetryingMedia(fileRef)
    return (
        <video
            key={attempt}
            className="map-source-media"
            src={resolveMapSourceRef(fileRef)}
            autoPlay
            loop
            muted
            playsInline
            disablePictureInPicture
            onError={onError}
            onLoadedData={onLoaded}
        />
    )
}

// A camera, on the wall. The room beside the work, or the work being made.
//
// The stream is opened by THIS component rather than shared, because a surface
// can be switched off and on and must not leave a camera light burning; the
// track is stopped on unmount. A refused or missing camera shows the reason on
// the surface instead of going black, because a black rectangle on a wall is
// indistinguishable from a mapping mistake.
function MapCameraSource({ deviceId, effect = null, label, width, height }) {
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const glowRef = useRef(null)
    const [problem, setProblem] = useState('')
    const motion = effect?.kind === 'motion'

    useEffect(() => {
        let stream = null
        let cancelled = false
        const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : null
        if (!media?.getUserMedia) {
            setProblem('no camera access in this browser')
            return undefined
        }
        setProblem('')
        media.getUserMedia({
            video: deviceId ? { deviceId: { exact: deviceId } } : true,
            audio: false
        })
            .then((result) => {
                if (cancelled) {
                    result.getTracks().forEach((track) => track.stop())
                    return
                }
                stream = result
                if (videoRef.current) videoRef.current.srcObject = result
            })
            .catch((error) => {
                if (!cancelled) setProblem(error?.name === 'NotAllowedError' ? 'camera not permitted' : 'camera unavailable')
            })
        return () => {
            cancelled = true
            if (stream) stream.getTracks().forEach((track) => track.stop())
        }
    }, [deviceId])

    // The glow runs while the effect is on; its knobs change without restarting
    // it, so dragging a slider on the desk never blinks the wall.
    useEffect(() => {
        if (!motion || !canvasRef.current || !videoRef.current) return undefined
        try {
            glowRef.current = startMotionGlow({ canvas: canvasRef.current, video: videoRef.current, params: effect })
        } catch (error) {
            setProblem(String(error?.message || error))
            return undefined
        }
        return () => {
            glowRef.current?.stop()
            glowRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [motion, width, height])

    useEffect(() => {
        glowRef.current?.setParams({ threshold: effect?.threshold, trail: effect?.trail, gain: effect?.gain })
    }, [effect?.threshold, effect?.trail, effect?.gain])

    if (problem) return <MapSourcePlaceholder label={label} detail={problem} width={width} height={height} />
    // One <video> in the same place either way: switching the effect on must
    // not remount it, or it loses the stream the effect above attached. With
    // the glow on it still has to PLAY for its frames to reach the GPU — it is
    // just not what the wall sees. Processed at up to 640 wide; the corner-pin
    // scales the result, and an old laptop keeps its frame rate.
    const scale = Math.min(1, 640 / width)
    return (
        <>
            <video className={motion ? 'map-source-hidden-video' : 'map-source-media'} ref={videoRef} autoPlay muted playsInline />
            {motion ? (
                <canvas
                    className="map-source-media"
                    ref={canvasRef}
                    width={Math.max(1, Math.round(width * scale))}
                    height={Math.max(1, Math.round(height * scale))}
                />
            ) : null}
        </>
    )
}

// The project's picture operators, run on this page and drawn from one Picture
// Out. Processed at up to 640 wide like the camera glow; the corner-pin scales
// the result onto the wall.
const NO_NETWORK = { nodes: [], wires: [] }

function MapNetworkSource({ network, spaceId, outNodeId, label, width, height }) {
    const [canvas, setCanvas] = useState(null)
    const scale = Math.min(1, 640 / width)
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const present = Boolean(network?.nodes?.some((node) => node.id === outNodeId))
    // Nothing to show → nothing to run; an empty network starts no engine.
    const { error } = useTopNetwork({ network: present ? network : NO_NETWORK, spaceId, canvas, show: outNodeId, width: w, height: h })
    if (!present) return <MapSourcePlaceholder label={label} detail="that Picture Out is gone" width={width} height={height} />
    if (error) return <MapSourcePlaceholder label={label} detail={error} width={width} height={height} />
    return <canvas className="map-source-media" ref={setCanvas} width={w} height={h} />
}

// One page surface: waits for a boot slot, then mounts its iframe.
function MapPageSource({ src, isProject, label, width, height }) {
    const [booting, setBooting] = useState(true)
    const releaseRef = useRef(null)
    const frameRef = useRef(null)

    // A PROJECT surface is our own page in preview mode, so it can say when it
    // has actually painted — `load` fires on the shell HTML, seconds before
    // the scene is anywhere, which is what let the whole wall boot at once.
    // A URL surface is somebody else's page and can only ever offer `load`.
    useEffect(() => {
        if (booting || !isProject) return undefined
        const onMessage = (event) => {
            if (event.origin !== window.location.origin) return
            if (event.data?.type !== PREVIEW_READY_MESSAGE) return
            if (event.source !== frameRef.current?.contentWindow) return
            releaseRef.current?.()
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [booting, isProject])

    useEffect(() => {
        setBooting(true)
        let timer = null
        const release = requestSurfaceBoot(() => {
            setBooting(false)
            timer = setTimeout(() => releaseRef.current?.(), BOOT_SLOT_TIMEOUT_MS)
        })
        releaseRef.current = release
        return () => {
            clearTimeout(timer)
            release()
            releaseRef.current = null
        }
    }, [src])

    if (booting) return <MapSourcePlaceholder label={label} detail="waiting to start" width={width} height={height} />

    return (
        <iframe
            className="map-source-frame"
            ref={frameRef}
            src={src}
            title={label || 'Surface source'}
            onLoad={isProject ? undefined : () => releaseRef.current?.()}
                // A PROJECT surface is our own page on our own origin, and it
                // is not sandboxed. `allow-scripts allow-same-origin` on a
                // same-origin frame is the combination the browser itself
                // warns means nothing — and it cost something real: the app
                // inside booted, could not reach its own session, and sat on
                // "Loading live experience" forever while the wall stayed
                // black. Seen, not reasoned about.
                //
                // A URL surface is somebody else's page and keeps the sandbox.
                // allow-same-origin there hands THAT page its own origin back,
                // never ours, and without it a three.js page cannot read its
                // own assets and projects black.
            sandbox={isProject ? undefined : 'allow-scripts allow-same-origin'}
            referrerPolicy={isProject ? 'same-origin' : 'no-referrer'}
            allow="autoplay; fullscreen; xr-spatial-tracking"
            scrolling="no"
        />
    )
}

export function MapSourcePlaceholder({ label = '', detail = '', width = 1280, height = 720 }) {
    // Sized in SOURCE pixels, like the test patterns: a placeholder is drawn
    // into the surface's own box and then pinned, so a fixed CSS size would
    // shrink to nothing on a surface that lands small on the wall.
    const scale = Math.min(width, height)
    return (
        <div className="map-source-placeholder" style={{ width, height }}>
            <span
                className="map-source-placeholder-label"
                style={{ fontSize: Math.max(18, Math.round(scale / 9)) }}
            >
                {label || 'Surface'}
            </span>
            {detail ? (
                <span
                    className="map-source-placeholder-detail"
                    style={{ fontSize: Math.max(11, Math.round(scale / 26)) }}
                >
                    {detail}
                </span>
            ) : null}
        </div>
    )
}
