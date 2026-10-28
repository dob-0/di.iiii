// Seed the head light test project: a dark corridor with the head light turned on.
//
//   node scripts/head-light/seed.mjs --api <origin of a scratch stack> [--space headlight] [--slug dark-school] [--spawn-z 3]
//
// Run against a SCRATCH stack (`di-dev up <tree> --api scratch`), never against a real database: it
// creates a space and a project, and replaces every entity in the project. Safe to run again.
// The scene: a corridor 6 m wide with an end wall 9.5 m from the spawn, a door and a locker on the left, two desks on the right,
// a ball, a pillar; no lamp at all, almost no ambient light, so the head light is the only light.
// worldState.headLight = { enabled: true } is what makes the Light button and the F key exist (src/components/headLight.js).
import crypto from 'node:crypto'

const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`)
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const API = arg('api', '').replace(/\/$/, '')
if (!API) {
    console.error('usage: node scripts/head-light/seed.mjs --api <origin of a scratch stack> [--space headlight] [--slug dark-school]')
    process.exit(2)
}
const SPACE = arg('space', 'headlight')
const SLUG = arg('slug', 'dark-school')

const call = async (method, path, body, okStatuses = []) => {
    const res = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    if (!res.ok && !okStatuses.includes(res.status)) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 240)}`)
    try { return { status: res.status, json: JSON.parse(text) } } catch { return { status: res.status, json: null } }
}

const THING = (type, name, position, scale, color) => ({
    id: crypto.randomUUID(),
    type,
    name,
    parentId: null,
    components: {
        transform: { position, rotation: [0, 0, 0], scale },
        appearance: { color, opacity: 1 },
        // Without this every object gets the walk-mode idle bob and slow spin (entityAnimation.js): walls drift.
        animation: { mode: 'static' }
    }
})

// A primitive's position is its BASE: it stands on that y (a box 3 m tall at y 0 fills 0..3), so floors sit below 0.
// Sizes: a box is 1 m on each side, a sphere 1.2 m across, a cylinder 1.2 m across and 1.2 m tall, all times the scale.
const entities = [
    THING('box', 'floor', [0, -0.2, 0], [6, 0.2, 17], '#4a4a52'),
    THING('box', 'ceiling', [0, 3.0, 0], [6, 0.2, 17], '#3d3d44'),
    THING('box', 'wall left', [-3.1, 0, 0], [0.2, 3, 17], '#8a7a66'),
    THING('box', 'wall right', [3.1, 0, 0], [0.2, 3, 17], '#66788a'),
    THING('box', 'wall end', [0, 0, -6.6], [6.4, 3, 0.2], '#8a8478'),
    THING('box', 'door', [-2.95, 0, -2.0], [0.12, 2, 1.0], '#5a3a28'),
    THING('box', 'desk 1', [1.5, 0, 0.5], [1.2, 0.8, 0.7], '#7a5c3a'),
    THING('box', 'desk 2', [1.5, 0, -1.8], [1.2, 0.8, 0.7], '#7a5c3a'),
    THING('box', 'locker', [-2.5, 0, -4.0], [0.6, 2.0, 0.7], '#3f5f4a'),
    THING('sphere', 'ball', [-0.5, 0, -1.0], [0.5, 0.5, 0.5], '#b03a3a'),
    THING('cylinder', 'pillar', [0.6, 0, -4.0], [0.5, 2.5, 0.5], '#a0a0a0'),
    // A bright red ball in the room behind the left wall: nobody in the corridor can see it.
    THING('sphere', 'behind the wall', [-5.0, 0.2, -2.0], [0.75, 0.75, 0.75], '#ff2020')
]

const world = {
    backgroundColor: '#020304',
    ambientLight: { color: '#0a1018', intensity: 0.05 },
    directionalLight: { color: '#0a0a14', intensity: 0, position: [8, 12, 4] },
    fog: { near: 8, far: 40, color: '#020304', enabled: true },
    // yaw Math.PI looks down the corridor toward the end wall (yaw 0 looks the other way).
    spawn: { x: 0, z: Number(arg('spawn-z', '3')), yaw: Math.PI, pitch: 0, altY: 1.6 },
    walkableAreas: [{ minX: -2.8, maxX: 2.8, minZ: -8.2, maxZ: 8 }],
    headLight: { enabled: true }
}

await call('POST', '/api/spaces', { label: 'Head light', slug: SPACE }, [409])
await call('POST', `/api/spaces/${SPACE}/projects`, { title: 'Dark school', slug: SLUG }, [409])
const { json: project } = await call('GET', `/api/projects/${SLUG}`)
const { json: document } = await call('GET', `/api/projects/${SLUG}/document`)
const existing = Object.values(document?.document?.entities || document?.entities || {})
const ops = [
    ...existing.map((e) => ({ type: 'deleteEntity', payload: { entityId: e.id } })),
    ...entities.map((entity) => ({ type: 'createEntity', payload: { entity } })),
    { type: 'setWorldState', payload: { patch: world } }
]
const baseVersion = project?.project?.documentVersion ?? project?.documentVersion ?? document?.version ?? 0
const done = await call('POST', `/api/projects/${SLUG}/ops`, { baseVersion, ops })
console.log(`seeded ${entities.length} entities into ${SPACE}/${SLUG} -> version ${done.json?.newVersion ?? JSON.stringify(done.json).slice(0, 160)}`)
console.log(`open: ${API}/${SPACE}/${SLUG}`)
