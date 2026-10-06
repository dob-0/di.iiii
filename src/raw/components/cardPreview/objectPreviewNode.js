// A thing in the room (a Studio object) drawn as a picture on its card in
// Nodes. A thing is not a node, but the card preview draws a node's resolved
// values through the room's own body renderer, so the thing is handed over as
// the node of the same shape: a box is a Cube, a sphere a Sphere, with the
// thing's own size and colour. Pure data, no three.js (cardGeometry and the
// layout read it). A type with no node twin (light, text, group, model...)
// returns null and its card stays the small label card it was.
const TWIN = {
    box: 'geom.cube',
    sphere: 'geom.sphere',
    cone: 'geom.cone',
    cylinder: 'geom.cylinder',
    plane: 'geom.plane',
    torus: 'geom.torus'
}

const number = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : undefined)
const keep = (values) => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))

export const objectPreviewNode = (entity) => {
    const typeId = TWIN[entity?.type]
    if (!typeId) return null
    const primitive = entity.components?.primitive || {}
    const appearance = entity.components?.appearance || {}
    const common = {
        color: appearance.color,
        roughness: number(appearance.roughness),
        metalness: number(appearance.metalness),
        emissive: appearance.emissive,
        opacity: number(appearance.opacity)
    }
    let own = {}
    if (entity.type === 'box' && Array.isArray(primitive.size)) own = { size: primitive.size }
    else if (entity.type === 'sphere') own = { radius: number(primitive.radius) }
    else if (entity.type === 'cone') own = { radius: number(primitive.radius), height: number(primitive.height) }
    else if (entity.type === 'cylinder') own = { radius: number(primitive.radiusTop ?? primitive.radiusBottom), height: number(primitive.height) }
    else if (entity.type === 'plane') own = { width: number(primitive.width), height: number(primitive.depth) }
    else if (entity.type === 'torus') own = { radius: number(primitive.radius), tube: number(primitive.tube) }
    return { id: `preview:${entity.id}`, typeId, label: entity.name || entity.type, values: keep({ ...common, ...own }) }
}
