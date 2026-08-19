import { useState } from 'react'
// Reuses Raw's real graph canvas rather than building a second renderer.
// This import is NOT gated by dev-only (see graphViewFlag.js) — it ships in
// every production build regardless of the flag, since this whole component
// is imported unconditionally by StudioViewportLayout.jsx. It's safe anyway
// because raw.css is fully `.raw-*`-namespaced (no bare element/`*`
// selectors, prefixed keyframes) — verified zero class-name collisions with
// studio.css before adding this import, not because the flag keeps it out.
import '../../raw/styles/raw.css'
import RawGraphSurface from '../../raw/components/RawGraphSurface.jsx'

// Read-only: no onCreateEdge/onDeleteEdge/onDeleteNode/onMoveNode/onEnterNode
// passed to RawGraphSurface, so nothing here can mutate the document. This
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
            <RawGraphSurface
                nodes={nodes}
                edges={edges}
                selectedNodeId={selectedNodeId}
                onSelectNode={setSelectedNodeId}
                emptyHint="This project has no graph nodes yet — create them from Raw."
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
