import { Component, Suspense, lazy } from 'react'

// ROOM 3D — a small, read-only picture of the project's room inside the Perform
// desk, beside the deck's own PREVIEW and OUTPUT. A NATIVE block (the same React
// tree on the same document), never a framed page: a sandboxed frame of a
// di.iiii page breaks module loading in Firefox (known 2026-09-03; see
// PerformWindows.jsx).
//
// The room itself is the room page's own scene, reused unchanged:
// PublicProjectSceneSurface (src/project/components) in its thumbnail mode. That
// mode is the safe one for a live desk: Quality Low document, no controls or
// chrome, no walking, no timelines, one pixel per pixel, frames drawn on
// demand once the scene has settled. See RoomWindowScene.jsx.
//
// Two guards, because this sits on a deck that is being played:
//   · a project with no 3D (no entities) mounts NO scene, and says so in one line;
//   · the scene is behind a boundary and a lazy import, so a missing WebGL, a lost
//     chunk or a thrown scene shows one line here and never takes the deck down.
// Plain React.lazy, not lazyWithReload: that one reloads the whole page when a
// chunk is missing, which the deck must never do in the middle of a set.

const RoomWindowScene = lazy(() => import('./RoomWindowScene.jsx'))

function Line({ children, title, tone = '' }) {
    return (
        <div className="perform-pane perform-room" data-room="message">
            <p className={`perform-status${tone ? ` is-${tone}` : ''}`} title={title} role="status">{children}</p>
        </div>
    )
}

class RoomBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { failed: false }
    }

    static getDerivedStateFromError() {
        return { failed: true }
    }

    componentDidCatch(error) {
        // One line in the console, for whoever asks why the tile is dim.
        try { console.warn('[perform] Room 3D could not draw:', error?.message || error) } catch { /* no console */ }
    }

    render() {
        if (this.state.failed) {
            return <Line tone="danger" title="The 3D room could not start here (no WebGL, or the scene failed). The deck is not affected.">NO 3D HERE</Line>
        }
        return this.props.children
    }
}

export default function RoomWindow({ ctx }) {
    const document = ctx?.document
    const hasRoom = Array.isArray(document?.entities) && document.entities.length > 0
    if (!hasRoom) {
        return <Line title="This project holds no 3D objects, so there is no room to draw.">NO ROOM</Line>
    }
    return (
        <div className="perform-pane perform-pane--flush perform-room" data-room="scene">
            <RoomBoundary key={ctx.projectId || 'room'}>
                <Suspense fallback={<Line>LOADING ROOM</Line>}>
                    <RoomWindowScene document={document} spaceId={ctx.spaceId} projectId={ctx.projectId} />
                </Suspense>
            </RoomBoundary>
        </div>
    )
}
