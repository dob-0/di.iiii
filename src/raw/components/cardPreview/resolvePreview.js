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

/**
 * @param node   the card's node
 * @param nodes  EVERY node the surface knows (portScopeNodes when given) — a
 *               Geo's children and a Constructor's doors live in another scope
 * @param edges  the wires the surface knows
 * @returns { payload, fingerprint, spin } or null for a type with no preview
 */
export const resolveCardPreview = (node, { nodes = [], edges = [] } = {}) => {
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
