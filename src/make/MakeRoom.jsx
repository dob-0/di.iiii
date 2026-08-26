import { useEffect, useMemo, useRef, useState } from 'react'
import RawViewport from '../raw/components/RawViewport.jsx'
import { contentBounds, fitToContent, savedViewFromFit } from './makeFraming.js'

// THE ROOM, FRAMED FOR THE SCREEN IT IS ON.
//
// RawViewport unchanged — the same renderer Raw uses, the same one the public
// projector route uses, reading the same document. This wrapper does three
// things and none of them touch the project:
//
//   1. Measures the space the canvas actually got, and fits the camera to the
//      box the room's contents occupy (makeFraming.js). Re-fits when the phone
//      is turned and when a child adds something the current shot does not
//      hold.
//   2. Hands the viewport a calm ground and a soft horizon in place of Raw's
//      black-and-white technical grid.
//   3. Uncages the view, so the room can be turned.
//
// Everything above is done to a COPY of the document. The project keeps its own
// saved view, its own background, its own grid and its own camera node, and a
// mentor opening the same project in Raw sees exactly what they authored.

// Warm, and deliberately close to the name prompt's paper rather than to Raw's
// cyan-on-black. Two tones only: the ground a shade deeper than the sky, so the
// horizon exists without a line being drawn anywhere.
const MAKE_AMBIENCE = {
    sky: '#EFE7DA',
    ground: '#DED2BE',
    fogNear: 10,
    fogFar: 46,
    shadowOpacity: 0.26,
    shadowColor: '#5B5040'
}

// How much the content box has to move before the camera is allowed to follow.
// Zero would re-fit on every sync tick — the document's identity changes
// whenever anybody types anywhere — and a camera that drifts under a child's
// thumb reads as the surface losing their place.
const REFIT_EPSILON = 0.35

const boundsSignature = (bounds) => (
    [...bounds.min, ...bounds.max].map((n) => Math.round(n / REFIT_EPSILON)).join(',')
)

export default function MakeRoom({ projectDocument, selectedId, onSelectEntity, onClearSelection }) {
    const shellRef = useRef(null)
    const [aspect, setAspect] = useState(() => (
        typeof window === 'undefined' ? 1 : window.innerWidth / Math.max(1, window.innerHeight)
    ))

    useEffect(() => {
        const element = shellRef.current
        if (!element) return undefined
        const measure = () => {
            const { width, height } = element.getBoundingClientRect()
            if (!width || !height) return
            // Bucketed to two decimals. A phone's address bar sliding away
            // changes the height by a pixel at a time, and re-framing the room
            // under a child's thumb every one of those pixels is worse than
            // being slightly wrong.
            setAspect((current) => {
                const next = Math.round((width / height) * 100) / 100
                return next === current ? current : next
            })
        }
        measure()
        const observer = new window.ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    const savedView = projectDocument?.worldState?.savedView || null
    const bounds = useMemo(() => contentBounds(projectDocument), [projectDocument])
    const signature = `${boundsSignature(bounds)}|${aspect}`

    const fit = useMemo(
        () => fitToContent(projectDocument, aspect),
        // Only when the framing genuinely changes. `projectDocument` is read
        // inside, but its identity changes on every sync tick and re-fitting on
        // those is the drift this guards against.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [signature]
    )

    // The view RawViewport reads when it creates the renderer. Frozen at the
    // first fit: the Canvas reads its `camera` prop exactly once, and every
    // later re-frame goes through `viewRequest` instead. Freezing it also keeps
    // the array identities stable, which matters — OrbitControls re-applies its
    // `target` prop whenever that array is new, and a target re-applied on
    // every sync tick would yank the room back mid-drag.
    const [mountView] = useState(() => savedViewFromFit(savedView, fit))

    // `distance` and `elevation` travel with the request so a re-frame can be
    // rebuilt around whichever way the child has already turned the room —
    // RawViewport's applier reads the live bearing off the camera and keeps it.
    const viewRequest = useMemo(() => ({
        key: signature,
        target: fit.target,
        position: fit.position,
        fov: fit.fov,
        distance: fit.distance,
        elevation: fit.elevation
    }), [signature, fit])

    // UNCAGE THE VIEW — in the copy handed to the viewport, never in the project.
    //
    // Every camp project carries a `world.camera` node, marked active in
    // `workspaceState.activeNodeIdByTypeScope`. RawViewport honours that by
    // leaving OrbitControls unmounted, because an authored eye and an orbit
    // control would fight over the same camera every frame. That is right for a
    // show and wrong for a workbench: measured on the real `team-3` document,
    // a child got one fixed shot, framed on a laptop in landscape, that they
    // could not turn, tilt or back out of — you cannot make a room you are not
    // allowed to walk around.
    //
    // Dropping ONE key from a copy of the workspace state is the smallest thing
    // that undoes it. The camera node itself is untouched: it stays in the
    // document, stays in the room as the piece of furniture a mentor placed,
    // and still owns the shot in Raw, in the projector route and on the
    // published page — every surface whose job is to SHOW the room rather than
    // to build it.
    const uncagedWorkspace = useMemo(() => {
        const workspace = projectDocument?.workspaceState || {}
        const active = workspace.activeNodeIdByTypeScope || {}
        const keys = Object.keys(active).filter((key) => key.startsWith('world.camera::'))
        if (!keys.length) return workspace
        const next = { ...active }
        for (const key of keys) delete next[key]
        return { ...workspace, activeNodeIdByTypeScope: next }
    }, [projectDocument?.workspaceState])

    const framedDocument = useMemo(() => ({
        ...projectDocument,
        workspaceState: uncagedWorkspace,
        worldState: { ...(projectDocument?.worldState || {}), savedView: mountView }
    }), [projectDocument, uncagedWorkspace, mountView])

    return (
        <div className="make-room" ref={shellRef}>
            <RawViewport
                document={framedDocument}
                scopeId={null}
                selectedEntityId={selectedId}
                selectedNodeId={null}
                onSelectEntity={onSelectEntity}
                onClearSelection={onClearSelection}
                cameraFov={fit.fov}
                ambience={MAKE_AMBIENCE}
                viewRequest={viewRequest}
                showEmptyHint={false}
                showSelectionPills
                interactive
            />
        </div>
    )
}
