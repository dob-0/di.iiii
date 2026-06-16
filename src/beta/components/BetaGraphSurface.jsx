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
const GRAPH_MIN_ZOOM = 0.05
const GRAPH_MAX_ZOOM = 8
const GRAPH_ZOOM_STEP = 0.1

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

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
    topInset = 0,
    nodes = [],
    edges = [],
    selectedNodeId = null,
    emptyHint = 'Cursor is material. Double-click to place nodes.',
    onSelectNode,
    onEnterNode,
    onCreateEdge,
    onDeleteEdge,
    onDeleteNode,
    onMoveNode,
    onDoubleClick
}) {
    const containerRef = useRef(null)
    const [pendingWire, setPendingWire] = useState(null)
    const [draggingNodeId, setDraggingNodeId] = useState(null)
    const [isPanning, setIsPanning] = useState(false)
    const [isPanMoving, setIsPanMoving] = useState(false)
    const [hoveredWireId, setHoveredWireId] = useState(null)
    const dragOffsetRef = useRef({ x: 0, y: 0 })
    const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
    const hasFitRef = useRef(false)
    const [panX, setPanX] = useState(60)
    const [panY, setPanY] = useState(60)
    const [zoom, setZoom] = useState(1)
    // viewportRef mirrors pan+zoom synchronously so event handlers always read current values
    const viewportRef = useRef({ panX: 60, panY: 60, zoom: 1 })

    const nodeById = useMemo(() => {
        const map = new Map()
        for (const node of nodes) map.set(node.id, node)
        return map
    }, [nodes])

    const clientPointToGraphPoint = (clientX, clientY) => {
        const rect = containerRef.current?.getBoundingClientRect?.() || { left: 0, top: 0 }
        const vp = viewportRef.current
        return {
            x: (clientX - rect.left - vp.panX) / vp.zoom,
            y: (clientY - rect.top - vp.panY) / vp.zoom
        }
    }

    const applyViewport = (nextPanX, nextPanY, nextZoom) => {
        const clamped = clamp(nextZoom, GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM)
        viewportRef.current = { panX: nextPanX, panY: nextPanY, zoom: clamped }
        setPanX(nextPanX)
        setPanY(nextPanY)
        setZoom(clamped)
    }

    const updateZoom = (nextZoom) => {
        const vp = viewportRef.current
        const container = containerRef.current
        const rect = container?.getBoundingClientRect() || { width: 800, height: 600 }
        const cx = rect.width / 2
        const cy = rect.height / 2
        const clamped = clamp(nextZoom, GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM)
        const scale = clamped / vp.zoom
        applyViewport(cx - (cx - vp.panX) * scale, cy - (cy - vp.panY) * scale, clamped)
    }

    // Center nodes in viewport on first render
    useEffect(() => {
        if (hasFitRef.current || !containerRef.current || nodes.length === 0) return
        const rect = containerRef.current.getBoundingClientRect()
        const minX = Math.min(...nodes.map((n) => n.graphX ?? 0))
        const minY = Math.min(...nodes.map((n) => n.graphY ?? 0))
        const maxX = Math.max(...nodes.map((n) => (n.graphX ?? 0) + CARD_WIDTH))
        const maxY = Math.max(...nodes.map((n) => (n.graphY ?? 0) + cardHeight(n)))
        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        const px = rect.width / 2 - cx * viewportRef.current.zoom
        const py = rect.height / 2 - cy * viewportRef.current.zoom
        applyViewport(px, py, viewportRef.current.zoom)
        hasFitRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes.length])

    // Non-passive wheel listener — cursor-anchored zoom, no scroll
    useEffect(() => {
        const container = containerRef.current
        if (!container) return undefined
        const handleWheel = (event) => {
            event.preventDefault()
            const factor = event.deltaY < 0 ? 1.1 : 0.9
            const vp = viewportRef.current
            const rect = container.getBoundingClientRect()
            const mx = event.clientX - rect.left
            const my = event.clientY - rect.top
            const nextZoom = clamp(vp.zoom * factor, GRAPH_MIN_ZOOM, GRAPH_MAX_ZOOM)
            const scale = nextZoom / vp.zoom
            applyViewport(mx - (mx - vp.panX) * scale, my - (my - vp.panY) * scale, nextZoom)
        }
        container.addEventListener('wheel', handleWheel, { passive: false })
        return () => container.removeEventListener('wheel', handleWheel)
    }, [])

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

    const handleOutputPointerDown = (event, node, port) => {
        if (event.button !== 0) return
        event.stopPropagation()
        event.preventDefault()
        const point = clientPointToGraphPoint(event.clientX, event.clientY)
        setPendingWire({
            fromNodeId: node.id,
            fromPort: port.id,
            fromPortType: port.type,
            cursorX: point.x,
            cursorY: point.y
        })
    }

    const isDraggingWire = Boolean(pendingWire)
    const isDraggingNode = Boolean(draggingNodeId)

    const shouldStartPan = (event) => {
        const target = event.target
        if (target?.closest?.('.beta-graph-zoom-controls')) return false
        if (event.button === 1) return true
        if (event.button !== 0) return false
        return !target?.closest?.('.beta-graph-node-card')
    }

    const handleSurfacePointerDown = (event) => {
        if (!shouldStartPan(event) || isDraggingWire) return
        if (event.detail >= 2) return
        event.preventDefault()
        const vp = viewportRef.current
        panStartRef.current = { x: event.clientX, y: event.clientY, panX: vp.panX, panY: vp.panY }
        setIsPanning(true)
        setIsPanMoving(false)
    }
    
    useEffect(() => {
        if (!isDraggingWire) return undefined
        const move = (event) => {
            const point = clientPointToGraphPoint(event.clientX, event.clientY)
            setPendingWire((current) => current ? {
                ...current,
                cursorX: point.x,
                cursorY: point.y
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

    useEffect(() => {
        if (!isDraggingNode) return undefined
        const move = (event) => {
            const node = nodeById.get(draggingNodeId)
            if (!node) return
            const point = clientPointToGraphPoint(event.clientX, event.clientY)
            const nextX = point.x - dragOffsetRef.current.x
            const nextY = point.y - dragOffsetRef.current.y
            onMoveNode?.(draggingNodeId, nextX, nextY)
        }
        const up = () => setDraggingNodeId(null)
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        return () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
        }
    }, [isDraggingNode, draggingNodeId, nodeById, onMoveNode])

    useEffect(() => {
        if (!isPanning) return undefined
        const move = (event) => {
            setIsPanMoving(true)
            const dx = event.clientX - panStartRef.current.x
            const dy = event.clientY - panStartRef.current.y
            const nx = panStartRef.current.panX + dx
            const ny = panStartRef.current.panY + dy
            viewportRef.current.panX = nx
            viewportRef.current.panY = ny
            setPanX(nx)
            setPanY(ny)
        }
        const up = () => {
            setIsPanning(false)
            setIsPanMoving(false)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', up)
        return () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', up)
        }
    }, [isPanning])

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
        const graphPoint = clientPointToGraphPoint(event.clientX, event.clientY)
        onDoubleClick({ clientX: event.clientX, clientY: event.clientY, graphX: graphPoint.x, graphY: graphPoint.y })
    }

    const handleSectionKeyDown = (event) => {
        if ((event.key === '+' || event.key === '=') && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            updateZoom(zoom + GRAPH_ZOOM_STEP)
            return
        }
        if (event.key === '-' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            updateZoom(zoom - GRAPH_ZOOM_STEP)
            return
        }
        if (event.key !== 'Enter' || event.target !== event.currentTarget || !onDoubleClick) return
        const rect = event.currentTarget.getBoundingClientRect()
        onDoubleClick({
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        })
    }

    const handleNodeKeyDown = (event, nodeId) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onSelectNode?.(nodeId)
    }

    return (
        <div
            className="beta-graph-surface"
            ref={containerRef}
            role="button"
            tabIndex={0}
            aria-label="Create a graph node"
            style={{ top: `${topInset}px`, cursor: (draggingNodeId || isPanMoving) ? 'grabbing' : undefined }}
            onDoubleClick={handleSectionDoubleClick}
            onKeyDown={handleSectionKeyDown}
            onPointerDown={handleSurfacePointerDown}
        >
            <div className="beta-graph-zoom-controls">
                <button type="button" aria-label="Zoom out" onClick={() => updateZoom(zoom - GRAPH_ZOOM_STEP)}>-</button>
                <span className="beta-graph-zoom-value">{Math.round(zoom * 100)}%</span>
                <button type="button" aria-label="Zoom in" onClick={() => updateZoom(zoom + GRAPH_ZOOM_STEP)}>+</button>
            </div>
            {nodes.length === 0 ? (
                <div className="beta-empty-state" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#aaa', pointerEvents: 'none' }}>{emptyHint}</div>
            ) : null}
            <div
                className="beta-graph-stage"
                style={{ transform: `translate(${panX}px,${panY}px) scale(${zoom})`, transformOrigin: '0 0' }}
            >
                    <svg
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
                    >
                        {wires.map((wire) => {
                            const isHovered = hoveredWireId === wire.id
                            return (
                                <path
                                    key={wire.id}
                                    d={buildWirePath(wire.from, wire.to)}
                                    stroke={isHovered ? '#ff5555' : wire.color}
                                    strokeWidth={isHovered ? 4 : 2}
                                    fill="none"
                                    opacity={0.85}
                                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                                    onPointerEnter={() => setHoveredWireId(wire.id)}
                                    onPointerLeave={() => setHoveredWireId(null)}
                                    onClick={(e) => { e.stopPropagation(); onDeleteEdge?.(wire.id) }}
                                />
                            )
                        })}
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
                                    cursor: draggingNodeId === node.id ? 'grabbing' : 'grab'
                                }}
                                role="button"
                                tabIndex={0}
                                onClick={() => onSelectNode?.(node.id)}
                                onPointerDown={(event) => {
                                    if (event.button !== 0) return
                                    const point = clientPointToGraphPoint(event.clientX, event.clientY)
                                    dragOffsetRef.current = {
                                        x: point.x - node.graphX,
                                        y: point.y - node.graphY
                                    }
                                    onSelectNode?.(node.id)
                                    setIsPanning(false)
                                    setDraggingNodeId(node.id)
                                    event.currentTarget.setPointerCapture(event.pointerId)
                                }}
                                onKeyDown={(event) => handleNodeKeyDown(event, node.id)}
                                onDoubleClick={(event) => { event.stopPropagation(); onEnterNode?.(node.id) }}
                            >
                                <header className="beta-graph-node-header">
                                    <span className="beta-graph-node-icon" />
                                    <span className="beta-graph-node-label">{node.label}</span>
                                    <span className="beta-graph-node-category">{typeDef?.category || ''}</span>
                                    <span className="beta-graph-node-enter-hint" title="Double-click to enter">›</span>
                                </header>
                                <div style={{ position: 'relative', height: h - HEADER_HEIGHT }}>
                                    {inputs.map((port, idx) => (
                                        <div
                                            key={`in-${port.id}`}
                                            className="beta-graph-port-row beta-graph-port-row--in"
                                            style={{ top: idx * PORT_ROW_HEIGHT }}
                                        >
                                            <span
                                                className="beta-graph-port-dot beta-graph-port-dot--in"
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
                                                className="beta-graph-port-dot beta-graph-port-dot--out"
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
                </div>
        </div>
    )
}
