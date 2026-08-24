import { getFamilyColorForType, getNodeType } from '../../project/nodeRegistry.js'

// Everything standing in this scope, BOTH LANES.
//
// It listed nodes only, which meant a room of twelve objects opened here saying
// "No nodes here yet" — technically true and completely wrong about the project.
// An outliner that can only see half of what is in front of it is not an
// outliner, and the half it could not see was the half most projects are made of.
//
// `items` is the new shape ({kind:'node'|'object'}); `nodes` stays supported
// because Studio wraps this component and hands it a plain node list.
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
        return <div className="raw-empty-state">Nothing in this room yet.</div>
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
