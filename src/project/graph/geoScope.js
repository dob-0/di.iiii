// Studio standing INSIDE a Geo (owner's decision, 2026-10-02: "edit inside the
// Geo"). A Geo (`geom.geo`) is a place made in Nodes; Studio can be opened in
// one, and then Add, Objects, the gizmo and the inspector work on what stands
// in it — the SAME nodes, written with the SAME ops Nodes writes (createNode,
// updateNode, deleteNode), so Nodes sees every change live and nothing is
// copied, migrated or stored twice.
//
// Pure: no React, no dispatch. Studio's editor turns what these return into
// ops and panel rows; the tests read them directly.
//
// This overrides one rule of the 2026-09-23 layers plan (unit 5, "node-made
// things are read-only in Studio") for the inside of a Geo only. The rest
// holds: no new field, no new op, no migration of any project's data.

import { createNode, getNodeType } from '../nodeRegistry.js'
import { buildNodeValues } from './nodeGraphAuthoring.js'

export const GEO_TYPE_ID = 'geom.geo'

// What Studio's Create window can put inside a Geo, keyed by the Create
// window's own keys (src/project/entityPalette.js) so the window itself does
// not change. Only the shapes and the lamp that exist as nodes are offered;
// `light.point` is the lamp Nodes' palette places today (`world.light` is
// retired from it, nodeRegistry.js). Files map by kind.
export const GEO_ADD_TYPES = Object.freeze({
    box: 'geom.cube',
    sphere: 'geom.sphere',
    cone: 'geom.cone',
    cylinder: 'geom.cylinder',
    plane: 'geom.plane',
    torus: 'geom.torus',
    pointLight: 'light.point',
    model: 'geom.model',
    video: 'media.video',
    audio: 'media.audio'
})

const isSpatial = (node) => getNodeType(node?.typeId)?.render === 'spatial-3d'

export const isGeoNode = (node) => node?.typeId === GEO_TYPE_ID

// Every Geo in the project, in document order — the Geo switcher's list.
export const listGeoNodes = (document) => (document?.nodes || []).filter(isGeoNode)

export const findGeoNode = (document, geoId) => {
    if (!geoId) return null
    return (document?.nodes || []).find((node) => node.id === geoId && isGeoNode(node)) || null
}

// The switcher's list: every Geo with its path as its name, and a number
// after any name two Geos share — two cards both called "Geo" (the palette's
// default) must still read as two choices.
export const listGeoChoices = (document) => {
    const choices = listGeoNodes(document).map((geo) => ({ id: geo.id, label: geoPathLabel(document, geo.id) || 'Geo' }))
    const total = new Map()
    for (const choice of choices) total.set(choice.label, (total.get(choice.label) || 0) + 1)
    const seen = new Map()
    return choices.map((choice) => {
        if (total.get(choice.label) < 2) return choice
        const n = (seen.get(choice.label) || 0) + 1
        seen.set(choice.label, n)
        return { ...choice, label: `${choice.label} ${n}` }
    })
}

// What stands in a Geo: its direct children that stand in a room. A Time or a
// Math node kept inside the Geo is wiring, not a thing, and stays a Nodes
// matter. A Geo inside the Geo is listed — it is a thing standing there — and
// is opened from the switcher.
export const listGeoChildren = (document, geoId) => {
    if (!geoId) return []
    return (document?.nodes || []).filter((node) => (node.parentId || null) === geoId && isSpatial(node))
}

// A Geo's path for the switcher's label: "Room / Table / Shelf", outermost
// first. Bounded, because parentId is patchable to anything and can loop.
export const geoPathLabel = (document, geoId) => {
    const byId = new Map((document?.nodes || []).map((node) => [node.id, node]))
    const names = []
    const seen = new Set()
    let current = byId.get(geoId)
    while (current && !seen.has(current.id) && names.length < 16) {
        seen.add(current.id)
        if (isGeoNode(current)) names.unshift(current.label || 'Geo')
        current = current.parentId ? byId.get(current.parentId) : null
    }
    return names.join(' / ')
}

// One row of Studio's Objects list for a node, in the shape that list already
// reads (id, name, type, parentId). No visibility or lock: a node has neither,
// and the list only draws those buttons when it is handed their handlers.
export const geoChildRow = (node) => ({
    id: node.id,
    name: node.label || getNodeType(node.typeId)?.label || node.typeId,
    type: (getNodeType(node.typeId)?.label || node.typeId).toLowerCase(),
    parentId: null,
    components: {}
})

// A card place for the new node on the Geo's own canvas in Nodes: one step
// to the right of the right-most card already in that scope, level with it,
// so a card made from Studio never lands on top of one made in Nodes.
const CARD_STEP = 320
const nextCardPlace = (document, geoId) => {
    const siblings = (document?.nodes || []).filter((node) => (node.parentId || null) === geoId)
    if (!siblings.length) return { graphX: 120, graphY: 120 }
    const rightMost = siblings.reduce((best, node) => ((node.graphX || 0) > (best.graphX || 0) ? node : best), siblings[0])
    return { graphX: (rightMost.graphX || 0) + CARD_STEP, graphY: rightMost.graphY || 0 }
}

// The ops that put a new thing inside a Geo: ONE createNode, the op Nodes'
// palette writes, with parentId = the Geo. `position` is local to the Geo
// (Studio shows the Geo's inside, so the room's point IS the Geo's point).
// Returns null when the Geo is not there or the kind has no node.
export const buildAddIntoGeoOps = (document, geoId, kind, {
    position = null,
    src = null,
    label = null,
    createdBy = null,
    id = undefined
} = {}) => {
    if (!findGeoNode(document, geoId)) return null
    const typeId = GEO_ADD_TYPES[kind]
    if (!typeId || !getNodeType(typeId)) return null
    const occupied = listGeoChildren(document, geoId)
        .map((node) => node.values?.position)
        .filter(Array.isArray)
    const place = Array.isArray(position) ? { point: position } : {}
    const values = buildNodeValues(typeId, src ? { src } : {}, place, { occupied })
    const node = createNode(typeId, {
        id,
        values,
        label: label || undefined,
        parentId: geoId,
        createdBy,
        ...nextCardPlace(document, geoId)
    })
    if (!node) return null
    return { node, ops: [{ type: 'createNode', payload: { node } }] }
}

// A new, empty Geo in the top room — the switcher's "+ Geo". Stood clear of
// the Geos already there, on the floor, as Nodes' palette stands one.
export const buildNewGeoOps = (document, { createdBy = null, id = undefined } = {}) => {
    const occupied = (document?.nodes || [])
        .filter((node) => !node.parentId && isSpatial(node))
        .map((node) => node.values?.position)
        .filter(Array.isArray)
    const values = buildNodeValues(GEO_TYPE_ID, {}, {}, { occupied })
    const count = listGeoNodes(document).length
    const node = createNode(GEO_TYPE_ID, {
        id,
        values,
        label: count ? `Geo ${count + 1}` : 'Geo',
        parentId: null,
        createdBy,
        ...nextCardPlace(document, null)
    })
    return { node, ops: [{ type: 'createNode', payload: { node } }] }
}

const sameVec = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length
    && a.every((value, index) => Math.abs(value - b[index]) < 1e-6)

// The gizmo let go: the node's own position, rotation and scale, the values
// Nodes' room reads (RawViewport's NodeVisual). Scale is written only when it
// changed — a Cube has no Scale port, and a translate must not add one.
export const nodeTransformPatch = (node, { position, rotation, scale } = {}) => {
    const values = node?.values || {}
    const patch = {}
    if (Array.isArray(position) && !sameVec(position, values.position)) patch.position = position.map(Number)
    if (Array.isArray(rotation) && !sameVec(rotation, values.rotation || [0, 0, 0])) patch.rotation = rotation.map(Number)
    if (Array.isArray(scale) && !sameVec(scale, values.scale || [1, 1, 1])) patch.scale = scale.map(Number)
    return patch
}

// Only the keys that changed, so an edit to one field is one small op and
// its undo puts back that field alone.
export const nodeValuesPatch = (node, nextValues = {}) => {
    const values = node?.values || {}
    const patch = {}
    for (const [key, value] of Object.entries(nextValues || {})) {
        if (JSON.stringify(value) !== JSON.stringify(values[key])) patch[key] = value
    }
    return patch
}

const axisFields = (label, path, { step = 0.1, min } = {}) => ['X', 'Y', 'Z'].map((axis, index) => ({
    label: `${label} ${axis}`,
    component: 'values',
    path: [path, index],
    type: 'number',
    step,
    ...(min !== undefined ? { min } : {})
}))

// The basic values, in the shape Studio's inspector already draws
// (StudioInspector: X/Y/Z triplets become one compact row). Transform first,
// then the node's own plain ports — colour, numbers, switches, the file it
// plays. Wire-only ports and vectors other than the transform stay in Nodes.
export const geoNodeInspectorSections = (node, { assetKinds = true } = {}) => {
    const type = getNodeType(node?.typeId)
    if (!type) return []
    const ports = type.inputs || []
    // All three for every thing: Nodes' room applies position, rotation and
    // scale to any standing node (RawViewport's NodeVisual), port or not.
    const transform = [
        ...axisFields('Position', 'position'),
        ...axisFields('Rotation', 'rotation', { step: 0.05 }),
        ...axisFields('Scale', 'scale', { step: 0.05, min: 0.01 })
    ]
    const ASSET_KIND = { 'geom.model': 'model', 'media.video': 'video', 'media.audio': 'audio' }
    const own = []
    for (const port of ports) {
        if (['position', 'rotation', 'scale'].includes(port.id)) continue
        const base = { label: port.label || port.id, component: 'values', path: [port.id] }
        if (port.id === 'src' && ASSET_KIND[node.typeId] && assetKinds) {
            own.push({ ...base, type: 'asset', assetKind: ASSET_KIND[node.typeId] })
        } else if (port.type === 'color') {
            own.push({ ...base, type: 'color' })
        } else if (port.type === 'boolean') {
            own.push({ ...base, type: 'checkbox' })
        } else if (port.type === 'number') {
            own.push({ ...base, type: 'number', step: port.step ?? 0.1, ...(port.min !== undefined ? { min: port.min } : {}), ...(port.max !== undefined ? { max: port.max } : {}) })
        } else if (port.type === 'vec3') {
            own.push(...axisFields(port.label || port.id, port.id, { step: 0.05 }))
        } else if (port.type === 'string' && port.id !== 'textureUrl') {
            own.push({ ...base, type: 'text' })
        }
    }
    return [
        { id: 'transform', label: 'Transform', component: 'values', fields: transform },
        ...(own.length ? [{ id: 'appearance', label: type.label || 'Values', component: 'values', fields: own }] : [])
    ]
}

// What the inspector reads for a node: the transform with its defaults filled
// in, so an unset rotation or scale reads 0 and 1 instead of an empty box.
export const geoNodeInspectorValues = (node) => {
    const values = node?.values || {}
    return {
        values: {
            ...values,
            position: Array.isArray(values.position) ? values.position : [0, 0, 0],
            rotation: Array.isArray(values.rotation) ? values.rotation : [0, 0, 0],
            scale: Array.isArray(values.scale) ? values.scale : [1, 1, 1]
        }
    }
}
