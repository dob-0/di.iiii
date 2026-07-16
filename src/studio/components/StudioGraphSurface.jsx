import { useState } from 'react'
// Reuses Beta's real graph canvas rather than building a second renderer —
// dev-only (see graphViewFlag.js) so this stylesheet import can't affect
// any shipped Studio surface; verified zero class-name collisions with
// studio.css before adding this import.
import '../../beta/styles/beta.css'
import BetaGraphSurface from '../../beta/components/BetaGraphSurface.jsx'

// Read-only: no onCreateEdge/onDeleteEdge/onDeleteNode/onMoveNode/onEnterNode
// passed to BetaGraphSurface, so nothing here can mutate the document. This
// mirrors the plan's open question about whether graph-node selection
// should drive StudioInspector — until that's decided, selection here is
// local and informational only, not wired into Studio's selection model.
export default function StudioGraphSurface({ document }) {
    const [selectedNodeId, setSelectedNodeId] = useState(null)
    const nodes = document?.nodes || []
    const edges = document?.edges || []
    const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null

    return (
        <div className="ssgs-root">
            <BetaGraphSurface
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                emptyHint="This project has no graph nodes yet — create them from Beta."
            />
            <div className="ssgs-readonly-badge">Read-only preview</div>
            {selectedNode && (
                <div className="ssgs-node-readout">
                    <strong>{selectedNode.label}</strong>
                    <span>{selectedNode.typeId}</span>
                </div>
            )}
        </div>
    )
}
