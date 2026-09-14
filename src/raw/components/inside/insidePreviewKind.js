import { CONTAINER_TYPE_IDS, getNodeFamily, getNodeType, isNodeTypeImplemented } from '../../../project/nodeRegistry.js'
import { isTopType } from '../../../project/tops/topOperators.js'
import { cardPreviewKind } from '../cardPreview/previewTypes.js'

// What SEE shows inside a node — chosen by what the node MAKES, in one order,
// for every node there is. Pure, so every registered type can be checked to
// land on exactly one kind.
//
//   picture  a picture operator's full output
//   window   the node's own window content (text, webcam, DMX, keeper…)
//   object3d the real body or shape, through the card preview renderer
//   texture  a live frame on its first picture output
//   number · signal · colour · vec3   a 10-second scope of its outputs
//   text     the words it gives
//   device   something sent out of the browser: status + what goes out now
//   holds    a container with nothing of its own to look at: what it holds
//   none     nothing of its own runs; the room reads its settings
//   unbuilt  a set of ports with nothing behind them yet

export const SCOPE_KINDS = new Set(['number', 'signal', 'colour', 'vec3'])

const byOutputType = {
    number: 'number',
    boolean: 'signal',
    signal: 'signal',
    color: 'colour',
    vec3: 'vec3',
    string: 'text',
    texture: 'texture'
}

export function insidePreviewKind(node) {
    const typeId = node?.typeId
    const type = getNodeType(typeId)
    if (!type) return 'none'
    if (!isNodeTypeImplemented(typeId)) return 'unbuilt'
    if (isTopType(typeId)) return 'picture'
    // A Scene's window is a whole room with its own WebGL context, and entering
    // it already fills the screen with that room — a second copy in SEE would
    // be the double mount risk 4 of the design forbids.
    if (typeId === 'universe.world') return 'holds'
    if (type.render === 'panel-2d') return 'window'
    if (cardPreviewKind(typeId)) return 'object3d'
    const outputs = type.outputs || []
    if (getNodeFamily(typeId)?.id === 'send-out') return 'device'
    const first = outputs.find((port) => byOutputType[port.type])
    if (first) return byOutputType[first.type]
    if (CONTAINER_TYPE_IDS.has(typeId)) return 'holds'
    return 'none'
}
