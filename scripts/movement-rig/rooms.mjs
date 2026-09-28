/**
 * rooms.mjs — the two rooms the rig walks.
 *
 * 1. `movrig` — a synthetic calibration room, built here from code so it is
 *    identical on every run and every branch: a 60 × 60 m floor, an entrance
 *    Gate, a row of 1 m-wide pillars every 4 m on both sides of the walking
 *    line (things to strafe past), a striped back wall (a yaw reference: one
 *    stripe per 10° seen from the spawn), and four coloured compass towers.
 *    Everything is `animation: static` so nothing idles in the shots.
 *
 * 2. `moxir` — the MOXIR hall (Charentsavan), the owner's real venue, copied
 *    from the machine's local tier with the repo's own space-bundle exporter
 *    (read-only on the source) and imported into the rig's throwaway data
 *    root. Its sha256 is recorded in the results so a BEFORE and an AFTER can
 *    be proven to have walked the same hall; pass `--moxir-bundle <file>` to
 *    pin one.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'

const STATIC = { mode: 'static', speed: 1, amplitude: 1 }
const box = (id, name, position, scale, color, extra = {}) => ({
    id, type: 'box', name,
    components: {
        transform: { position, rotation: [0, 0, 0], scale },
        appearance: { color, opacity: 1 },
        animation: STATIC,
        ...extra
    }
})

export const SYNTH = {
    space: 'movrig',
    project: 'movrig-room',
    // The walker stands here, facing -z (yaw π), at the start of every trial.
    spawn: { x: 0, z: 26, yaw: Math.PI, pitch: 0, altY: 1.6 },
    // A solid box 3 m wide, its near face at z ≈ 20.1.
    solid: { name: 'the Gate (3 × 3 m box)', x: 0, planeZ: 20.1 }
}

export function syntheticDocument() {
    const entities = []
    entities.push(box('floor', 'Floor', [0, -0.05, 0], [60, 0.1, 60], '#3b3f46'))
    // Floor grid lines every 2 m so ground speed reads to the eye.
    for (let i = -14; i <= 14; i++) {
        entities.push(box(`floor-x-${i}`, `Floor line x ${i * 2}`, [i * 2, 0.005, 0], [0.04, 0.01, 60], '#5b616b'))
        entities.push(box(`floor-z-${i}`, `Floor line z ${i * 2}`, [0, 0.006, i * 2], [60, 0.01, 0.04], '#5b616b'))
    }
    entities.push(box('gate', 'Gate', [0, 1.5, 20], [3, 3, 0.2], '#e0b050'))
    for (let k = 0; k < 10; k++) {
        const z = 18 - k * 4
        const color = k % 2 ? '#c8ccd4' : '#7a8290'
        entities.push(box(`pillar-l-${k}`, `Pillar L${k}`, [-4, 2, z], [1, 4, 1], color))
        entities.push(box(`pillar-r-${k}`, `Pillar R${k}`, [4, 2, z], [1, 4, 1], color))
    }
    // Back wall at z = -26, 52 m wide; stripes placed so each is 10° apart
    // seen from the spawn (0, 26): x = 52 · tan(θ).
    entities.push(box('wall-back', 'Wall back', [0, 3, -26], [52, 6, 0.3], '#2a2d33'))
    for (let deg = -25; deg <= 25; deg += 5) {
        const x = 52 * Math.tan((deg * Math.PI) / 180)
        entities.push(box(`stripe-${deg}`, `Stripe ${deg} deg`, [x, 3, -25.8], [deg % 10 === 0 ? 0.5 : 0.2, 6, 0.1], deg === 0 ? '#ff4040' : '#f0f0f0'))
    }
    for (const [name, pos, color] of [
        ['Tower north', [0, 4, -28], '#ff5555'],
        ['Tower east', [28, 4, 0], '#55ff55'],
        ['Tower south', [0, 4, 28], '#5599ff'],
        ['Tower west', [-28, 4, 0], '#ffdd33']
    ]) entities.push(box(`tower-${name.split(' ')[1]}`, name, pos, [1.5, 8, 1.5], color))
    return {
        version: 4,
        projectMeta: { title: 'Movement rig — calibration room' },
        entities,
        nodes: [], edges: [],
        worldState: {
            backgroundColor: '#101216',
            spawn: SYNTH.spawn,
            gridVisible: false,
            fog: { near: 80, far: 300, color: null, enabled: false },
            ambientLight: { color: '#ffffff', intensity: 0.9 },
            directionalLight: { color: '#ffffff', intensity: 0.8, position: [-20, 30, 10] }
        },
        presentationState: {
            mode: 'fixed-camera', entryView: 'fixed-camera',
            fixedCamera: { projection: 'perspective', position: [0, 1.6, 26], target: [0, 1.6, 0], fov: 60, zoom: 1, near: 0.05, far: 400, locked: false }
        }
    }
}

export const MOXIR = {
    space: 'moxir',
    project: 'moxir-hall',
    // The hall's own authored spawn (worldState.spawn): the back of the nave
    // facing the stage.
    spawn: { x: 0, z: 24.2, yaw: Math.PI, pitch: 0, altY: 1.6 },
    // Standing in the nave facing the east column row (x ≈ +11..13, one
    // column every 6 m in z): strafing along z sweeps the columns past.
    columnsView: { x: 6, z: 30, yaw: Math.PI / 2, pitch: 0.05, altY: 1.6 },
    // The 9 m crowd barrier in front of the stage, 1.1 m high, face at z ≈ 7.54.
    solid: { name: 'the crowd barrier', x: 0, planeZ: 7.54 },
    trussY: 6.3
}

export const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')

export async function seedSynthetic(api) {
    const { space, project } = SYNTH
    const got = await api('GET', `/api/spaces/${space}`)
    if (!got.ok) {
        const r = await api('POST', '/api/spaces', { slug: space, label: 'Movement rig' })
        if (!r.ok) throw new Error(`seed: create space ${space} → HTTP ${r.status} ${JSON.stringify(r.body)}`)
    }
    const list = await api('GET', `/api/spaces/${space}/projects`)
    if (!(list.body?.projects || []).some((p) => p.id === project)) {
        const r = await api('POST', `/api/spaces/${space}/projects`, { slug: project, title: 'Calibration room' })
        if (!r.ok) throw new Error(`seed: create project → HTTP ${r.status} ${JSON.stringify(r.body)}`)
    }
    const put = await api('PUT', `/api/projects/${project}/document`, syntheticDocument())
    if (!put.ok) throw new Error(`seed: put document → HTTP ${put.status} ${JSON.stringify(put.body)}`)
    await publish(api, space, project)
}

export async function publish(api, space, project) {
    const r = await api('PATCH', `/api/spaces/${space}`, { isPublic: true, publishedProjectId: project })
    if (!r.ok) throw new Error(`publish ${space} → HTTP ${r.status} ${JSON.stringify(r.body)}`)
}
