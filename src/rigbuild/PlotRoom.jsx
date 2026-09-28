import { Component, useMemo, useRef, useState } from 'react'
import { createXRStore } from '@react-three/xr'
import StudioViewport from '../studio/components/StudioViewport.jsx'
import { roomCameraFor } from './plotGeometry.js'

// THE ROOM BESIDE THE PLOT — the Studio's own viewport on the same document, not a
// renderer of our own (docs/architecture/RIG_BUILD.md §10). The plot's selection is
// the room's selection (the Studio's highlight boxes it), and a click in the room
// selects on the plan. Navigate only: moving things is the plan's job, so the
// gizmos stay off.
//
// The camera opens on the rig from the audience side (the far end of what is
// rigged, looking back at it from above), then it is the viewer's to orbit.
// The room is WebGL; the plan is not. A browser that gives no WebGL context (or loses
// it) must still get the plan, so the room fails alone, and says so.
class RoomBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { failed: null }
    }

    static getDerivedStateFromError(error) {
        return { failed: String(error?.message || error || 'no WebGL') }
    }

    render() {
        if (this.state.failed) {
            return (
                <div className="rigplot-room rigplot-room--empty" role="note">
                    <span>the room needs WebGL, which this browser did not give — the plan works without it</span>
                </div>
            )
        }
        return this.props.children
    }
}

export default function PlotRoom(props) {
    return <RoomBoundary><RoomView {...props} /></RoomBoundary>
}

function RoomView({ document, selectedIds = [], onSelect, extent, venueExtent = null }) {
    const controlsRef = useRef(null)
    const xrStore = useMemo(() => createXRStore({ offerSession: false, emulate: false }), [])
    // The first extent frames the room; later edits do not throw the camera around.
    const [camera] = useState(() => (extent ? roomCameraFor(extent, venueExtent, typeof window !== 'undefined' && window.innerHeight > window.innerWidth) : null))
    return (
        <div className="rigplot-room" aria-label="The room, the same selection">
            <StudioViewport
                document={document}
                selectedEntityId={selectedIds.at(-1) || null}
                selectedEntityIds={selectedIds}
                onSelectEntity={(id) => onSelect?.(id || null, false)}
                onToggleSelectEntity={(id) => onSelect?.(id, true)}
                cameraView={camera}
                controlsRef={controlsRef}
                xrStore={xrStore}
                editMode="navigate"
                showChrome={false}
            />
            <span className="rigplot-room__label">room · same selection</span>
        </div>
    )
}
