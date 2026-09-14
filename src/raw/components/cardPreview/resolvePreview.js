import { getNodeType } from '../../../project/nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeInputs, evaluateNodeOutput } from '../../../project/graph/nodeGraphRuntime.js'
import { wearConstructorGeometry } from '../../../project/graph/constructorGeometry.js'
import { isGeometryDescriptor } from '../../../project/graph/geometryDescriptor.js'
import { cardPreviewKind } from './previewTypes.js'

// What a card's preview draws, as plain data: the node's RESOLVED values (a
// colour wired into the cube colours the preview too — the same
// evaluateNodeInputs the room uses) plus, for shape carriers, the geometry
// descriptor. Pure: no three.js, so the "only redraw on change" rule is
// testable without WebGL.

// One graph context per (nodes, edges) identity, shared by every card on the
// surface. Each context costs O(nodes) to build; per card that was O(n²) on
// every document change. `now` is 0: a card is a still of the node's settings,
// not a clock — a Time-driven value previews at its first sample.
const contextsByNodes = new WeakMap()
const EMPTY_EDGES = []

export const previewGraphContext = (nodes, edges) => {
    const nodeKey = Array.isArray(nodes) ? nodes : []
    const edgeKey = Array.isArray(edges) ? edges : EMPTY_EDGES
    let byEdges = contextsByNodes.get(nodeKey)
    if (!byEdges) {
        byEdges = new WeakMap()
        contextsByNodes.set(nodeKey, byEdges)
    }
    let context = byEdges.get(edgeKey)
    if (!context) {
        context = createNodeGraphContext({ nodes: nodeKey, edges: edgeKey }, { now: 0 })
        byEdges.set(edgeKey, context)
    }
    return context
}

// A stable string for "did anything the picture depends on change". A live
// THREE.Texture is an object graph, not data — its identity stands in for it.
export const previewFingerprint = (payload) => JSON.stringify(payload, (key, value) => {
    if (value && typeof value === 'object' && value.isTexture) return `texture:${value.uuid}`
    if (typeof value === 'function') return undefined
    return value
})

const shapeOf = (node, nodes, context) => {
    if (node.typeId === 'geom.constructor') return wearConstructorGeometry(node, nodes, context)
    const port = (getNodeType(node.typeId)?.outputs || []).find((entry) => entry.type === 'geometry')
    if (!port) return null
    const value = evaluateNodeOutput(node, port.id, context)
    return isGeometryDescriptor(value) ? value : null
}

// A light coercion, matching the handful of port types a card preview's
// values ever carry (cube size, sphere colour, light intensity…) — not the
// full evaluateNodeInput ladder, just enough to refuse a value that plainly
// isn't this port's shape so a stale/malformed live read cannot ever draw
// something worse than the static baseline underneath it.
const coerceForPort = (value, portType) => {
    if (value === undefined || value === null) return undefined
    switch (portType) {
        case 'number': {
            const n = Number(value)
            return Number.isFinite(n) ? n : undefined
        }
        case 'boolean':
            return Boolean(value)
        case 'vec3':
            return Array.isArray(value) ? value : undefined
        case 'color':
        case 'string':
            return typeof value === 'string' ? value : undefined
        default:
            return value
    }
}

// Overlays REAL live values onto the static baseline `evaluateNodeInputs`
// already computed — build task 2: "card previews use the real clock and
// live inputs". `readOutput` is the editor's own live graph context, read
// one node/port at a time (see RawEditor.jsx's readOutput and
// RawGraphSurface's `readOutput` prop) — a wired Time or LFO node answers
// its REAL current value here instead of its value at t=0. Layered rather
// than replacing evaluateNodeInputs outright: every default, coercion and
// unwired value it already gets right stays exactly as it was, and a read
// that comes back the wrong shape for the port (coerceForPort) or simply
// undefined (the source node's own graph does not evaluate outside this
// preview's smaller node set) leaves the static baseline standing.
const liveNodeInputs = (node, staticValues, edges, readOutput) => {
    const type = getNodeType(node?.typeId)
    const edgeByTarget = new Map()
    for (const edge of edges || []) {
        if (edge) edgeByTarget.set(`${edge.toNodeId}:${edge.toPort}`, edge)
    }
    const values = { ...staticValues }
    for (const port of type?.inputs || []) {
        const edge = edgeByTarget.get(`${node.id}:${port.id}`)
        if (!edge) continue
        const live = coerceForPort(readOutput(edge.fromNodeId, edge.fromPort), port.type)
        if (live !== undefined) values[port.id] = live
    }
    return values
}

/**
 * @param node       the card's node
 * @param nodes      EVERY node the surface knows (portScopeNodes when given)
 *                    — a Geo's children and a Constructor's doors live in
 *                    another scope
 * @param edges      the wires the surface knows
 * @param readOutput optional: `(nodeId, portId) => value`, the editor's real
 *                    graph context (real clock, real liveOutputs) exposed one
 *                    read at a time — see RawGraphSurface's `readOutput`
 *                    prop. Omitted in Studio's read-only wrapper and in
 *                    tests, where the preview falls back to its old t=0 still.
 * @returns { payload, fingerprint, spin } or null for a type with no preview
 */
export const resolveCardPreview = (node, { nodes = [], edges = [], readOutput = null } = {}) => {
    const kind = cardPreviewKind(node?.typeId)
    if (!kind) return null
    const allNodes = Array.isArray(nodes) && nodes.some((other) => other?.id === node.id)
        ? nodes
        : [...(Array.isArray(nodes) ? nodes : []), node]
    let values = {}
    let descriptor = null
    try {
        const context = previewGraphContext(allNodes, edges)
        values = evaluateNodeInputs(node, context)
        if (kind === 'shape') descriptor = shapeOf(node, allNodes, context)
        if (typeof readOutput === 'function') {
            values = liveNodeInputs(node, values, edges, readOutput)
            // Constructor shapes are worn from nested doorway/child nodes
            // (constructorGeometry.js's own context threading) and keep the
            // static baseline above; every other shape carrier's own
            // geometry output is one direct read, same as any other port.
            if (kind === 'shape' && node.typeId !== 'geom.constructor') {
                const port = (getNodeType(node.typeId)?.outputs || []).find((entry) => entry.type === 'geometry')
                if (port) {
                    const live = readOutput(node.id, port.id)
                    if (isGeometryDescriptor(live)) descriptor = live
                }
            }
        }
    } catch {
        // A graph that cannot be evaluated (a cycle the runtime refuses, a
        // half-written node) previews as nothing rather than breaking the card.
        values = { ...(node.values || {}) }
        descriptor = null
    }
    const payload = {
        kind,
        typeId: node.typeId,
        parentId: node.parentId || null,
        values,
        descriptor
    }
    return {
        payload,
        fingerprint: previewFingerprint(payload),
        // A lit sphere turning, or an empty frame, is invisible work: only
        // something with a shape gets the turntable.
        spin: kind !== 'light' && !(kind === 'shape' && !descriptor)
    }
}
