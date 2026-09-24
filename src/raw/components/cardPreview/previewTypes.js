import { getNodeType } from '../../../project/nodeRegistry.js'

// WHICH cards carry a live preview, and how it is made. Pure — cardGeometry
// reads it to grow the card, so it must never pull in three.js or a renderer.
//
// The rule the owner asked for (2026-09-14, "in TouchDesigner you always see
// what you do"): a node that makes something VISIBLE shows it on its card.
// That is every `render: 'spatial-3d'` type plus every type with a geometry
// output, minus the ones below, sorted into three ways of drawing:
//
//   body  — the node's own room body (RawViewport's renderNodeBody) with its
//           resolved values: cube, sphere, plane, cylinder, cone, torus, line,
//           circle.
//   shape — the node has no body of its own but CARRIES a shape: the geometry
//           descriptor it outputs (Geo, Merge, Array, Transform) or wears
//           (Constructor), drawn through the same renderer the room uses for
//           a worn shape.
//   light — a lit reference sphere, lit by the node's real light.

// Visible in the room, but not previewed on the card — each for a reason:
const NO_PREVIEW = new Set([
    // Nothing to see: a sound source.
    'media.audio',
    // A playing video element per card is exactly the cost the preview budget
    // exists to avoid, and it would start fetching media just to be looked at.
    'media.video',
    // The model's file lives in document.assets, which the graph surface is
    // not handed — every model card would be an empty black box. Add it when
    // the surface receives the asset map.
    'geom.model',
    // Controls, not things made: a camera gizmo and a desk shell.
    'world.camera',
    'universe.desk.3d'
])

const LIGHT_TYPES = new Set(['world.light', 'light.point', 'world.environment'])
// Spatial, but their room body is a placeholder (a floor tile, a wireframe
// box) — the thing worth seeing is the shape they hold.
const SHAPE_CARRIERS = new Set(['geom.geo', 'geom.constructor'])

const kindCache = new Map()

export const cardPreviewKind = (typeId) => {
    if (!typeId) return null
    if (kindCache.has(typeId)) return kindCache.get(typeId)
    const type = getNodeType(typeId)
    let kind = null
    if (type && !NO_PREVIEW.has(typeId)) {
        if (LIGHT_TYPES.has(typeId)) kind = 'light'
        else if (SHAPE_CARRIERS.has(typeId)) kind = 'shape'
        else if (type.render === 'spatial-3d') kind = 'body'
        else if ((type.outputs || []).some((port) => port.type === 'geometry')) kind = 'shape'
    }
    kindCache.set(typeId, kind)
    return kind
}

export const hasCardPreview = (typeId) => cardPreviewKind(typeId) !== null
