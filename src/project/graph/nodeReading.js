// What a node is made of, read off the running program.
//
// This is the whole truth of the "what is it made of" sheet, kept out of the
// component so it can be tested without rendering anything. Nothing here is
// copied from a list, hand-written, or paraphrased: every fact is either asked
// of the registry (which ports exist), asked of the runtime (what is on them),
// or derived by substitution (where the answer came from). A sentence that
// described what a node DOES would be wrong after the next edit and no test
// could catch it, so there are no such sentences — the component turns these
// facts into words, and the facts are checkable.
import {
    CONTAINER_TYPE_IDS,
    getFamilyColorForType,
    getNodeFamily,
    getNodeInputs,
    getNodeOutputs,
    getNodeType,
    isNodeTypeImplemented,
    listNodeTypes
} from '../nodeRegistry.js'
import { createNodeGraphContext, evaluateNodeOutput } from './nodeGraphRuntime.js'

// The containers a person can actually reach — CONTAINER_TYPE_IDS filtered to
// what the palette offers. The raw set also holds `universe.node0` (authoring
// only) and `node.null` (never listed), and naming those in a sentence that
// says "these are the ones with an inside" sends somebody looking for two
// nodes they can never place.
const PLACEABLE_CONTAINER_LABELS = () => {
    const listed = new Set(listNodeTypes().map((type) => type.id))
    return [...CONTAINER_TYPE_IDS]
        .filter((id) => listed.has(id) && !getNodeType(id)?.authoringOnly)
        .map((id) => getNodeType(id)?.label)
        .filter(Boolean)
}

const findEdge = (context, nodeId, portId) => {
    if (context?.edgesByTarget) return context.edgesByTarget.get(`${nodeId}:${portId}`)
    return context?.edges?.find((edge) => edge.toNodeId === nodeId && edge.toPort === portId)
}

// The runtime's own last resort, replicated exactly — INCLUDING its blind spot.
// getNodeInputDefault calls getNodeInputs(node) with no scope list, so a
// doorway socket's declared `default` is invisible to it and an unwired door
// evaluates to undefined rather than to its fallback. Reading the scope list
// here would make this sheet disagree with the room it is describing, which is
// the one thing it must never do. (That the door's fallback never reaches the
// runtime is a real defect in the product, not in this file — see the session
// note; this surface is the first place it becomes visible.)
const runtimeDefault = (node, portId) => getNodeInputs(node).find((port) => port.id === portId)?.default

/**
 * Where the value on an input actually came from.
 *
 * evaluateNodeInput does NOT simply prefer the wire. It follows the edge, and
 * if the far end resolves to `undefined` it falls back to node.values and then
 * to the port default. So "there is an edge" and "the number you are looking at
 * came down that edge" are DIFFERENT facts, and a row that prints the first
 * while showing the second is exactly the kind of confident wrong answer this
 * sheet exists to remove. Reachable in one move: wire two math nodes into each
 * other and the cycle guard hands back undefined, so the wire looks alive and
 * carries nothing.
 *
 * @returns {{ value: *, origin: 'wire'|'wire-empty'|'typed'|'default'|'door-empty', edge: object|null, fromNode: object|null }}
 */
export function resolveInputRow(node, port, context, { isDoor = false } = {}) {
    const edge = findEdge(context, node.id, port.id)
    if (edge) {
        const fromNode = context?.nodesById?.get(edge.fromNodeId) || null
        // The same stack seed evaluateNodeInput pushes, so a cycle resolves the
        // same way here as it does in the room.
        const carried = fromNode
            ? evaluateNodeOutput(fromNode, edge.fromPort, context, new Set([`${node.id}:in:${port.id}`]))
            : undefined
        if (carried !== undefined) return { value: carried, origin: 'wire', edge, fromNode }
        const local = node.values?.[port.id] !== undefined ? node.values[port.id] : runtimeDefault(node, port.id)
        return { value: local, origin: 'wire-empty', edge, fromNode }
    }
    if (node.values?.[port.id] !== undefined) {
        return { value: node.values[port.id], origin: 'typed', edge: null, fromNode: null }
    }
    return {
        value: runtimeDefault(node, port.id),
        origin: isDoor ? 'door-empty' : 'default',
        edge: null,
        fromNode: null
    }
}

/**
 * Which outputs are fed from OUTSIDE the graph — a webcam's frame, MIDI's note,
 * the keeper's reply.
 *
 * Asked of the running runtime by substitution rather than kept as a list, so a
 * live case written tomorrow classifies itself on the day it lands. Substitution
 * also catches the ones a "the value is null" test would miss: device.midi.in
 * coalesces its empty case with `?? 0` and agent.keeper with `?? ''`, both of
 * which are indistinguishable from a real answer.
 */
export function isLiveFedOutput(node, portId, document) {
    if (!node || !document) return false
    const probe = Symbol('live')
    const key = `${node.id}:${portId}`
    try {
        const blind = evaluateNodeOutput(node, portId, createNodeGraphContext(document, { liveOutputs: new Map() }))
        if (blind === probe) return false
        const fed = evaluateNodeOutput(
            node,
            portId,
            createNodeGraphContext(document, { liveOutputs: new Map([[key, probe]]) })
        )
        return fed === probe
    } catch {
        // A throw here must not take the sheet down with it; the row falls back
        // to the plain reading, which is still true, just less specific.
        return false
    }
}

/**
 * @returns {{ value: *, source: 'door'|'live'|'code', windowClosed: boolean }}
 */
export function resolveOutputRow(node, port, context, { document = null, isDoor = false } = {}) {
    const value = evaluateNodeOutput(node, port.id, context)
    if (isDoor) return { value, source: 'door', windowClosed: false }
    if (document && isLiveFedOutput(node, port.id, document)) {
        return {
            value,
            source: 'live',
            // The same test selectMountedPanelNodes uses to decide whether the
            // panel is on screen at all. A live port with its window shut is not
            // broken — it is unplugged, and those read differently.
            windowClosed: node.values?.frame?.visible === false
        }
    }
    return { value, source: 'code', windowClosed: false }
}

const declaredIds = (ports) => new Set((ports || []).map((port) => port.id))

/**
 * The whole reading for one node.
 *
 * @param {object} node          the node the sheet is about (the scope you stand in)
 * @param {object[]} allNodes    EVERY node in the document, never the scoped list —
 *                               a container's sockets come from doorway nodes living
 *                               in a different scope, and the scoped list finds none
 *                               of them, in silence, with every unit test still green.
 * @param {object} context       the app's own graph context, reused not rebuilt, so
 *                               the numbers here are the numbers the room drew with.
 */
export function readNode(node, { allNodes = [], context = null, document = null, childCount = 0 } = {}) {
    const type = getNodeType(node?.typeId)
    const family = getNodeFamily(node?.typeId)
    const inputs = getNodeInputs(node, allNodes)
    const outputs = getNodeOutputs(node, allNodes)
    const declaredIn = declaredIds(type?.inputs)
    const declaredOut = declaredIds(type?.outputs)
    const byId = new Map(allNodes.map((other) => [other.id, other]))

    // A socket the node's type never declared is a door somebody placed inside
    // it. The socket's id IS the door node's own id, so the door can be named
    // live and the name can never be stale.
    const doorFor = (portId) => byId.get(portId) || null

    const takes = inputs.map((port) => {
        const isDoor = !declaredIn.has(port.id)
        const row = resolveInputRow(node, port, context, { isDoor })
        const door = isDoor ? doorFor(port.id) : null
        return {
            port,
            ...row,
            isDoor,
            doorLabel: door ? (door.values?.label || door.label || 'Door') : null,
            fromPortLabel: row.fromNode
                ? (getNodeOutputs(row.fromNode, allNodes).find((p) => p.id === row.edge?.fromPort)?.label
                    || row.edge?.fromPort
                    || null)
                : null
        }
    })

    const gives = outputs.map((port) => {
        const isDoor = !declaredOut.has(port.id)
        const row = resolveOutputRow(node, port, context, { document, isDoor })
        const door = isDoor ? doorFor(port.id) : null
        return { port, ...row, isDoor, doorLabel: door ? (door.values?.label || door.label || 'Door') : null }
    })

    // Slot 2 is a SUMMARY of facts already established per port, never a claim
    // of its own. "Worked out when the graph is read" is true whether the type
    // has its own case in computeNodeOutput or falls through to the stored
    // value — which is exactly why this phase does not try to say which. The
    // lines say which; a summary that guessed would be the paraphrase that rots.
    const sources = new Set(gives.map((row) => row.source))
    const worksItOut = {
        kind: gives.length === 0
            ? 'none'
            : sources.size > 1 ? 'mixed' : [...sources][0],
        byCode: gives.filter((row) => row.source === 'code').map((row) => row.port.label || row.port.id),
        byDoor: gives.filter((row) => row.source === 'door').map((row) => row.port.label || row.port.id),
        byWindow: gives.filter((row) => row.source === 'live').map((row) => row.port.label || row.port.id)
    }

    const render = type?.render || 'hidden'
    const isContainer = CONTAINER_TYPE_IDS.has(node?.typeId)

    return {
        typeId: node?.typeId || null,
        label: node?.label || type?.label || 'this node',
        kicker: family?.label || null,
        accent: family ? getFamilyColorForType(node.typeId) : null,
        known: Boolean(type),
        implemented: Boolean(type) && isNodeTypeImplemented(node.typeId),
        takes,
        gives,
        worksItOut,
        putsOnScreen: {
            kind: render === 'spatial-3d' ? 'room' : render === 'panel-2d' ? 'window' : 'nowhere'
        },
        inside: {
            kind: isContainer ? 'container' : 'code',
            count: isContainer ? childCount : 0,
            // Named, not described: the sheet says which kinds of node have an
            // inside by listing them, so the claim cannot drift from the set.
            containerLabels: PLACEABLE_CONTAINER_LABELS()
        }
    }
}
