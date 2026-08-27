import { useEffect, useRef, useState } from 'react'
import MapTestPattern from './mapTestPattern.jsx'
import { buildPublicProjectPath } from '../utils/spaceRouting.js'
import { createPreviewBootQueue } from '../utils/previewBootQueue.js'

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

export default function MapSourceView({ surface, spaceId = '', live = true, label = '' }) {
    const [width, height] = surface.resolution
    const kind = surface.source?.kind || 'test'
    const ref = surface.source?.ref || ''

    if (kind === 'colour') {
        return <div className="map-source-fill" style={{ background: ref || '#ffffff' }} />
    }

    if (kind === 'test' || (!ref && kind !== 'project')) {
        return <MapTestPattern pattern={kind === 'test' ? (ref || 'grid') : 'grid'} width={width} height={height} label={label} />
    }

    if (kind === 'image') {
        return <img className="map-source-media" src={ref} alt="" draggable="false" />
    }

    if (kind === 'video') {
        // muted is not a style choice: a wall plays several things at once and
        // autoplay is refused outright for anything with sound.
        return (
            <video
                className="map-source-media"
                src={ref}
                autoPlay
                loop
                muted
                playsInline
                disablePictureInPicture
            />
        )
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

// One page surface: waits for a boot slot, then mounts its iframe.
function MapPageSource({ src, isProject, label, width, height }) {
    const [booting, setBooting] = useState(true)
    const releaseRef = useRef(null)

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
            src={src}
            title={label || 'Surface source'}
            onLoad={() => releaseRef.current?.()}
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
