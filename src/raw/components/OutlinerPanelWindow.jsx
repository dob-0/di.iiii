import { getFamilyColorForType, getNodeType } from '../../project/nodeRegistry.js'

// Everything standing in this scope, BOTH KINDS.
//
// It listed nodes only, so a room of twelve Studio things opened here saying
// "No nodes here yet" — true of one kind and wrong about the project. `items`
// is the list from objectCards.js's buildScopeItems ({kind:'node'|'object'});
// things carry a depth, so a grouped thing sits under its group, stepped in the
// way Studio's Objects panel steps it (depth * 14 + 8). `nodes` stays accepted
// for a caller that only has nodes.
export default function OutlinerPanelWindow({
    items = null,
    nodes = [],
    selectedNodeId,
    onSelectNode,
    selectedEntityId = null,
    onSelectEntity = null
}) {
    const rows = items || nodes.map((node) => ({ kind: 'node', id: node.id, node }))
    if (!rows.length) {
        return <div className="raw-empty-state">Nothing here yet.</div>
    }
    return (
        <ul className="raw-outliner raw-window-stack">
            {rows.map((row) => {
                if (row.kind === 'object') {
                    return (
                        <li key={`object:${row.id}`}>
                            <button
                                type="button"
                                className={row.id === selectedEntityId ? 'is-selected' : ''}
                                style={row.depth > 0 ? { paddingLeft: row.depth * 14 + 8 } : undefined}
                                onClick={() => onSelectEntity?.(row.id)}
                            >
                                <span className="raw-outliner-dot" style={{ background: row.color }} aria-hidden="true" />
                                <strong>{row.typeLabel}</strong>
                                <span>{row.label}</span>
                            </button>
                        </li>
                    )
                }
                const node = row.node
                const typeDef = getNodeType(node.typeId)
                const dot = getFamilyColorForType(node.typeId)
                return (
                    <li key={node.id}>
                        <button
                            type="button"
                            className={node.id === selectedNodeId ? 'is-selected' : ''}
                            onClick={() => onSelectNode(node.id)}
                        >
                            <span className="raw-outliner-dot" style={{ background: dot }} aria-hidden="true" />
                            <strong>{typeDef?.label || node.typeId}</strong>
                            <span>{node.label || node.id}</span>
                        </button>
                    </li>
                )
            })}
        </ul>
    )
}
