import './styles/raw.css'
import { useMemo } from 'react'
import RawViewport from './components/RawViewport.jsx'
import { resolveScopeWorldNode } from './utils/viewportWorldState.js'

// The node lane's room, mounted OUTSIDE the node lane — on the published page.
//
// This exists for one reason, and it is a lesson the Raw publish panel already
// paid for in the other direction: a lane's components carry their lane's
// stylesheet, and `raw.css` is imported by `RawApp`/`BlankNodeWorkspaceApp`
// only. Mounting `RawViewport` straight into the public viewer therefore gave
// an UNSTYLED shell — `.raw-viewport-shell` is `position: absolute; inset: 0`
// in that file and nothing without it, so the canvas collapsed to an intrinsic
// band across the top of the page with dead space beneath (seen, not guessed).
//
// So the import rides here, on the same lazy chunk as the viewport: a page that
// publishes entities never loads it. It is safe to bring along — every rule in
// `raw.css` is class-scoped (`.raw-*`), with no element, `:root`, `html` or
// `body` selectors, so it cannot reach the viewer's own chrome.
//
// The wrapper also owns the box rather than trusting the host's layout, which
// is what `.raw-out-surface` does for the projector view.
export default function PublicGraphSurface({ document, interactive = true }) {
    const worldNode = useMemo(
        () => resolveScopeWorldNode(document.nodes, null, document.workspaceState?.liveWorldNodeIdByScope),
        [document.nodes, document.workspaceState?.liveWorldNodeIdByScope]
    )

    return (
        <div style={{ position: 'absolute', inset: 0, background: '#05070c' }}>
            {/* Read-only by absence, the way /out is: no selection, no cursors,
                no move handler, no double-click to place. Every pointer is a
                no-op because the handler is not there, not because a guard
                turned it away. */}
            <RawViewport
                topInset={0}
                document={document}
                selectedEntityId={null}
                selectedNodeId={null}
                cursors={{}}
                nodeScale={1}
                showEmptyHint={false}
                scopeId={null}
                worldNode={worldNode}
                liveOutputs={null}
                showSelectionPills={false}
                interactive={interactive}
            />
        </div>
    )
}
