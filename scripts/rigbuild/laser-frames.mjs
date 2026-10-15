/**
 * laser-frames.mjs — the frames a rig's lasers draw, in time (2026-10-13, ledger N562). Pure but for reading fixtures.json.
 *
 * Two pictures, both inside the scan field the fixtures record gives each kind (scan_field_half_deg):
 *   (a) every UPlight UP-LA40WF: a MATRIX — N still lines on a grid, centred on the unit's own aim, written as its static
 *       `frame` (laserLine.js §4: each line a lit point after a blank move, so each carries 1/(2N) of the unit's time);
 *   (b) every LaserCube Ultra MK2: a slow FAN SWEEP — all its lines swing together, side to side, by ±A degrees over
 *       `period` seconds, written as `frames` (laserLine.js §6: one lit point per frame per line, full duty).
 *
 * ASSUMED, and said so wherever it is written:
 *   - the cube's field ±18.5 deg (fixtures.json lasercube.scan_field_half_deg: the maker's ">37 deg" read as optical, full);
 *   - the 40 W's field: none is published — the cube's ±18.5 deg is taken (fixtures.json laser.scan_field_half_deg);
 *   - a cube's optical axis is the MEAN of its lines' directions (the rig file's cube rotation is the v2.7 body, not the
 *     v2.8 comb), so a line's place in the field is its angle from that mean;
 *   - a swept line is drawn to its static length (laserLine.js limit): where it ends on the walls is NOT re-checked.
 */
import fs from 'node:fs'
import path from 'node:path'

import { REPO_ROOT } from '../place/common.mjs'
import { driveOfHex } from '../../src/objectComponents/laserLine.js'

export const FIXTURES_FILE = 'scripts/place/fixtures/fixtures.json'
const KIND_OF_TYPE = { 'ext-lc-ultra-mk2': 'lasercube', 'up-la40wf': 'laser' }
const DEG = Math.PI / 180
const r4 = (v) => Math.round(v * 10000) / 10000

export const MATRIX_N = 9
export const MATRIX_SPREAD = 0.6       // the grid fills ±60 % of the field
export const FAN_DEG = 6
export const FAN_PERIOD_S = 24
export const FAN_STEPS = 48            // 0.5 s a step at 24 s

/** A kind's scan field half-angle from fixtures.json, with its basis (both are ASSUMED today). */
export const scanFieldOf = (type, file = path.join(REPO_ROOT, FIXTURES_FILE)) => {
    const kind = KIND_OF_TYPE[type]
    const spec = kind ? JSON.parse(fs.readFileSync(file, 'utf8')).kinds[kind]?.specs?.scan_field_half_deg : null
    if (!(Number(spec?.value) > 0)) throw new Error(`fixtures.json: no scan_field_half_deg for ${type}`)
    return { halfDeg: Number(spec.value), basis: spec.basis, note: spec.note || '' }
}

/**
 * A MATRIX of `n` lines on a near-square grid (cols = ceil(√n)), ±`spread` of the field around the unit's aim, in the
 * laser frame format [x, y, r, g, b] (x, y −1…1 of the field): a blank point, then the lit point, per line.
 */
export const matrixFrame = ({ n = MATRIX_N, spread = MATRIX_SPREAD, drive = [1, 1, 1] } = {}) => {
    const count = Math.max(1, Math.min(200, Math.round(n)))
    const s = Math.max(0, Math.min(1, spread))
    const cols = Math.ceil(Math.sqrt(count))
    const rows = Math.ceil(count / cols)
    const at = (i, k) => (k === 1 ? 0 : s * ((2 * (i + 0.5)) / k - 1))
    const out = []
    for (let i = 0; i < count; i += 1) {
        const x = r4(at(i % cols, cols))
        const y = r4(at(Math.floor(i / cols), rows))
        out.push([x, y, 0, 0, 0], [x, y, ...drive])
    }
    return out
}

const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l) }
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * Where each of a cube's lines sits in its field (degrees from the cube's axis = the mean of its lines' directions: yaw
 * across, pitch up, in the axis's own frame with world +Y up), and the sweep it can take: A = min(wanted, field − the
 * farthest line's |yaw|), never negative.
 */
export const fanOf = (dirs, { wantDeg = FAN_DEG, fieldHalfDeg }) => {
    const ds = dirs.map(norm)
    const axis = norm([0, 1, 2].map((k) => ds.reduce((sum, d) => sum + d[k], 0)))
    const right = norm(cross(axis, [0, 1, 0]))
    const up = cross(right, axis)
    const lines = ds.map((d) => ({ yaw: Math.atan2(dot(d, right), dot(d, axis)) / DEG, pitch: Math.asin(Math.max(-1, Math.min(1, dot(d, up)))) / DEG }))
    const widest = Math.max(...lines.map((l) => Math.abs(l.yaw)))
    const tallest = Math.max(...lines.map((l) => Math.abs(l.pitch)))
    return { lines, widest, tallest, amplitudeDeg: Math.max(0, Math.min(wantDeg, fieldHalfDeg - widest)) }
}

/**
 * A slow FAN SWEEP for one line: `steps` frames over `period` seconds, the line at x = A·sin(2π k / steps) of its own
 * aim (degrees over the field half-angle, so fieldDirection draws it at exactly A·sin degrees off).
 */
export const fanSweepFrames = ({ amplitudeDeg, fieldHalfDeg, steps = FAN_STEPS, period = FAN_PERIOD_S, drive = [1, 1, 1] }) => ({
    period,
    list: Array.from({ length: steps }, (_, k) => [[r4((amplitudeDeg * Math.sin((2 * Math.PI * k) / steps)) / fieldHalfDeg), 0, ...drive]])
})

/**
 * Every laser beam of a rig with its frames: Map<entity id "rig-laser-<beam>", { frame?, frames?, fieldHalfDeg }>, and
 * one row per unit for the record (what was written, what is ASSUMED). `dirOf(rotation)` gives a beam's direction.
 */
export const laserFramesOf = (rig, { dirOf, matrixN = MATRIX_N, spread = MATRIX_SPREAD, fanDeg = FAN_DEG, period = FAN_PERIOD_S, steps = FAN_STEPS, fieldOf = scanFieldOf } = {}) => {
    const byBeam = new Map()
    const units = []
    for (const f of rig.fixtures || []) {
        if (!KIND_OF_TYPE[f.type]) continue
        const beams = (f.laser?.beams || []).filter((b) => !b.off)
        if (!beams.length) continue
        const field = fieldOf(f.type)
        // Lit points at full (1, 1, 1): the room scales a frame by the look's colour (laserLine.js scanLines), so the
        // scene decides the colour as it does for a static line; the unit's own colour would be applied twice.
        const drive = [1, 1, 1]
        if (f.type === 'up-la40wf') {
            const frame = matrixFrame({ n: matrixN, spread, drive })
            for (const b of beams) byBeam.set(`rig-laser-${b.id}`, { frame, fieldHalfDeg: field.halfDeg })
            units.push({ unit: f.id, type: f.type, picture: 'matrix', lines: frame.length / 2, reachDeg: Math.max(...frame.flatMap((p) => [Math.abs(p[0]), Math.abs(p[1])])) * field.halfDeg, field })
            continue
        }
        // The rig's own frames win (scripts/place/laser_frames.py: the show's per-scene `laser` design, 2026-10-15).
        if (beams.every((b) => b.frames?.list?.length)) {
            for (const b of beams) byBeam.set(`rig-laser-${b.id}`, { frames: b.frames, fieldHalfDeg: b.fieldHalfDeg ?? field.halfDeg })
            units.push({ unit: f.id, type: f.type, picture: 'rig frames', lines: beams.length, frames: beams[0].frames.list.length, period: beams[0].frames.period, source: f.laser.frames_source || '', field })
            continue
        }
        const fan = fanOf(beams.map((b) => dirOf(b.r)), { wantDeg: fanDeg, fieldHalfDeg: field.halfDeg })
        const frames = fanSweepFrames({ amplitudeDeg: fan.amplitudeDeg, fieldHalfDeg: field.halfDeg, steps, period, drive })
        for (const b of beams) byBeam.set(`rig-laser-${b.id}`, { frames, fieldHalfDeg: field.halfDeg })
        units.push({ unit: f.id, type: f.type, picture: 'fan sweep', lines: beams.length, amplitudeDeg: fan.amplitudeDeg, widestDeg: fan.widest, tallestDeg: fan.tallest, reachDeg: fan.widest + fan.amplitudeDeg, period, steps, field })
    }
    return { byBeam, units }
}
