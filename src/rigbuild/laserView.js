// THE LASER VIEW — what MOXIR's LaserCubes draw, in the room (2026-10-05). Pure.
//
// The lasers run off the desk: the Nodes editor's Laser Out sends frames (shared/laserFrame.cjs) to
// the local server (serverXR/src/laser), which keeps the latest for all cubes and per cube. The room
// reads them back (GET /laser/api/frames) and draws each lit point as a beam: from the cube's lens,
// along its aim turned by the point's place in the field (x across, y up), out to the beam's reach.
// Drawn as thin additive lines in the haze, the ends of the lines trace the drawing on the roof.
//
// Field: ±LASER_HALF_FIELD_DEG each way from the aim. ASSUMED — the maker states the galvos' speed
// (35k pps at 7°), not the full projection angle; 30° is the common value for show lasers of this
// class. Replace with the measured field when a cube is on site.

import { spotAimDirection } from '../project/viewport/spotLightAim.js'

export const LASER_HALF_FIELD_DEG = 30
export const LASERCUBE_TYPE = 'ext-lc-ultra-mk2'
const DEG = Math.PI / 180

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** The room's LaserCubes in the order the server numbers them (cube-1 … cube-n): by entity id. Pure. */
export const laserCubesOf = (entities = []) => entities
    .filter((e) => e?.type === 'spotLight' && e.components?.fixture?.type === LASERCUBE_TYPE)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((e, i) => ({ entity: e, cubeId: `cube-${i + 1}` }))

/** A beam's direction for a point (x, y in -1…1) of a cube aimed along `aim`. Pure. */
export const beamDirection = (aim, x, y, halfFieldDeg = LASER_HALF_FIELD_DEG) => {
    const f = norm(aim)
    const up = Math.abs(f[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]
    const right = norm(cross(f, up))
    const upAxis = norm(cross(right, f))
    const tx = Math.tan(x * halfFieldDeg * DEG)
    const ty = Math.tan(y * halfFieldDeg * DEG)
    return norm([f[0] + right[0] * tx + upAxis[0] * ty, f[1] + right[1] * tx + upAxis[1] * ty, f[2] + right[2] * tx + upAxis[2] * ty])
}

/**
 * Line segments for every lit point of every cube's frame: positions and colours, two vertices a
 * segment, ready for a LineSegments geometry. Blank points (colour 0) draw nothing. Pure.
 * @param {object[]} entities  the room's entities as drawn (posed by the desk)
 * @param {{ all?: number[][]|null, byCube?: Record<string, number[][]> }} frames  GET /laser/api/frames
 * @returns {{ positions: Float32Array, colors: Float32Array, count: number }}
 */
export const laserSegments = (entities, frames, { maxPerCube = 600, halfFieldDeg = LASER_HALF_FIELD_DEG } = {}) => {
    const pos = []
    const col = []
    for (const { entity, cubeId } of laserCubesOf(entities)) {
        const points = frames?.byCube?.[cubeId] || frames?.all
        if (!Array.isArray(points) || !points.length) continue
        const t = entity.components.transform || {}
        const from = t.position || [0, 0, 0]
        const aim = spotAimDirection(t.rotation || [0, 0, 0])
        const reach = Math.max(1, Number(entity.components.light?.distance) || 40)
        const step = Math.max(1, Math.ceil(points.length / maxPerCube))
        for (let i = 0; i < points.length; i += step) {
            const [x, y, r, g, b] = points[i]
            if (!(r > 0 || g > 0 || b > 0)) continue
            const d = beamDirection(aim, x, y, halfFieldDeg)
            pos.push(from[0], from[1], from[2], from[0] + d[0] * reach, from[1] + d[1] * reach, from[2] + d[2] * reach)
            col.push(r, g, b, r, g, b)
        }
    }
    return { positions: new Float32Array(pos), colors: new Float32Array(col), count: pos.length / 6 }
}
