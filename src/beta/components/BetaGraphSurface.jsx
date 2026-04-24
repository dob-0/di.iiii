import { useEffect, useMemo, useRef, useState } from 'react'
import {
    arePortsCompatible,
    getNodeInputs,
    getNodeOutputs,
    getNodeType,
    getPortType
} from '../../project/nodeRegistry.js'

const CARD_WIDTH = 200
const HEADER_HEIGHT = 44
const PORT_ROW_HEIGHT = 22
const PORT_DOT_RADIUS = 5

const cardHeight = (node) => {
    const rows = Math.max(getNodeInputs(node).length, getNodeOutputs(node).length, 1)
    return HEADER_HEIGHT + rows * PORT_ROW_HEIGHT + 8
}

const inputPortCenter = (node, portId) => {
    const inputs = getNodeInputs(node)
    const idx = inputs.findIndex((p) => p.id === portId)
    if (idx < 0) return { x: node.graphX, y: node.graphY + HEADER_HEIGHT }
    return {
        x: node.graphX,
        y: node.graphY + HEADER_HEIGHT + idx * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2
    }
}

const outputPortCenter = (node, portId) => {
    const outputs = getNodeOutputs(node)
    const idx = outputs.findIndex((p) => p.id === portId)
    if (idx < 0) return { x: node.graphX + CARD_WIDTH, y: node.graphY + HEADER_HEIGHT }
    return {
        x: node.graphX + CARD_WIDTH,
        y: node.graphY + HEADER_HEIGHT + idx * PORT_ROW_HEIGHT + PORT_ROW_HEIGHT / 2
    }
}

const buildWirePath = (from, to) => {
    const dx = Math.max(30, Math.abs(to.x - from.x) * 0.4)
    return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
}

export default function BetaGraphSurface({
    nodes = [],
    edges = [],
    selectedNodeId = null,
    onSelectNode,
    onCreateEdge,
    onDeleteNode,
    onDoubleClick
}) {
    const containerRef = useRef(null)
    const [pendingWire, setPendingWire] = useState(null)

    const nodeById = useMemo(() => {
        const map = new Map()
        for (const node of nodes) map.set(node.id, node)
        return map
    }, [nodes])

    useEffect(() => {
        if (!selectedNodeId || !onDeleteNode) return undefined
        const handler = (event) => {
            if (event.key !== 'Delete' && event.key !== 'Backspace') return
            const target = event.target
            const tag = target?.tagName?.toLowerCase?.()
            if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return
            onDeleteNode(selectedNodeId)
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [selectedNodeId, onDeleteNode])

    const containerRect = () => containerRef.current?.getBoundingClientRect?.() || { left: 0, top: 0 }

    const handleOutputPointerDown = (event, node, port) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        const rect = containerRect()
        setPendingWire({
            fromNodeId: node.id,
            fromPort: port.id,
            fromPortType: port.type,
            cursorX: event.clientX - rect.left,
            cursorY: event.clientY - rect.top
        })
    }

    const isDraggingWire = Boolean(pendingWire)
    useEffect(() => {
        if (!isDraggingWire) return undefined
        const move = (event) => {
            const rect = containerRef.current?.getBoundingClientRect?.() || { left: 0, top: 0 }
            setPendingWire((current) => current ? {
                ...current,
                cursorX: event.clientX - rect.left,
                cursorY: event.clientY - rect.top
            } : current)
        }
        const up = () => setPendingWire(null)
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        return () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
        }
    }, [isDraggingWire])

    const handleInputPointerUp = (event, node, port) => {
        if (!pendingWire) return
        event.stopPropagation()
        if (pendingWire.fromNodeId === node.id) {
            setPendingWire(null)
            return
        }
        if (!arePortsCompatible(pendingWire.fromPortType, port.type)) {
            setPendingWire(null)
            return
        }
        onCreateEdge?.({
            fromNodeId: pendingWire.fromNodeId,
            fromPort: pendingWire.fromPort,
            toNodeId: node.id,
            toPort: port.id
        })
        setPendingWire(null)
    }

    const wires = useMemo(() => {
        const out = []
        for (const edge of edges) {
            const fromNode = nodeById.get(edge.fromNodeId)
            const toNode = nodeById.get(edge.toNodeId)
            if (!fromNode || !toNode) continue
            const from = outputPortCenter(fromNode, edge.fromPort)
            const to = inputPortCenter(toNode, edge.toPort)
            const fromPort = getNodeOutputs(fromNode).find((p) => p.id === edge.fromPort)
            const color = fromPort ? getPortType(fromPort.type).color : '#999'
            out.push({ id: edge.id, from, to, color })
        }
        return out
    }, [edges, nodeById])

    const pendingFromPos = pendingWire ? outputPortCenter(nodeById.get(pendingWire.fromNodeId) || {}, pendingWire.fromPort) : null

    const handleSectionDoubleClick = (event) => {
        if (!onDoubleClick) return
        onDoubleClick({ clientX: event.clientX, clientY: event.clientY })
    }

    return (
        <section className="beta-graph-surface" ref={containerRef} style={{ position: 'relative', overflow: 'auto', height: '100%', background: '#111' }} onDoubleClick={handleSectionDoubleClick}>
            {nodes.length === 0 ? (
                <div className="beta-empty-state" style={{ padding: 24, color: '#aaa', pointerEvents: 'none' }}>Double-click to add a node.</div>
            ) : null}
            <svg
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
            >
                {wires.map((wire) => (
                    <path key={wire.id} d={buildWirePath(wire.from, wire.to)} stroke={wire.color} strokeWidth={2} fill="none" opacity={0.85} />
                ))}
                {pendingWire && pendingFromPos ? (
                    <path
                        d={buildWirePath(pendingFromPos, { x: pendingWire.cursorX, y: pendingWire.cursorY })}
                        stroke={getPortType(pendingWire.fromPortType).color}
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        fill="none"
                    />
                ) : null}
            </svg>
            {nodes.map((node) => {
                const inputs = getNodeInputs(node)
                const outputs = getNodeOutputs(node)
                const h = cardHeight(node)
                const isSelected = node.id === selectedNodeId
                const typeDef = getNodeType(node.typeId)
                return (
                    <div
                        key={node.id}
                        className={`beta-graph-node-card${isSelected ? ' is-selected' : ''}`}
                        style={{
                            position: 'absolute',
                            left: node.graphX,
                            top: node.graphY,
                            width: CARD_WIDTH,
                            height: h,
                        }}
                        onClick={() => onSelectNode?.(node.id)}
                        onDoubleClick={(event) => event.stopPropagation()}
                    >
                        <header className="beta-graph-node-header">
                            <span className="beta-graph-node-icon" />
                            <span className="beta-graph-node-label">{node.label}</span>
                            <span className="beta-graph-node-category">{typeDef?.category || ''}</span>
                        </header>
                        <div style={{ position: 'relative', height: h - HEADER_HEIGHT }}>
                            {inputs.map((port, idx) => (
                                <div
                                    key={`in-${port.id}`}
                                    className="beta-graph-port-row beta-graph-port-row--in"
                                    style={{ top: idx * PORT_ROW_HEIGHT }}
                                >
                                    <span
                                        className="beta-graph-port-dot"
                                        onPointerUp={(event) => handleInputPointerUp(event, node, port)}
                                        style={{ background: getPortType(port.type).color, left: -PORT_DOT_RADIUS }}
                                        title={`${port.label || port.id} (${port.type})`}
                                    />
                                    <span className="beta-graph-port-label">{port.label || port.id}</span>
                                </div>
                            ))}
                            {outputs.map((port, idx) => (
                                <div
                                    key={`out-${port.id}`}
                                    className="beta-graph-port-row beta-graph-port-row--out"
                                    style={{ top: idx * PORT_ROW_HEIGHT }}
                                >
                                    <span className="beta-graph-port-label">{port.label || port.id}</span>
                                    <span
                                        className="beta-graph-port-dot"
                                        onPointerDown={(event) => handleOutputPointerDown(event, node, port)}
                                        style={{ background: getPortType(port.type).color, right: -PORT_DOT_RADIUS }}
                                        title={`${port.label || port.id} (${port.type})`}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })}
        </section>
    )
}
