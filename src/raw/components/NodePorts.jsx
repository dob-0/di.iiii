import { PORT_TYPES } from '../../project/nodeRegistry.js'
import { formatPortValue } from '../../project/graph/formatPortValue.js'

// A node's inputs and outputs with what is in them now — the anatomy sheet's
// "What it takes and gives", promoted into the settings column and onto the
// rails of the inside view (audit 2026-10-05 §3.5, §3.6). Every value comes
// from readNode (src/project/graph/nodeReading.js); this file only words it.

const typeLabel = (type) => PORT_TYPES[type]?.label || 'Any'

const fromLine = (row) => {
    if (row.origin === 'wire' || row.origin === 'wire-empty') {
        return row.fromNode ? `from ${row.fromNode.label} · ${row.fromPortLabel || 'out'}` : 'from a card that is gone'
    }
    if (row.origin === 'typed') return 'typed here'
    return null
}

function PortRow({ row, wiredTo = null }) {
    const { text, swatch, empty } = formatPortValue(row.value, row.port.type)
    const where = wiredTo ?? fromLine(row)
    return (
        <li className="raw-port-row" data-port-id={row.port.id}>
            <span className="raw-port-name">{row.port.label || row.port.id}</span>
            <span className="raw-port-type">{typeLabel(row.port.type)}</span>
            <span className={`raw-port-value${empty ? ' is-empty' : ''}`}>
                {swatch ? <i className="raw-port-swatch" style={{ background: swatch }} aria-hidden="true" /> : null}
                {text}
            </span>
            {where ? <span className="raw-port-where">{where}</span> : null}
        </li>
    )
}

// Where an output goes: the cards its wires reach, by name.
const wiredToLine = (nodeId, portId, edges, nodesById) => {
    const targets = edges
        .filter((edge) => edge.fromNodeId === nodeId && edge.fromPort === portId)
        .map((edge) => nodesById.get(edge.toNodeId)?.label)
        .filter(Boolean)
    return targets.length ? `to ${targets.join(', ')}` : null
}

export function PortList({ rows, side, nodeId = null, edges = [], nodesById = null, label }) {
    return (
        <div className={`raw-port-list is-${side}`}>
            <h5>{label}</h5>
            {rows.length ? (
                <ul>
                    {rows.map((row) => (
                        <PortRow
                            key={row.port.id}
                            row={row}
                            wiredTo={side === 'out' && nodesById ? wiredToLine(nodeId, row.port.id, edges, nodesById) : null}
                        />
                    ))}
                </ul>
            ) : <p className="raw-port-none">{side === 'in' ? 'Takes nothing.' : 'Gives nothing.'}</p>}
        </div>
    )
}

// The column's Ports section: inputs, then outputs.
export default function NodePorts({ reading, nodeId, edges = [], nodes = [] }) {
    if (!reading) return null
    const nodesById = new Map(nodes.map((node) => [node.id, node]))
    return (
        <section className="raw-property-section raw-column-ports" aria-label="Ports">
            <h5>Ports</h5>
            <PortList rows={reading.takes} side="in" label="In" />
            <PortList rows={reading.gives} side="out" label="Out" nodeId={nodeId} edges={edges} nodesById={nodesById} />
        </section>
    )
}
