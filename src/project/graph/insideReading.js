// The reading the inside of a node is drawn from — IN and OUT as rows.
//
// Pure, so the frame can be tested without rendering and the rows cannot
// disagree with the room. Two existing truths are merged here and nothing new
// is derived:
//   - deriveNodeInspectorSections says which CONTROL a setting gets (a scrub
//     field, a colour, a menu) — the same fields the inspector shows;
//   - readNode says what is ON each port right now and where it came from.
// In this codebase a parameter IS an unwired input or a configInput, so IN is
// one list, not "settings" plus "inputs". Rows are matched by id: a field's
// first path segment is the port id.
import { arePortsCompatible, getNodeInputs, getNodeOutputs, getNodeType } from '../nodeRegistry.js'
import { deriveNodeInspectorSections } from './nodeInspectorSections.js'
import { readNode } from './nodeReading.js'

const labelOf = (node) => node?.values?.label && (node.typeId === 'port.in' || node.typeId === 'port.out')
    ? node.values.label
    : (node?.label || getNodeType(node?.typeId)?.label || 'a node')

/**
 * @param {object} node       the node you are standing inside
 * @param {object} options
 * @param {object[]} options.allNodes  EVERY node in the document (doors live in other scopes)
 * @param {object} options.context     a graph context built from the same document
 * @param {object} options.document    the document (for live-fed detection)
 * @param {(sections: object[]) => object[]} [options.decorateSections]
 *        the editor's augmentation of the fields (a picture operator's machine
 *        and camera menus list what the space can see right now)
 */
export function readInside(node, { allNodes = [], context = null, document = null, childCount = 0, decorateSections = null } = {}) {
    if (!node) return { reading: null, inRows: [], outRows: [] }
    const edges = context?.edges || document?.edges || []
    const wiredPortIds = edges.filter((edge) => edge?.toNodeId === node.id).map((edge) => edge.toPort)
    const reading = readNode(node, { allNodes, context, document, childCount })
    const rawSections = deriveNodeInspectorSections(node, { wiredPortIds })
    const sections = decorateSections ? decorateSections(rawSections) : rawSections
    const fields = sections.flatMap((section) => section.fields.map((field) => ({ ...field, component: field.component || section.id })))
    const takesById = new Map(reading.takes.map((row) => [row.port.id, row]))
    const byId = new Map(allNodes.map((other) => [other.id, other]))

    const inRows = []
    const seen = new Set()
    const configDefaults = Object.fromEntries((getNodeType(node.typeId)?.configInputs || []).map((port) => [port.id, port.default]))
    const defaults = { ...(getNodeType(node.typeId)?.defaultValues || {}), ...configDefaults }

    const rowFromTake = (take, field = null) => {
        const fromNode = take.fromNode ? (byId.get(take.fromNode.id) || take.fromNode) : null
        return {
            id: take.port.id,
            label: take.port.label || take.port.id,
            type: take.port.type || 'any',
            field,
            isPort: true,
            value: take.value,
            origin: take.origin,
            wired: take.origin === 'wire' || take.origin === 'wire-empty',
            edge: take.edge || null,
            fromNode,
            fromLabel: fromNode ? labelOf(fromNode) : null,
            fromPortLabel: take.fromPortLabel,
            // The wire starts at a card standing INSIDE this node — the custom
            // Cube's Noise, wired into its own Size.
            fromInside: Boolean(fromNode) && (fromNode.parentId || null) === node.id,
            isDoor: take.isDoor,
            doorLabel: take.doorLabel
        }
    }

    for (const field of fields) {
        const id = field.path?.[0]
        if (!id || seen.has(id)) continue
        seen.add(id)
        const take = takesById.get(id)
        if (take) {
            inRows.push(rowFromTake(take, field))
            continue
        }
        // A setting that is not a port: the operation menu, a picture
        // operator's parameters, where it runs. Nothing can be wired to it.
        const stored = node.values?.[id]
        inRows.push({
            id,
            label: field.label,
            type: field.portType || 'any',
            field,
            isPort: false,
            value: stored !== undefined ? stored : defaults[id],
            origin: stored !== undefined ? 'typed' : 'default',
            wired: false,
            edge: null,
            fromNode: null,
            fromLabel: null,
            fromPortLabel: null,
            fromInside: false,
            isDoor: false,
            doorLabel: null
        })
    }
    // Ports the sheet offers no field for — a door socket, a port the
    // operation leaves unused but a wire still reaches.
    for (const take of reading.takes) {
        if (seen.has(take.port.id)) continue
        seen.add(take.port.id)
        inRows.push(rowFromTake(take, null))
    }

    const outRows = reading.gives.map((give) => ({
        id: give.port.id,
        label: give.port.label || give.port.id,
        type: give.port.type || 'any',
        value: give.value,
        source: give.source,
        windowClosed: give.windowClosed,
        isDoor: give.isDoor,
        doorLabel: give.doorLabel,
        feeds: (give.feeds || []).map((feed) => ({ ...feed, toLabel: labelOf(feed.toNode) }))
    }))

    return { reading, inRows, outRows }
}

const childrenOf = (node, allNodes) => allNodes.filter((other) => other && other.id !== node?.id && (other.parentId || null) === node?.id)

/**
 * The outputs of the cards standing inside `node` that can be wired into one
 * of its inputs — what the IN rail's socket offers.
 */
export function innerSourcesFor(node, portType, allNodes = []) {
    const candidates = []
    for (const child of childrenOf(node, allNodes)) {
        for (const port of getNodeOutputs(child, allNodes)) {
            if (!arePortsCompatible(port.type, portType)) continue
            candidates.push({ nodeId: child.id, nodeLabel: labelOf(child), portId: port.id, portLabel: port.label || port.id, type: port.type })
        }
    }
    return candidates
}

/**
 * The inputs of the cards standing inside `node` that one of its outputs can
 * feed — what the OUT rail's socket offers.
 */
export function innerTargetsFor(node, portType, allNodes = []) {
    const candidates = []
    for (const child of childrenOf(node, allNodes)) {
        for (const port of getNodeInputs(child, allNodes)) {
            if (!arePortsCompatible(portType, port.type)) continue
            candidates.push({ nodeId: child.id, nodeLabel: labelOf(child), portId: port.id, portLabel: port.label || port.id, type: port.type })
        }
    }
    return candidates
}

/**
 * The op batch that wires `from` into `to`, replacing whatever already feeds
 * that input — an input reads ONE wire (the runtime keeps the first edge it
 * finds), so adding a second would draw a wire that carries nothing.
 */
export function wireOps(edges = [], edge) {
    const replaced = edges.filter((existing) => existing?.toNodeId === edge.toNodeId && existing?.toPort === edge.toPort)
    return [
        ...replaced.map((existing) => ({ type: 'deleteEdge', payload: { edgeId: existing.id } })),
        { type: 'createEdge', payload: { edge } }
    ]
}
