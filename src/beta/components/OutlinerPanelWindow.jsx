import { getCategoryColor, getNodeType } from '../../project/nodeRegistry.js'

export default function OutlinerPanelWindow({ nodes, selectedNodeId, onSelectNode }) {
    if (!nodes.length) {
        return <div className="beta-empty-state">No nodes on this surface.</div>
    }
    return (
        <ul className="beta-outliner beta-window-stack">
            {nodes.map((node) => {
                const typeDef = getNodeType(node.typeId)
                const dot = getCategoryColor(typeDef?.category)
                return (
                    <li key={node.id}>
                        <button
                            type="button"
                            className={node.id === selectedNodeId ? 'is-selected' : ''}
                            onClick={() => onSelectNode(node.id)}
                        >
                            <span className="beta-outliner-dot" style={{ background: dot }} aria-hidden="true" />
                            <strong>{typeDef?.label || node.typeId}</strong>
                            <span>{node.label || node.id}</span>
                        </button>
                    </li>
                )
            })}
        </ul>
    )
}
