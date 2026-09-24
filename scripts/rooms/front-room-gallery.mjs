#!/usr/bin/env node
// front-room-gallery.mjs — stands the studio deck up as a walk through the front room.
//
// The front room (`main-dii-project`) holds the 76 slides of the studio deck as image
// entities. Until 2026-09-24 they lay flat on the floor in a 57 × 54 m grid, readable
// only from above. This script arranges them as a gallery: the studio wall behind the
// arrival point, then "the walk" — six U-shaped bays, one per practice, along a straight
// path to the right of the doors — and a closing wall. Every bay gets a typed title, a
// lamp whose beam wakes as a visitor approaches, and, where the practice has its own
// space, a door into it. The slides rise into place once when the room opens.
//
// It only uses what the public viewer renders today (image, text reveal, spotLight beam +
// proximity, portal, timeline). It never deletes: slides not in the layout are hidden
// (`runtime.visible = false`) and keep their place in the document. Its own entities
// carry fixed ids (`gallery-*`), so a second run updates them instead of adding copies.
// The grouping comes from the 2026-09-24 deck inventory (76 slides, 23 projects).
//
//   node scripts/rooms/front-room-gallery.mjs --base https://dev.diiii.xyz/serverXR [--token t] [--dry-run]
//
// Token: --token, else $GALLERY_API_TOKEN. Undo: the op log keeps the previous pose of
// every slide; `scripts/restore-entities.mjs` or the space's history restores it.

const PROJECT_ID = 'main-dii-project'

export const GROUPS = [
    { key: 'performance', label: 'performance · theatre', slides: [24, 25, 26, 14, 15, 16, 10, 11, 12, 13, 73, 76, 75] },
    { key: 'installations', label: 'installations', slides: [66, 67, 63, 64, 65, 60, 62, 49, 51, 50, 7, 8, 9, 71, 72] },
    { key: 'xr', label: 'XR · virtual', slides: [20, 21, 22, 23, 58, 59, 56, 57], door: { spaceId: 'platform-recordar', label: 'recordAR' } },
    { key: 'light', label: 'light · sound · live', slides: [27, 28, 30, 31, 32, 33, 68, 69, 70] },
    { key: 'commissions', label: 'commissions', slides: [35, 37, 36, 40, 41, 43, 44, 47, 46, 38, 39] },
    { key: 'education', label: 'education · residencies', slides: [52, 53, 54, 55, 18, 19], door: { spaceId: 'dilijan', label: 'Dilijan camp' } }
]
export const STUDIO = [1, 2, 3, 4, 6]
export const CLOSING = { slides: [77], door: { spaceId: 'network', label: 'the network' } }

const PITCH = 2.0          // metres between slide centres
const SLIDE_SCALE = 0.55   // an image plane is 3 m tall at scale 1 → 1.65 m
const EYE = 1.6            // slide centre height
const PATH_Z = 5           // the walk runs along +x at this z
const BAY_X = [22, 22, 37, 37, 52, 52]
const BAY_SIDE = ['north', 'south', 'north', 'south', 'north', 'south']

// An image entity bakes rotation-x = -π/2 into its mesh (it lies on the floor at
// rotation 0). Entity rotation [π/2, 0, -θ] (Euler XYZ) stands it up with its face
// toward (sin θ, 0, cos θ): Ry(θ)·Rx(π/2) decomposed.
export const uprightFacing = (theta) => [Math.PI / 2, 0, -theta]

const round = (v) => Math.round(v * 1000) / 1000
const place = (x, z, theta) => ({ position: [round(x), EYE, round(z)], rotation: uprightFacing(theta).map(round), scale: [SLIDE_SCALE, SLIDE_SCALE, SLIDE_SCALE] })

// One U-shaped bay: a back wall facing the path, two side walls facing each other.
export function bayLayout(slides, x, side) {
    const s = side === 'north' ? 1 : -1                 // north bays sit at z < PATH_Z
    const n = slides.length
    const back = Math.max(3, Math.ceil(n / 3))
    const perSide = Math.ceil((n - back) / 2)
    const mouthZ = PATH_Z - s * 2.5
    const backZ = mouthZ - s * (perSide + 1) * PITCH
    const halfW = ((back - 1) / 2) * PITCH + 1.2
    const out = []
    let k = 0
    for (let i = 0; i < back && k < n; i += 1, k += 1) {
        out.push({ n: slides[k], ...place(x + (i - (back - 1) / 2) * PITCH, backZ, s === 1 ? 0 : Math.PI) })
    }
    for (let j = 0; j < perSide; j += 1) {
        for (const [sx, theta] of [[-1, Math.PI / 2], [1, -Math.PI / 2]]) {
            if (k >= n) break
            out.push({ n: slides[k], ...place(x + sx * halfW, backZ + s * (j + 1) * PITCH, theta) }); k += 1
        }
    }
    return { slides: out, backZ, mouthZ, halfW, back, perSide, s }
}

// Rise once when the room opens: sunk and transparent, then up into place, bay by bay.
const riseTimeline = (pose, delay) => ({
    duration: delay + 1.8,
    loop: false,
    tracks: [
        { property: 'position', keys: [
            { t: 0, value: [pose.position[0], -1.2, pose.position[2]] },
            { t: delay, value: [pose.position[0], -1.2, pose.position[2]] },
            { t: delay + 1.8, value: pose.position, easing: 'ease' }] },
        { property: 'opacity', keys: [{ t: 0, value: 0 }, { t: delay, value: 0 }, { t: delay + 1.2, value: 1, easing: 'ease' }] }
    ]
})

const label = (id, text, x, z, delay) => ({
    id, type: 'text', name: text, parentId: null,
    components: {
        transform: { position: [round(x), 3.1, round(z)], rotation: [0, 0, 0], scale: [1, 1, 1] },
        appearance: { color: '#4df9ff', opacity: 1 },
        text: { value: text, variant: '2d', billboard: true, fontFamily: 'IBM Plex Sans, sans-serif', fontWeight: '500', fontStyle: 'normal', align: 'center', reveal: { mode: 'typewriter', speed: 22, delay, hold: 0 } }
    }
})

const lamp = (id, name, x, z) => ({
    id, type: 'spotLight', name, parentId: null,
    components: {
        transform: { position: [round(x), 5.2, round(z)], rotation: [0, 0, 0], scale: [1, 1, 1] },
        light: { color: '#ffd9a0', intensity: 3, distance: 12, angle: 0.6, penumbra: 0.5, decay: 2 },
        beam: { visible: true, haze: 0.35 },
        proximity: { radius: 9, falloff: 4, min: 0.08 }
    }
})

// A wall panel behind the slides, so a slide seen from outside a bay is a wall and not
// its own picture mirrored (image planes draw both faces). Boxes stand on the floor
// (BoxObject lifts the mesh by half its height) and are sized by `primitive.size`.
const WALL = { height: 2.7, depth: 0.08, color: '#0b0b4f' }
const wall = (id, x, z, length, yaw) => ({
    id, type: 'box', name: 'gallery wall', parentId: null,
    components: {
        transform: { position: [round(x), 0, round(z)], rotation: [0, round(yaw), 0], scale: [1, 1, 1] },
        appearance: { color: WALL.color, opacity: 1 },
        primitive: { size: [round(length), WALL.height, WALL.depth] }
    }
})

const door = (id, target, x, z, theta) => ({
    id, type: 'portal', name: target.label, parentId: null,
    components: {
        transform: { position: [round(x), 0.05, round(z)], rotation: [-1.5708, round(theta), 0], scale: [1.1, 1.1, 1.1] },
        appearance: { color: '#4df9ff', opacity: 1 },
        reference: { spaceId: target.spaceId, projectId: '', mode: 'portal', label: target.label, labelColor: '#ffffff', labelPlate: true, labelFont: 'default', style: 'gateway' },
        animation: { mode: 'float', speed: 0.7, amplitude: 0.08 }
    }
})

// The whole plan: where every slide goes, and the gallery's own entities.
export function buildPlan() {
    const poses = new Map()
    const extra = []
    // The studio wall stands behind the arrival point and faces it: turn round and it greets you.
    STUDIO.forEach((n, i) => poses.set(n, { ...place((STUDIO.length - 1 - i - 2) * PITCH, 24, Math.PI), delay: 2.4 }))
    extra.push(label('gallery-label-studio', 'the studio', 0, 24, 2.6))
    extra.push(wall('gallery-wall-studio', 0, 24.12, STUDIO.length * PITCH + 0.4, 0))
    GROUPS.forEach((group, g) => {
        const bay = bayLayout(group.slides, BAY_X[g], BAY_SIDE[g])
        const delay = 2.8 + Math.floor(g / 2) * 0.9
        bay.slides.forEach((p) => poses.set(p.n, { ...p, delay }))
        extra.push(label(`gallery-label-${group.key}`, group.label, BAY_X[g], bay.mouthZ, delay + 0.4))
        extra.push(wall(`gallery-wall-${group.key}-back`, BAY_X[g], bay.backZ - bay.s * 0.12, bay.back * PITCH + 0.4, 0))
        const sideMidZ = bay.backZ + bay.s * ((bay.perSide + 1) / 2) * PITCH
        for (const [side, sx] of [['left', -1], ['right', 1]]) {
            extra.push(wall(`gallery-wall-${group.key}-${side}`, BAY_X[g] + sx * (bay.halfW + 0.12), sideMidZ, bay.perSide * PITCH + 0.4, Math.PI / 2))
        }
        extra.push(lamp(`gallery-lamp-${group.key}`, `lamp · ${group.label}`, BAY_X[g], (bay.backZ + bay.mouthZ) / 2))
        if (group.door) extra.push(door(`gallery-door-${group.key}`, group.door, BAY_X[g], bay.mouthZ + (BAY_SIDE[g] === 'north' ? 1.4 : -1.4), BAY_SIDE[g] === 'north' ? Math.PI : 0))
    })
    CLOSING.slides.forEach((n) => poses.set(n, { ...place(58, PATH_Z, -Math.PI / 2), delay: 5.5 }))
    extra.push(label('gallery-label-closing', 'the network · contact', 58, PATH_Z - 2.2, 5.8))
    extra.push(wall('gallery-wall-closing', 58.12, PATH_Z, PITCH + 0.4, Math.PI / 2))
    extra.push(door('gallery-door-closing', CLOSING.door, 56.5, PATH_Z + 2.2, -Math.PI / 2))
    return { poses, extra }
}

// Slide number from the image's file name (`<id>__<N>.webp`, as the deck was uploaded).
export function slideNumbers(document) {
    const names = new Map((document.assets || []).map((a) => [a.id, a.name || a.filename || '']))
    const out = new Map()
    for (const e of document.entities || []) {
        if (e.type !== 'image') continue
        const name = names.get(e.components?.media?.assetId) || ''
        const m = name.match(/(\d+)\.(webp|png|jpe?g)$/i)
        if (m) out.set(e.id, Number(m[1]))
    }
    return out
}

export function planOps(document) {
    const { poses, extra } = buildPlan()
    const numbers = slideNumbers(document)
    const have = new Set((document.entities || []).map((e) => e.id))
    const ops = []
    let placed = 0
    let hidden = 0
    for (const [entityId, n] of numbers) {
        const pose = poses.get(n)
        const opId = crypto.randomUUID()
        if (!pose) {
            ops.push({ opId, type: 'updateEntity', payload: { entityId, patch: { components: { runtime: { visible: false } } } } })
            hidden += 1
            continue
        }
        const { delay, n: _n, ...transform } = pose
        ops.push({ opId, type: 'updateEntity', payload: { entityId, patch: { components: { transform, runtime: { visible: true }, timeline: riseTimeline(transform, delay) } } } })
        placed += 1
    }
    for (const entity of extra) {
        ops.push(have.has(entity.id)
            ? { opId: crypto.randomUUID(), type: 'updateEntity', payload: { entityId: entity.id, patch: entity } }
            : { opId: crypto.randomUUID(), type: 'createEntity', payload: { entity } })
    }
    return { ops, placed, hidden, extra: extra.length, unmatched: [...poses.keys()].filter((n) => ![...numbers.values()].includes(n)) }
}

const arg = (name) => {
    const i = process.argv.indexOf(`--${name}`)
    if (i === -1) return null
    const next = process.argv[i + 1]
    return next && !next.startsWith('--') ? next : true
}

async function main() {
    const base = String(arg('base') || '').replace(/\/$/, '')
    if (!base) throw new Error('--base is required')
    const token = arg('token') || process.env.GALLERY_API_TOKEN || ''
    const auth = token ? { Authorization: `Bearer ${token}` } : {}
    const res = await fetch(`${base}/api/projects/${PROJECT_ID}/document`, { headers: auth })
    if (!res.ok) throw new Error(`reading the document answered ${res.status}`)
    const body = await res.json()
    const plan = planOps(body.document)
    console.log(`${PROJECT_ID} @ ${base} v${body.version}: ${plan.placed} slides placed, ${plan.hidden} hidden (kept), ${plan.extra} gallery entities, ${plan.ops.length} ops`)
    if (plan.unmatched.length) console.log(`slides in the layout with no image in this room: ${plan.unmatched.join(', ')}`)
    if (arg('dry-run')) return console.log('--dry-run: nothing written')
    if (!token) throw new Error('a write needs --token or $GALLERY_API_TOKEN')
    const write = await fetch(`${base}/api/projects/${PROJECT_ID}/ops`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseVersion: body.version, ops: plan.ops })
    })
    const out = await write.json().catch(() => ({}))
    if (!write.ok) throw new Error(`ops answered ${write.status}: ${JSON.stringify(out).slice(0, 300)}`)
    console.log(`written; version ${body.version} → ${out.version ?? out.documentVersion ?? '?'}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => { console.error(`front-room-gallery: ${error.message}`); process.exit(1) })
}
