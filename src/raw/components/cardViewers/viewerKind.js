import { getNodeFamily, getNodeOutputs } from '../../../project/nodeRegistry.js'
import { isTopType } from '../../../project/tops/topOperators.js'
import { hasCardPreview } from '../cardPreview/previewTypes.js'

// WHICH cards get a TouchDesigner-style value viewer, and which port they
// read — pure, so cardGeometry (the card's box) and CardValueViewer (the
// card's face) read the exact same answer. See docs/ai/audits/
// 2026-09-14-raw-nodes.md cross-cutting defect #1: "38 number/logic/vector/
// colour types, and every device, are ports only."
//
// One viewer per card (owner, 2026-09-14: "choose one viewer per card to
// keep cards small"), so a card that already carries a live 3D preview or a
// picture operator's picture (cardPreview/previewTypes.js, TopThumbnail) has
// used its one slot already and gets nothing here.

// device.*/source.* is the hardware/bring-in family the audit names by
// example (MIDI, DMX, OSC, webcam, mic); agent.keeper is the one non-
// prefixed type the same sentence names ("keeper").
const DEVICE_TYPE_PREFIXES = ['device.', 'source.']
const DEVICE_TYPE_IDS = new Set(['agent.keeper'])

export const isDeviceType = (typeId) => {
    if (!typeId) return false
    if (DEVICE_TYPE_IDS.has(typeId)) return true
    return DEVICE_TYPE_PREFIXES.some((prefix) => typeId.startsWith(prefix))
}

const KIND_BY_PORT_TYPE = {
    number: 'number',
    boolean: 'boolean',
    signal: 'signal',
    color: 'color',
    vec3: 'vec3',
    string: 'string'
}

// Scoped to the 'numbers' family (value/math/logic/signal/vector/colour —
// the 38 types the audit counted) rather than every node type: a container
// (the 'room' family) already tells you its settings through its ports, and
// giving one a viewer too would grow every Scene/Studio/Desk card for a
// value nobody asked to watch tick.
const isViewableFamily = (typeId) => getNodeFamily(typeId)?.id === 'numbers'

/**
 * The viewer kind for a node's card, or null for no viewer at all.
 * `scopeNodes` matches cardGeometry/getNodeOutputs: a container's ports come
 * from doorway nodes living in a different scope.
 */
export const cardViewerKind = (node, scopeNodes = null) => {
    const typeId = node?.typeId
    if (!typeId) return null
    if (isTopType(typeId) || hasCardPreview(typeId)) return null
    if (isDeviceType(typeId)) return 'device'
    if (!isViewableFamily(typeId)) return null
    const primary = getNodeOutputs(node, scopeNodes)[0]
    if (!primary) return null
    return KIND_BY_PORT_TYPE[primary.type] || null
}

export const hasCardViewer = (node, scopeNodes = null) => cardViewerKind(node, scopeNodes) !== null

// Which output port the viewer reads. For a numbers-family card that is
// simply the primary (first) output. For a device it is the most
// status-like output the type declares — a `string` output if there is one
// (DMX/MIDI/OSC Out all publish one named `status`), else the first output
// of any kind, so the viewer never shows nothing when a real value exists.
export const cardViewerPort = (node, scopeNodes = null) => {
    const typeId = node?.typeId
    if (!typeId) return null
    const outputs = getNodeOutputs(node, scopeNodes)
    if (!outputs.length) return null
    if (isDeviceType(typeId)) return outputs.find((port) => port.type === 'string') || outputs[0]
    return outputs[0]
}
