// LASER TEST — a laser unit's whole scan field as a square on the real surfaces (owner 2026-10-13 20:5x: "squares, so I
// see how many metres they throw … if I change the device place it changes … I will move the fixtures by hand").
// A Studio work tool: nothing here touches the document. Pure maths (no three import); LaserTest.jsx casts the rays.
//
// A UNIT is the beams that share a unit key (laserUnitKey): `beam.laser.unit` if the beam names one, else its id without a
// trailing letter (`…-41a`, `…-41b` → `…-41`), else the beam alone. A unit's square comes from its beams:
//   origin = the mean of their positions (a cube's lines leave one aperture: "their common origin"),
//   axis   = the normalised MEAN of their directions (the same rule as scripts/rigbuild/laser-frames.mjs fanOf: the rig
//            file's body rotation is not the comb's aim, so the unit's optical axis is where its lines point on average),
//   right  = axis × world up, up = right × axis (fanOf's frame; +X when the axis is vertical).
// The field is the square of half-angle H in the tangent plane, as laserLine.js fieldDirection draws it: a corner is the axis
// turned by tan(±H) along right and tan(±H) along up. Width/height of what lands on a surface are measured between the HIT
// points: width = mean of the top and bottom edges, height = mean of the left and right edges (they differ on a slanted wall).

const DEG = Math.PI / 180
export const DEFAULT_FIELD_HALF_DEG = 18.5 // laserLine.js FIELD_HALF_DEG (ASSUMED, fixtures.json)

const num = (n, fallback = 0) => (Number.isFinite(Number(n)) ? Number(n) : fallback)
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len = (a) => Math.hypot(a[0], a[1], a[2])
const norm = (a) => {
    const l = len(a)
    return l > 1e-9 ? scale(a, 1 / l) : [0, -1, 0]
}
const dist = (a, b) => len([a[0] - b[0], a[1] - b[1], a[2] - b[2]])

/** The unit a laser entity belongs to: beam.laser.unit, else the id without a trailing letter after a digit, else the id. */
export const laserUnitKey = (entity) => {
    const named = entity?.components?.beam?.laser?.unit
    if (typeof named === 'string' && named) return named
    const id = String(entity?.id ?? '')
    const m = /^(.*\d)[a-z]$/i.exec(id)
    return m ? m[1] : id
}

/** Is this entity a laser line (a beam with a laser on it)? */
export const isLaserEntity = (entity) => Boolean(entity?.components?.beam?.laser && typeof entity.components.beam.laser === 'object')

/** Map<unitKey, entity ids> over the visible laser lines of a document's entities. */
export const laserUnitsOf = (entities = []) => {
    const units = new Map()
    for (const entity of entities || []) {
        if (!isLaserEntity(entity) || entity.components?.runtime?.visible === false) continue
        const key = laserUnitKey(entity)
        if (!units.has(key)) units.set(key, [])
        units.get(key).push(entity.id)
    }
    return units
}

/** Every entity id sharing a unit with any of `ids` (Shift+G, "select grouped"); ids that are no laser line pass through. */
export const unitMembersOf = (entities = [], ids = []) => {
    const keyOf = new Map()
    for (const entity of entities || []) if (isLaserEntity(entity)) keyOf.set(entity.id, laserUnitKey(entity))
    const keys = new Set(ids.map((id) => keyOf.get(id)).filter((k) => k !== undefined))
    const out = new Set(ids)
    for (const entity of entities || []) {
        if (keyOf.has(entity.id) && keys.has(keyOf.get(entity.id)) && entity.components?.runtime?.locked !== true) out.add(entity.id)
    }
    return [...out]
}

/** The unit's field frame from its beams `[{ position, direction }]` (world). Null for no beams. */
export const unitFrame = (beams = []) => {
    if (!beams.length) return null
    const origin = scale(beams.reduce((s, b) => add(s, b.position), [0, 0, 0]), 1 / beams.length)
    const axis = norm(beams.reduce((s, b) => add(s, norm(b.direction)), [0, 0, 0]))
    let right = cross(axis, [0, 1, 0])
    right = len(right) < 1e-6 ? [1, 0, 0] : norm(right)
    const up = cross(right, axis)
    return { origin, axis, right, up }
}

/** The five rays of a unit: centre and the four corners in the order top-left, top-right, bottom-right, bottom-left. */
export const fieldRays = (frame, halfDeg = DEFAULT_FIELD_HALF_DEG) => {
    const t = Math.tan(Math.min(Math.max(num(halfDeg, DEFAULT_FIELD_HALF_DEG), 1), 60) * DEG)
    const at = (x, y) => norm(add(frame.axis, add(scale(frame.right, x * t), scale(frame.up, y * t))))
    return { centre: frame.axis, corners: [at(-1, 1), at(1, 1), at(1, -1), at(-1, -1)] }
}

/** The corners at distance `d` along each corner ray's own axis component (a flat wall square to the axis): for tests and the label without hits. */
export const cornersOnPlane = (frame, halfDeg, d) => fieldRays(frame, halfDeg).corners.map((r) => add(frame.origin, scale(r, d / dot(r, frame.axis))))

/**
 * What a unit's square measures from its hit points: `corners` (4 points, or null where any ray hit nothing) and the centre.
 * Returns { width, height, distance, edges: [top, right, bottom, left] } in metres — `complete` is false if a ray missed.
 */
export const measureSquare = (origin, corners, centre) => {
    const hit = (p) => Array.isArray(p) && p.length === 3
    const complete = corners.length === 4 && corners.every(hit)
    const out = { complete, centreHit: hit(centre), width: null, height: null, distance: hit(centre) ? dist(origin, centre) : null, edges: null }
    if (!complete) return out
    const [tl, tr, br, bl] = corners
    const edges = [dist(tl, tr), dist(tr, br), dist(br, bl), dist(bl, tl)]
    return { ...out, edges, width: (edges[0] + edges[2]) / 2, height: (edges[1] + edges[3]) / 2 }
}

const m = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1))

/** The label: "9.6 × 9.6 m · 14.2 m", or what is missing when a ray found no surface. */
export const squareLabel = (name, measure) => {
    if (!measure.centreHit && !measure.complete) return `${name} · no surface in reach`
    const size = measure.complete ? `${m(measure.width)} × ${m(measure.height)} m` : 'size: a corner found no surface'
    return `${name} · ${size}${measure.centreHit ? ` · ${m(measure.distance)} m` : ''}`
}
