import { getNodeInputs } from '../../project/nodeRegistry.js'
import { isPictureType } from '../../project/tops/vjDeck.js'
import { cardPreviewKind } from '../components/cardPreview/previewTypes.js'

// What an empty preview box on a card is waiting for, in words. A picture
// operator with nothing wired into it and a shape node with no shape drew an
// identical black box — "needs an input" and "broken" looked the same (audit
// 2026-10-02: Difference, Level, Blur, Edge, Feedback, Blend, Tint, Reframe,
// Send Out, Analyze, Picture Out, Merge, Array, Transform, Geo, Constructor).
// Returns the sentence, or null when the box has something to show or the card
// has no box. Generators (Clouds, Gradient, Shape, Camera In) make their own
// picture and never get a hint; a Camera In with no camera says so itself.
const PLACE_INSIDE = new Set(['geom.geo', 'geom.constructor'])

export const cardEmptyHint = (node, { edges = [], hasShape = false, scopeNodes = null } = {}) => {
    if (!node?.typeId) return null
    const wired = (portId) => edges.some((edge) => edge.toNodeId === node.id && edge.toPort === portId)
    if (isPictureType(node.typeId)) {
        const pictureInputs = getNodeInputs(node, scopeNodes).filter((port) => port.type === 'texture')
        if (!pictureInputs.length || pictureInputs.some((port) => wired(port.id))) return null
        return `Wire a picture into ${pictureInputs[0].label}`
    }
    if (cardPreviewKind(node.typeId) !== 'shape' || hasShape) return null
    if (PLACE_INSIDE.has(node.typeId)) return 'Place shapes inside ›'
    const shapeInputs = getNodeInputs(node, scopeNodes).filter((port) => port.type === 'geometry')
    if (!shapeInputs.length) return null
    return `Wire a shape into ${shapeInputs[0].label}`
}
