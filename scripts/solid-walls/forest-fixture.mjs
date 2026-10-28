#!/usr/bin/env node
// A moonlit forest to walk in: the test project for solid walls (src/components/solidWalls.js).
// Simple trees (a cylinder trunk, a cone top), fog, a moon, and one cabin wall. Nothing here is a production:
// it is a fixture, seeded, so the same command always makes the same project.
//
//   node scripts/solid-walls/forest-fixture.mjs --api http://127.0.0.1:<api port>/serverXR --slug forest-walls-on
//   node scripts/solid-walls/forest-fixture.mjs --api ... --slug forest-walls-off --off      # the same forest, walls not solid
//   add --trees 400 for a bigger forest (the build-time measurement)
//
// On aylmo the API is the scratch serverXR of `di-dev up <tree> --api scratch` (`di-dev ls` shows its port).
// Method: the project is made through the same two routes the app uses: POST a project into a space, PUT its document.

const arg = (name, fallback = null) => {
    const i = process.argv.indexOf(`--${name}`)
    if (i === -1) return fallback
    const next = process.argv[i + 1]
    return next && !next.startsWith('--') ? next : true
}

// the same numbers every run
const lcg = (seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }

let counter = 0
const entity = (type, name, position, primitive, color, extra = {}) => ({
    id: `forest-${String(++counter).padStart(4, '0')}`,
    type,
    name,
    parentId: null,
    components: {
        transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] },
        primitive,
        appearance: { color, opacity: 1, textureAssetId: null, roughness: 0.95, metalness: 0, emissive: '#000000', emissiveIntensity: 1, ...extra },
        // walls and trunks stand still: the walk viewer gives every unparented object a slow float and spin unless it says static
        animation: { mode: 'static', speed: 1, amplitude: 1 }
    }
})

// NOTE (seen in the first browser pictures): a cylinder or a cone stands ON its position (its base is at the position's y),
// a box is centred on it. So a trunk is placed at y = 0, its cone at the trunk's top, and the ground and wall boxes by their centre.

// Clear zones for the look proof: the head-on trunk is at (0, 2); the cabin wall runs along z = -3 from x = 0 to 16;
// the approach to it (x 1..17, z -4..6) and a lane at x = -8 for the frame-time walk have no random tree.
const blocked = (x, z) => (Math.abs(x) < 2.5 && z > 0 && z < 12)
    || (x > 0 && x < 18 && z > -5 && z < 7)
    || (Math.abs(x + 8) < 1.8 && z > -20 && z < 12)

export function buildForestDocument({ solidWalls = true, trees = 60 } = {}) {
    counter = 0
    const rand = lcg(2026)
    const entities = []
    entities.push(entity('box', 'Ground', [0, -0.1, 0], { shape: 'box', size: [160, 0.2, 160] }, '#2a4a38'))
    // the head-on trunk, straight ahead of the spawn
    entities.push(entity('cylinder', 'Trunk (head-on)', [0, 0, 2], { shape: 'cylinder', radiusTop: 0.2, radiusBottom: 0.26, height: 3.2 }, '#7a5a3e'))
    entities.push(entity('cone', 'Top (head-on)', [0, 2.9, 2], { shape: 'cone', radius: 1.5, height: 3.4 }, '#2f5e3d'))
    // the cabin wall
    entities.push(entity('box', 'Cabin wall', [8, 1.4, -3], { shape: 'box', size: [16, 2.8, 0.3] }, '#b8946a'))
    entities.push(entity('box', 'Cabin roof edge', [8, 2.95, -3.4], { shape: 'box', size: [16.6, 0.2, 1.4] }, '#3a2c20'))
    let placed = 0
    let guard = 0
    while (placed < trees && guard < trees * 40) {
        guard += 1
        const x = (rand() - 0.5) * 56
        const z = (rand() - 0.78) * 48
        if (blocked(x, z) || Math.hypot(x, z - 2) < 1.2) continue
        const h = 2.6 + rand() * 1.8
        const r = 0.14 + rand() * 0.14
        entities.push(entity('cylinder', `Trunk ${placed + 1}`, [x, 0, z], { shape: 'cylinder', radiusTop: r * 0.75, radiusBottom: r, height: h }, '#6e5038'))
        entities.push(entity('cone', `Top ${placed + 1}`, [x, h - 0.4, z], { shape: 'cone', radius: 1.1 + rand() * 0.7, height: 2.8 + rand() * 1.2 }, '#2a5638'))
        placed += 1
    }
    return {
        projectMeta: { title: 'Moonlit forest' },
        entities,
        worldState: {
            backgroundColor: '#0a1224',
            gridVisible: false,
            fog: { near: 6, far: 40, color: '#14233f', enabled: true },
            ambientLight: { color: '#9fb4e6', intensity: 1.1 },
            directionalLight: { color: '#cfdcff', intensity: 2.6, position: [-14, 22, 9] },
            // the visitor starts at the edge of the clearing, facing the head-on trunk (forward is -z at yaw = PI)
            spawn: { x: 0, z: 9, yaw: Math.PI, pitch: 0, altY: 1.6 },
            solidWalls: solidWalls ? { enabled: true } : null
        }
    }
}

async function call(api, method, route, body) {
    const response = await fetch(`${api}${route}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* keep the text */ }
    if (!response.ok) throw new Error(`${method} ${route} -> ${response.status} ${text.slice(0, 300)}`)
    return json
}

async function main() {
    const api = String(arg('api', '')).replace(/\/$/, '')
    if (!api) throw new Error('--api <http://127.0.0.1:port/serverXR> is required')
    const slug = String(arg('slug', 'forest-walls-on'))
    const trees = Number(arg('trees', 60))
    const off = Boolean(arg('off', false))
    let space = arg('space', null)
    if (!space) {
        const spaces = await call(api, 'GET', '/api/spaces')
        const list = Array.isArray(spaces) ? spaces : spaces?.spaces || []
        space = (list.find((s) => (s.id || s.spaceId) === 'main') || list[0])?.id || 'main'
    }
    // a project that is already there is filled again, so the command can be re-run
    let id = null
    try { await call(api, 'GET', `/api/projects/${slug}`); id = slug } catch { /* not there yet */ }
    if (!id) {
        const made = await call(api, 'POST', `/api/spaces/${space}/projects`, { title: slug, slug })
        id = made?.id || made?.projectId || made?.project?.id || made?.meta?.projectId
    }
    if (!id) throw new Error(`no project id in ${JSON.stringify(made).slice(0, 300)}`)
    const doc = buildForestDocument({ solidWalls: !off, trees })
    await call(api, 'PUT', `/api/projects/${id}/document`, doc)
    const back = await call(api, 'GET', `/api/projects/${id}`)
    const got = back?.document || back
    console.log(JSON.stringify({ space, slug, id, entities: got?.entities?.length ?? null, solidWalls: got?.worldState?.solidWalls ?? null }))
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => { console.error(error.message); process.exit(1) })
}
