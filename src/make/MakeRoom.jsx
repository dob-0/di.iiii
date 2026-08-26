import { useEffect, useMemo, useRef, useState } from 'react'
import RawViewport from '../raw/components/RawViewport.jsx'
import { fovForAspect, frameForAspect } from './makeFraming.js'

// THE ROOM, FRAMED FOR THE SCREEN IT IS ON.
//
// RawViewport unchanged — the same renderer Raw uses, the same one the public
// projector route uses, reading the same document. This wrapper does one job:
// measure the space the canvas actually got and hand the viewport a lens and a
// standing-back distance that suit it. See makeFraming.js for why.
//
// The framed view is memoised on the SAVED view and the aspect, never on the
// whole document, and that matters: `target` is read by OrbitControls on every
// render, so a fresh array on every entity edit would yank the camera back to
// centre each time a child added a shape. Here the array identity only changes
// when the framing genuinely does.

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
    const framedView = useMemo(() => frameForAspect(savedView, aspect), [savedView, aspect])

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
        worldState: { ...(projectDocument?.worldState || {}), savedView: framedView }
    }), [projectDocument, uncagedWorkspace, framedView])

    return (
        <div className="make-room" ref={shellRef}>
            <RawViewport
                document={framedDocument}
                scopeId={null}
                selectedEntityId={selectedId}
                selectedNodeId={null}
                onSelectEntity={onSelectEntity}
                onClearSelection={onClearSelection}
                cameraFov={fovForAspect(aspect)}
                showEmptyHint={false}
                showSelectionPills
                interactive
            />
        </div>
    )
}
