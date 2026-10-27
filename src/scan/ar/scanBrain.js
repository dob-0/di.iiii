// THE SCAN BRAIN — one tick in, one decision out. Pure, so a whole walk can be
// replayed in a test and every kept frame accounted for.
//
// Per tick: motion from the last tick → warnings; the gate (keep a shot now?);
// coverage from the tick's surface points; the next spot every SPOT_EVERY_MS.
//
// THE GATE keeps a frame when ALL of:
//   * no warning is raised this instant (raw, not the held display);
//   * it is NEW: moved ≥ KEEP_MOVE_METRES or turned ≥ KEEP_TURN_DEG since the last
//     kept frame. 12° at a 70° wide lens leaves ~80 % overlap between neighbours —
//     the forward-overlap figure Metashape's manual asks for; 0.3 m at 2–3 m from a
//     wall is the same order. Settings with a source, not measurements;
//   * at least KEEP_GAP_MS since the last — the camera-access read and the upload
//     cost time on the phone.
// A frame the person asks for (Photograph) skips the novelty test, never the warnings.

import { length, quatAngle, sub, DEG } from './arMath.js'
import { addSamples, coverageSummary, createCoverage } from './coverage.js'
import { nextSpot } from './nextSpot.js'
import { createWarningFilter, focalPxFromProjection, poseMotion, readWarnings, DEFAULT_CAMERA } from './warnings.js'

export const KEEP_MOVE_METRES = 0.3
export const KEEP_TURN_DEG = 12
export const KEEP_GAP_MS = 400
export const SPOT_EVERY_MS = 1000
const PATH_STEP_METRES = 0.15

export const createScanBrain = ({ cellMetres } = {}) => {
    const coverage = createCoverage(cellMetres ? { cellMetres } : {})
    const filter = createWarningFilter()
    const path = []
    const shots = []
    let previous = null
    let lastKept = null
    let spot = null
    let spotAt = -Infinity

    const novel = (tick) => {
        if (!lastKept) return true
        if (tick.time - lastKept.time < KEEP_GAP_MS) return false
        return length(sub(tick.pose.position, lastKept.pose.position)) >= KEEP_MOVE_METRES
            || quatAngle(tick.pose.orientation, lastKept.pose.orientation) >= KEEP_TURN_DEG * DEG
    }

    const step = (tick, { asked = false } = {}) => {
        const motion = poseMotion(previous, tick)
        const camera = { ...DEFAULT_CAMERA, focalPx: focalPxFromProjection(tick.projection, tick.viewport?.width || 1920) }
        const reading = readWarnings({ motion, distance: tick.centreDistance, luma: tick.luma, camera })
        const shown = filter(reading, tick.time)
        const keep = reading.clear && (asked ? (!lastKept || tick.time - lastKept.time >= KEEP_GAP_MS) : novel(tick))
        addSamples(coverage, tick.samples, { cameraPosition: tick.pose.position, kept: keep })
        if (keep) {
            lastKept = tick
            shots.push(tick.pose.position)
        }
        const here = tick.pose.position
        if (!path.length || length(sub(here, path[path.length - 1])) >= PATH_STEP_METRES) path.push(here)
        if (tick.time - spotAt >= SPOT_EVERY_MS || keep) {
            spot = nextSpot(coverage, { position: here, floorY: 0, path })
            spotAt = tick.time
        }
        previous = tick
        return { keep, reading, shown, motion, spot }
    }

    return {
        step,
        coverage,
        path,
        shots,
        get spot() { return spot },
        summary: () => ({ ...coverageSummary(coverage), kept: shots.length })
    }
}
