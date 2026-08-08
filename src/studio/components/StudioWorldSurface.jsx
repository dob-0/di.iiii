// Reuses Raw's real 3D viewport rather than building a second renderer — same
// justification/verification as StudioGraphSurface.jsx (zero CSS collisions with
// studio.css, raw.css is fully `.raw-*`-namespaced). Imported unconditionally by
// StudioViewportLayout.jsx; only the "W" split-button affordance is dev-gated.
import '../../raw/styles/raw.css'
import RawViewport from '../../raw/components/RawViewport.jsx'

// Finds the World node marked live for its own scope — a node "is live" if its own
// scope's liveWorldNodeIdByScope entry names it (see RawEditor.jsx's WorldPanelWindow
// wiring, which is where that pointer gets set). Studio has no scope-navigation UI of
// its own, so with more than one live world across different scopes this takes the
// first match in document order — arbitrary, and known to be so (see plan doc).
const findLiveWorldNode = (document) => {
    const liveMap = document?.workspaceState?.liveWorldNodeIdByScope || {}
    const nodes = document?.nodes || []
    return nodes.find((node) =>
        node.typeId === 'universe.world' && liveMap[node.parentId || ''] === node.id
    ) || null
}

// Read-only: no onSelectEntity/onSelectNode/onMoveNode/onWorldDoubleClick passed to
// RawViewport, so nothing here can mutate the document — same pattern as
// StudioGraphSurface's read-only use of RawGraphSurface.
export default function StudioWorldSurface({ document }) {
    const worldNode = findLiveWorldNode(document)

    if (!worldNode) {
        return (
            <div className="ssws-root ssws-empty">
                <p>No World is marked live yet — open Raw, create a World, and click its ● button to mark it live.</p>
            </div>
        )
    }

    return (
        <div className="ssws-root">
            <RawViewport
                document={document}
                scopeId={worldNode.id}
                worldNode={worldNode}
                showEmptyHint={false}
            />
            <div className="ssws-readonly-badge">Read-only · live world</div>
        </div>
    )
}
