// SMART VIEW — the geometry decisions, as plain functions (no three.js, no React), so each
// one is tested on its own (smartViewGeometry.test.js). The renderer side is SmartView.jsx.
//
// What the owner asked for, 2026-09-29, on MOXIR: "when i move the mouse i go out from the
// building and nothing visible so can we make smart thing like, when something front it
// will be transparent". The methods are the field's, not invented here — see
// docs/architecture/SMART_VIEW.md for the sources:
//
//   occlusion fade   third-person camera practice (Unreal's DitherTemporalAA / camera
//                    depth fade, Unity's dithered "see-through" occluders): what stands
//                    between the camera and what it looks at is screen-door dithered away
//   cutaway          the architectural section box (Revit's Section Box, Navisworks
//                    sectioning) and The Sims' "walls down": from outside, the roof and
//                    the walls that face you are clipped so the room reads as a model
//   presets          named cameras, as every lighting visualiser ships them (Capture,
//                    WYSIWYG, Vectorworks Vision "saved views")
//   x-ray            Blender's X-Ray (Alt+Z): surfaces ghosted, what matters drawn solid
//   constraints      camera-controls' own polar-angle, distance and target-boundary limits
//
// Boxes here are { min: [x, y, z], max: [x, y, z] } in world metres, Y up.

export const VIEW_PRESET_IDS = ['floor', 'dj', 'top', 'side', 'rig', 'crane']
export const VIEW_PRESET_LABELS = {
    floor: 'Floor',
    dj: 'DJ',
    top: 'Top',
    side: 'Side',
    rig: 'Rig',
    crane: 'Crane'
}
// What each preset is, in words — the button's title and the wiki's list.
export const VIEW_PRESET_TITLES = {
    floor: 'Dance floor — eye height, in the crowd',
    dj: 'The DJ — from the riser, up at the rig',
    top: 'Top plan — straight down on the whole room',
    side: 'Side section — the room cut along its length through the rig',
    rig: 'Rig close-up — the lamps and what they hang from',
    crane: 'Crane — high over the crowd, looking down at the stage'
}

const EYE_HEIGHT = 1.7
const LIGHT_TYPES = new Set(['spotLight', 'pointLight', 'directionalLight', 'rectAreaLight', 'hemisphereLight'])
const PLACE_NAME = /\b(hall|building|venue|room|architecture|walls?|warehouse|factory|scan|place|interior)\b/i
// Mesh names the place pipeline writes (scripts/place/hall.py: hall-frame is the space
// frame, hall-deck the roof deck, hall-skylight the lanterns) and the usual words for
// the same parts in any other model.
const ROOF_MESH = /(roof|deck|space.?frame|hall-frame|skylight|lantern|ceiling|canopy|rafter|purlin)/i
const FLOOR_MESH = /(floor|ground|zone|tape|slab)/i

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)
const vec3 = (v) => (Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((n) => Number.isFinite(Number(n)))
    ? v.slice(0, 3).map(Number)
    : null)

// ---------------------------------------------------------------------------------------
// Which entities are what.

/** A lamp, a beam, a truss or other rig piece: never faded, never clipped. */
export const isRigEntity = (entity) => {
    if (!entity) return false
    const c = entity.components || {}
    return LIGHT_TYPES.has(entity.type)
        || Boolean(c.fixture) || Boolean(c.light) || Boolean(c.beam) || Boolean(c.piece)
}

/** A lamp (something that emits): the rig close-up frames these. */
export const isLampEntity = (entity) => {
    if (!entity) return false
    const c = entity.components || {}
    return LIGHT_TYPES.has(entity.type) || Boolean(c.fixture) || Boolean(c.light)
}

/**
 * Is this entity the building — something the smart view may fade, clip and ghost?
 * In order: the place pipeline's own hall (id `place-hall`, or any entity carrying a
 * `venuePlan`, scripts/place/import.mjs + src/rigbuild/venuePlan.js); an explicit
 * `components.viewRole: 'architecture'`; a MODEL whose name says it is a building.
 * A rig entity never is. Anything else is decided at runtime by bounds
 * (enclosingModelIds) — see SMART_VIEW.md.
 */
export const isArchitectureEntity = (entity) => {
    if (!entity || isRigEntity(entity)) return false
    const c = entity.components || {}
    if (c.viewRole === 'architecture') return true
    if (c.viewRole) return false
    if (entity.id === 'place-hall' || c.venuePlan) return true
    return entity.type === 'model' && PLACE_NAME.test(String(entity.name || ''))
}

export const classifyArchitecture = (entities = []) => {
    const ids = new Set()
    let source = 'none'
    for (const entity of entities || []) {
        if (!isArchitectureEntity(entity)) continue
        ids.add(entity.id)
        const c = entity.components || {}
        const why = entity.id === 'place-hall' || c.venuePlan ? 'place' : c.viewRole ? 'authored' : 'name'
        if (source === 'none' || why === 'place') source = why
    }
    return { ids, source }
}

/**
 * The bounds fallback: a model whose box holds most of the room's other things is the
 * room around them. `models` are { id, box }, `points` the other entities' positions.
 * A model qualifies when it holds at least `share` of the points (default a half) and
 * is at least 4 m across — a plinth under a sculpture holds its sculpture too.
 */
export const enclosingModelIds = (models = [], points = [], { share = 0.5, minSpan = 4 } = {}) => {
    const valid = (points || []).map(vec3).filter(Boolean)
    if (!valid.length) return []
    const out = []
    for (const model of models || []) {
        const box = model?.box
        if (!box) continue
        const span = Math.max(box.max[0] - box.min[0], box.max[2] - box.min[2])
        if (!(span >= minSpan)) continue
        const inside = valid.filter((p) => p[0] >= box.min[0] && p[0] <= box.max[0]
            && p[1] >= box.min[1] - 0.5 && p[1] <= box.max[1]
            && p[2] >= box.min[2] && p[2] <= box.max[2]).length
        if (inside / valid.length >= share) out.push(model.id)
    }
    return out
}

/** What a mesh inside the building is: 'floor' (never faded or cut), 'roof', or 'wall'. */
export const meshRole = (name = '', box = null, floorY = 0) => {
    const label = String(name || '')
    if (FLOOR_MESH.test(label)) return 'floor'
    if (box && (box.max[1] - box.min[1]) < 0.12 && box.min[1] <= floorY + 0.15) return 'floor'
    if (ROOF_MESH.test(label)) return 'roof'
    return 'wall'
}

// ---------------------------------------------------------------------------------------
// The room.

export const emptyBox = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })
export const isBoxEmpty = (box) => !box || !(box.max[0] >= box.min[0]) || !(box.max[1] >= box.min[1]) || !(box.max[2] >= box.min[2])
export const expandBox = (box, point) => {
    for (let i = 0; i < 3; i += 1) {
        box.min[i] = Math.min(box.min[i], point[i])
        box.max[i] = Math.max(box.max[i], point[i])
    }
    return box
}
export const unionBox = (a, b) => {
    if (isBoxEmpty(a)) return b ? { min: [...b.min], max: [...b.max] } : a
    if (isBoxEmpty(b)) return a
    return { min: a.min.map((v, i) => Math.min(v, b.min[i])), max: a.max.map((v, i) => Math.max(v, b.max[i])) }
}
export const boxCenter = (box) => box.min.map((v, i) => (v + box.max[i]) / 2)
export const boxSize = (box) => box.max.map((v, i) => v - box.min[i])

/**
 * The room the smart view works in, from the building's measured box.
 *   archBox      the architecture meshes' world box
 *   roofMinY     the lowest point of any 'roof' mesh (null when none is named)
 *   outline      the venue plan's outline [[x, z], ...] (src/rigbuild/venuePlan.js), when
 *                the place carries one: the walls' real line, not the model's reach
 *                (MOXIR's model has an entry platform outside the door)
 *   rigBox       the rig's box (lamps and pieces), or null
 * Returns null when there is no building.
 */
export const computeRoomFrame = ({ archBox, roofMinY = null, outline = null, rigBox = null } = {}) => {
    if (isBoxEmpty(archBox)) return null
    const min = [...archBox.min]
    const max = [...archBox.max]
    if (Array.isArray(outline) && outline.length >= 3) {
        const xs = outline.map((p) => num(p?.[0])).filter((v) => v !== null)
        const zs = outline.map((p) => num(p?.[1])).filter((v) => v !== null)
        if (xs.length >= 3 && zs.length >= 3) {
            min[0] = Math.min(...xs); max[0] = Math.max(...xs)
            min[2] = Math.min(...zs); max[2] = Math.max(...zs)
        }
    }
    const floorY = min[1]
    const height = max[1] - floorY
    // The roof cut: just under the lowest roof part when the model names one (MOXIR:
    // the space frame's bottom chord, 11 m); else the top fifth of the building.
    let roofCut = Number.isFinite(roofMinY) && roofMinY > floorY + 2 && roofMinY < max[1]
        ? roofMinY - 0.05
        : floorY + height * 0.8
    // Never below the top of the rig — the rig is what the cutaway is there to show.
    if (rigBox && !isBoxEmpty(rigBox)) roofCut = Math.max(roofCut, Math.min(max[1], rigBox.max[1] + 0.3))
    const bounds = { min, max }
    const center = boxCenter(bounds)
    const size = boxSize(bounds)
    return {
        bounds,
        floorY,
        roofCut,
        roofTop: max[1],
        center,
        radius: Math.hypot(size[0], size[1], size[2]) / 2
    }
}

/** Is the camera standing in the room (inside the footprint, under the roof cut)? */
export const isCameraInside = (position, frame, margin = 0.25) => {
    const p = vec3(position)
    if (!p || !frame) return true
    const { min, max } = frame.bounds
    return p[0] > min[0] + margin && p[0] < max[0] - margin
        && p[2] > min[2] + margin && p[2] < max[2] - margin
        && p[1] < frame.roofCut && p[1] > frame.floorY - 0.5
}

/** How far the camera is from the building's box (0 inside it). */
export const outsideDistance = (position, bounds) => {
    const p = vec3(position)
    if (!p || !bounds) return 0
    let sum = 0
    for (let i = 0; i < 3; i += 1) {
        const d = p[i] < bounds.min[i] ? bounds.min[i] - p[i] : p[i] > bounds.max[i] ? p[i] - bounds.max[i] : 0
        sum += d * d
    }
    return Math.sqrt(sum)
}

/**
 * The cutaway for a camera at `position`: where each cut stands, or null when it is off.
 *   roof   keep y < roof           (outside, or above the roof cut)
 *   xMax   keep x < xMax           (camera beyond the +x wall), xMin keep x > xMin, and z the same
 * A wall is cut `wallInset` metres inside its line, so the wall and the columns built into
 * it go together. Inside the room nothing is cut — the room is where you are.
 */
export const cutawayPlan = (position, frame, { wallInset = 1.2, margin = 0.25 } = {}) => {
    const off = { roof: null, xMax: null, xMin: null, zMax: null, zMin: null }
    const p = vec3(position)
    if (!p || !frame || isCameraInside(p, frame, margin)) return off
    const { min, max } = frame.bounds
    const plan = { ...off, roof: frame.roofCut }
    if (p[0] >= max[0] - margin) plan.xMax = max[0] - wallInset
    if (p[0] <= min[0] + margin) plan.xMin = min[0] + wallInset
    if (p[2] >= max[2] - margin) plan.zMax = max[2] - wallInset
    if (p[2] <= min[2] + margin) plan.zMin = min[2] + wallInset
    return plan
}

/** Does the cutaway keep this point (the fragment is drawn)? `section` is an extra plane. */
export const keptByPlan = (point, plan, section = null) => {
    const p = vec3(point)
    if (!p) return true
    if (plan) {
        if (plan.roof !== null && p[1] > plan.roof) return false
        if (plan.xMax !== null && p[0] > plan.xMax) return false
        if (plan.xMin !== null && p[0] < plan.xMin) return false
        if (plan.zMax !== null && p[2] > plan.zMax) return false
        if (plan.zMin !== null && p[2] < plan.zMin) return false
    }
    if (section && section.normal && (section.normal[0] * p[0] + section.normal[1] * p[1] + section.normal[2] * p[2] + section.constant) < 0) return false
    return true
}

// ---------------------------------------------------------------------------------------
// Occlusion.

/**
 * The first hit along a camera→target ray that is really drawn: a hit on a part the
 * cutaway already clipped is not an occluder. `hits` are { distance, point } sorted
 * nearest first (three's Raycaster order).
 */
export const firstDrawnHit = (hits = [], plan = null, section = null) => {
    for (const hit of hits || []) {
        if (!hit) continue
        if (keptByPlan(hit.point, plan, section)) return hit
    }
    return null
}

/**
 * How far the authored fog stands back. Fog is measured from the camera, so an orbit
 * that backs away from what it looks at loses it into the haze — outside the building
 * the whole room goes black (MOXIR: fog 0–32 m, the rig 50 m in from the end wall).
 * The fog moves back by whichever is larger: the camera's distance outside the building,
 * or how much farther from its target it stands than the room's opening shot does
 * (`referenceDistance`), so what you look at keeps the atmosphere it has from there.
 */
export const fogOffset = (outside, cameraToTarget, referenceDistance = 15) => Math.max(
    0,
    Number(outside) || 0,
    (Number(cameraToTarget) || 0) - (Number(referenceDistance) || 15)
)

/** Is the look blocked? A hit this far short of the target is in the way. */
export const isOccluding = (hitDistance, targetDistance, margin = 0.4) => (
    Number.isFinite(hitDistance) && Number.isFinite(targetDistance) && hitDistance < targetDistance - margin
)

/**
 * The sphere-cast, approximated the usual way (a centre ray plus four around it): the
 * offsets, in the camera's right/up axes, at the target end.
 */
export const sphereCastOffsets = (radius = 0.6) => [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]]

/** Move a scalar toward a goal, frame-rate independent (critically damped exponential). */
export const approach = (current, goal, delta, halfLife = 0.12) => {
    if (!Number.isFinite(current)) return goal
    const k = 1 - Math.pow(0.5, Math.max(0, delta) / Math.max(1e-3, halfLife))
    return current + (goal - current) * k
}

// ---------------------------------------------------------------------------------------
// The camera's limits.

/**
 * The largest polar angle (camera-controls: 0 = straight above the target, π = straight
 * below) that keeps the camera `clearance` above the floor at this orbit distance.
 */
export const floorMaxPolar = (targetY, distance, floorY = 0, clearance = 0.3) => {
    if (!(distance > 0)) return Math.PI
    const r = (floorY + clearance - targetY) / distance
    if (r <= -1) return Math.PI
    if (r >= 1) return 0
    return Math.acos(r)
}

/** How far the orbit may pull back: the building with room to see it whole. */
export const orbitMaxDistance = (frame, presetDistance = 0) => (
    frame ? Math.max(20, frame.radius * 1.6, (Number(presetDistance) || 0) * 1.1) : 500
)

/** Where the orbit target may go (camera-controls' setBoundary): the room, never under it. */
export const targetBoundary = (frame, margin = 2) => (frame ? {
    min: [frame.bounds.min[0] - margin, frame.floorY, frame.bounds.min[2] - margin],
    max: [frame.bounds.max[0] + margin, frame.roofTop + margin, frame.bounds.max[2] + margin]
} : null)

// ---------------------------------------------------------------------------------------
// The rig's core.

const median = (values) => {
    const v = [...values].sort((a, b) => a - b)
    const m = Math.floor(v.length / 2)
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * Where the rig IS, robustly: lamps spread through a room (MOXIR's column uplights run the
 * hall's length to z = 42) must not drag the views away from the stage. The centre is the
 * component-wise median of the lamp positions (robust to up to half being elsewhere); the
 * core is every lamp within `radius` metres of it on the floor plan; rig pieces (truss,
 * riser) join when their centre is within 1.5 × radius. Returns { lampBox, rigBox } or nulls.
 */
export const rigCore = (lampPoints = [], pieceBoxes = [], radius = 8) => {
    const points = (lampPoints || []).map(vec3).filter(Boolean)
    if (!points.length) {
        const boxes = (pieceBoxes || []).filter((b) => !isBoxEmpty(b))
        return { lampBox: null, rigBox: boxes.length ? boxes.reduce(unionBox, emptyBox()) : null }
    }
    const cx = median(points.map((p) => p[0]))
    const cz = median(points.map((p) => p[2]))
    const lampBox = emptyBox()
    for (const p of points) if (Math.hypot(p[0] - cx, p[2] - cz) <= radius) expandBox(lampBox, p)
    let rigBox = { min: [...lampBox.min], max: [...lampBox.max] }
    for (const b of pieceBoxes || []) {
        if (isBoxEmpty(b)) continue
        const c = boxCenter(b)
        if (Math.hypot(c[0] - cx, c[2] - cz) <= radius * 1.5) rigBox = unionBox(rigBox, b)
    }
    return { lampBox, rigBox }
}

// ---------------------------------------------------------------------------------------
// The presets.

const norm2 = (x, z) => {
    const l = Math.hypot(x, z)
    return l > 1e-6 ? [x / l, z / l] : null
}

/**
 * Which way the audience looks at the rig, as a unit [x, z] from the rig toward the
 * crowd: from the rig to the room's opening shot (the author put the visitor there), else +z.
 */
export const audienceDirection = (rigCenter, openingPosition) => {
    const r = vec3(rigCenter)
    const o = vec3(openingPosition)
    if (r && o) {
        const d = norm2(o[0] - r[0], o[2] - r[2])
        if (d) return d
    }
    return [0, 1]
}

const clampInto = (value, lo, hi) => Math.min(hi, Math.max(lo, value))

/** How far along the unit direction [dx, dz] from (x, z) before the footprint ends. */
const reachInside = (x, z, dx, dz, bounds, inset = 0.5) => {
    let t = Infinity
    if (dx > 1e-6) t = Math.min(t, (bounds.max[0] - inset - x) / dx)
    if (dx < -1e-6) t = Math.min(t, (bounds.min[0] + inset - x) / dx)
    if (dz > 1e-6) t = Math.min(t, (bounds.max[2] - inset - z) / dz)
    if (dz < -1e-6) t = Math.min(t, (bounds.min[2] + inset - z) / dz)
    return Math.max(0, t)
}

const round3 = (v) => v.map((n) => Math.round(n * 1000) / 1000)

/**
 * The six views, computed from the room and the rig.
 *   frame       computeRoomFrame's result
 *   rigBox      lamps + rig pieces (null: the room's centre stands in)
 *   lampBox     lamps only (null: the rig box)
 *   stageBox    the DJ riser / stage (null: none — the DJ stands on the floor)
 *   opening     the room's opening camera position (sets the audience side)
 *   aspect      the viewport's width / height
 *   authored    presentationState.viewPresets, sanitized: an authored view wins by id
 * Each: { id, key, label, title, position, target, fov, interior, section }.
 * `interior` views are fitted to a portrait phone INSIDE the plan (widen, don't back
 * through a wall); `section` is an extra cut plane { normal, constant } the side view
 * brings with it (three.js Plane semantics: kept where normal·p + constant ≥ 0).
 */
export const computeViewPresets = (frame, {
    rigBox = null,
    lampBox = null,
    stageBox = null,
    opening = null,
    aspect = 16 / 9,
    authored = []
} = {}) => {
    if (!frame) return []
    const { bounds, floorY, roofCut } = frame
    const rig = rigBox && !isBoxEmpty(rigBox) ? rigBox : { min: [frame.center[0] - 1, floorY, frame.center[2] - 1], max: [frame.center[0] + 1, floorY + 4, frame.center[2] + 1] }
    const lamps = lampBox && !isBoxEmpty(lampBox) ? lampBox : rig
    const rc = boxCenter(rig)
    const lc = boxCenter(lamps)
    const rigSize = boxSize(rig)
    const rigWidth = Math.max(rigSize[0], rigSize[2], 2)
    const [ax, az] = audienceDirection(lc, opening)
    // Perpendicular, toward the NEARER long wall: less building between you and the rig.
    let [px, pz] = [az, -ax]
    if (reachInside(rc[0], rc[2], px, pz, bounds, 0) > reachInside(rc[0], rc[2], -px, -pz, bounds, 0)) {
        px = -px; pz = -pz
    }
    const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9
    const tanHalf = (fov) => Math.tan((fov * Math.PI) / 360)
    const stageTop = stageBox && !isBoxEmpty(stageBox) ? stageBox.max[1] : floorY
    const stageC = stageBox && !isBoxEmpty(stageBox) ? boxCenter(stageBox) : [rc[0], stageTop, rc[2]]
    const stageDepth = stageBox && !isBoxEmpty(stageBox) ? Math.abs(ax * boxSize(stageBox)[0]) + Math.abs(az * boxSize(stageBox)[2]) : 2
    // Where the eye goes: the hung lamps' height (a floor-standing lamp in the set must not
    // pull the look down to the floor).
    const lampMidY = Math.max(lc[1], lamps.max[1] - 1)
    const look = (from) => [lc[0], from, lc[2]]
    const inside = (x, z) => [clampInto(x, bounds.min[0] + 0.5, bounds.max[0] - 0.5), clampInto(z, bounds.min[2] + 0.5, bounds.max[2] - 0.5)]

    const out = {}

    // 1 · Dance floor: eye height, back in the crowd, on the rig's centre line.
    {
        // 12–18 m back: the authored MOXIR floor camera stands 15.5 m from the DJ.
        const want = clampInto(rigWidth * 0.7, 12, 18)
        const d = Math.min(want, Math.max(3, reachInside(lc[0], lc[2], ax, az, bounds) - 1))
        const [x, z] = inside(lc[0] + ax * d, lc[2] + az * d)
        out.floor = { position: [x, floorY + EYE_HEIGHT, z], target: look((floorY + EYE_HEIGHT + lamps.max[1]) / 2 + 0.5), fov: 55, interior: true }
    }
    // 2 · The DJ: standing at the riser's front edge, eye 1.7 m over the deck, up at the rig.
    {
        const front = stageDepth / 2 + 1.2
        const [x, z] = inside(stageC[0] + ax * front, stageC[2] + az * front)
        out.dj = { position: [x, stageTop + EYE_HEIGHT, z], target: [lc[0], lamps.max[1] - 0.5, lc[2]], fov: 80, interior: true }
    }
    // 3 · Top plan: straight down on the whole footprint, a long lens (reads as a plan).
    {
        const fov = 18
        const halfX = (bounds.max[0] - bounds.min[0]) / 2
        const halfZ = (bounds.max[2] - bounds.min[2]) / 2
        const d = Math.max(halfZ / tanHalf(fov), halfX / (tanHalf(fov) * safeAspect)) * 1.06
        const c = frame.center
        // A hair of +z so the screen's up is the room's -z (the far end at the top).
        out.top = { position: [c[0], floorY + d, c[2] + d * 1e-4], target: [c[0], floorY, c[2]], fov, interior: false }
    }
    // 4 · Side section: from beyond the nearer long wall, square to the audience axis, a
    //     section plane just past the rig so everything between is cut away.
    {
        const fov = 24
        const along = clampInto(Math.max(12, rigWidth * 1.5), 6, Math.max(6, Math.abs(ax) * (bounds.max[0] - bounds.min[0]) / 2 + Math.abs(az) * (bounds.max[2] - bounds.min[2]) / 2))
        const halfH = (roofCut - floorY) / 2 + 0.5
        const fit = Math.max(halfH / tanHalf(fov), along / (tanHalf(fov) * safeAspect)) * 1.05
        const toWall = reachInside(rc[0], rc[2], px, pz, bounds, 0)
        const d = Math.max(fit, toWall + 3)
        const cy = floorY + halfH - 0.5
        const rigHalf = Math.abs(px) * rigSize[0] / 2 + Math.abs(pz) * rigSize[2] / 2
        const cutAt = rigHalf + 2
        // keep the far side: -(p · x) + (p · rc + cutAt) ≥ 0
        const constant = px * rc[0] + pz * rc[2] + cutAt
        out.side = {
            position: [rc[0] + px * d, cy, rc[2] + pz * d],
            target: [rc[0], cy, rc[2]],
            fov,
            interior: false,
            section: { normal: [-px, 0, -pz], constant }
        }
    }
    // 5 · Rig close-up: the lamps filling the frame, from the audience side and a little up.
    {
        const fov = 45
        const r = Math.max(2, Math.hypot(...boxSize(lamps)) / 2) * 1.25
        const d = Math.max(4, r / Math.sin((fov * Math.PI) / 360))
        const dir = [ax + px * 0.35, 0.45, az + pz * 0.35]
        const l = Math.hypot(...dir)
        let pos = [lc[0] + (dir[0] / l) * d, lampMidY + (dir[1] / l) * d, lc[2] + (dir[2] / l) * d]
        const [x, z] = inside(pos[0], pos[2])
        pos = [x, clampInto(pos[1], floorY + 0.5, roofCut - 0.3), z]
        out.rig = { position: pos, target: [lc[0], lampMidY, lc[2]], fov, interior: true }
    }
    // 6 · Crane: a jib high over the crowd, looking down at the stage and the rig.
    {
        const d = Math.max(10, rigWidth * 2)
        const [x, z] = inside(rc[0] + ax * d * 0.9 + px * d * 0.25, rc[2] + az * d * 0.9 + pz * d * 0.25)
        const y = Math.max(floorY + 4, Math.min(roofCut - 0.6, lamps.max[1] + 4))
        out.crane = { position: [x, y, z], target: [rc[0], (stageTop + lampMidY) / 2, rc[2]], fov: 50, interior: true }
    }

    const byId = new Map((authored || []).map((v) => [v.id, v]))
    return VIEW_PRESET_IDS.map((id, index) => {
        const computed = out[id]
        const own = byId.get(id)
        const view = own
            ? { ...computed, position: own.position, target: own.target, fov: own.fov ?? computed.fov, section: own.id === 'side' ? computed.section : null, authored: true }
            : { ...computed, authored: false }
        return {
            id,
            key: String(index + 1),
            label: own?.label || VIEW_PRESET_LABELS[id],
            title: VIEW_PRESET_TITLES[id],
            ...view,
            position: round3(view.position),
            target: round3(view.target),
            section: view.section || null
        }
    })
}

/**
 * Authored views (`presentationState.viewPresets`), read, never written: a list of
 * { id, position, target, fov?, label? } whose id is one of the six. Anything else drops.
 * The rig agents' cameras.json names map: floor-15m → floor, dj-up → dj.
 */
export const sanitizeViewPresets = (raw) => {
    if (!Array.isArray(raw)) return []
    const seen = new Set()
    const out = []
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        const id = String(item.id || '')
        if (!VIEW_PRESET_IDS.includes(id) || seen.has(id)) continue
        const position = vec3(item.position)
        const target = vec3(item.target)
        if (!position || !target) continue
        const fov = num(item.fov)
        seen.add(id)
        out.push({
            id,
            position,
            target,
            fov: fov !== null && fov > 1 && fov < 170 ? fov : null,
            label: typeof item.label === 'string' && item.label.trim() ? item.label.trim().slice(0, 16) : null
        })
    }
    return out
}

/** `#view-top` → 'top'. Anything else → null. */
export const parseViewHash = (hash) => {
    const m = /^#?view-([a-z]+)$/.exec(String(hash || '').trim())
    return m && VIEW_PRESET_IDS.includes(m[1]) ? m[1] : null
}
export const viewHash = (id) => (VIEW_PRESET_IDS.includes(id) ? `#view-${id}` : '')

/** The preset a key press names ('1'–'6'), or null. */
export const presetForKey = (key) => {
    const i = Number(key)
    return Number.isInteger(i) && i >= 1 && i <= VIEW_PRESET_IDS.length && String(key) === String(i) ? VIEW_PRESET_IDS[i - 1] : null
}
