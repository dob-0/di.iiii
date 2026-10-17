// WHAT THE CUBES PLAY, AS THE ROOM KNOWS IT (2026-10-17, docs/ai/decisions/2026-10-17-cubes-follow-the-wall.md).
//
// The room draws a network laser's lines (a LaserCube: `fixture.dmx === false`, a `beam.laser`) only while the laser
// server says the cubes play (GET /laser/api/state → `show`), and on the SAME clock and blend as the wall:
// show time = server time + `clockShiftMs`, keyframes blended when `tween` (laserLine.js poseAt). One poll for the
// page, every POLL_MS while anything listens, none when nothing does. A tier without lasers (404, a hosted di) or a
// failed read reads `{ playing: false }`, and the poll backs off — a laser rests dark.
import { laserApiBase } from '../raw/utils/dmxRigClient.js'

export const POLL_MS = 2000
export const OFF_POLL_MS = 60000
export const NOT_PLAYING = Object.freeze({ playing: false })

/** GET /laser/api/state's `show` as the room uses it: { playing, project, clockShiftMs, tween } or NOT_PLAYING. Pure. */
export const laserShowOf = (state) => {
    const s = state?.show
    if (!s || s.playing !== true) return NOT_PLAYING
    const shift = Number(s.clockShiftMs)
    return {
        playing: true,
        project: typeof s.project === 'string' ? s.project : null,
        source: s.source || null,
        clockShiftMs: Number.isFinite(shift) ? shift : 0,
        tween: s.tween === true
    }
}

const same = (a, b) => a.playing === b.playing && a.project === b.project && a.clockShiftMs === b.clockShiftMs && a.tween === b.tween && a.source === b.source

/** A polling store (useSyncExternalStore shape). `fetchImpl` and the timers are injected for tests. */
export const createLaserShowStore = ({ fetchImpl = (...a) => fetch(...a), url = () => `${laserApiBase()}/state`, setTimer = setTimeout, clearTimer = clearTimeout } = {}) => {
    let snapshot = NOT_PLAYING
    const listeners = new Set()
    let timer = null
    const set = (next) => {
        if (same(snapshot, next)) return
        snapshot = next
        for (const fn of listeners) fn()
    }
    const poll = async () => {
        timer = null
        let wait = POLL_MS
        try {
            const res = await fetchImpl(url(), { cache: 'no-store' })
            if (!res.ok) { set(NOT_PLAYING); wait = res.status === 404 ? OFF_POLL_MS : POLL_MS } else set(laserShowOf(await res.json()))
        } catch {
            set(NOT_PLAYING)
        }
        if (listeners.size && !timer) timer = setTimer(poll, wait)
    }
    const subscribe = (fn) => {
        listeners.add(fn)
        if (listeners.size === 1 && !timer) timer = setTimer(poll, 0)
        return () => {
            listeners.delete(fn)
            if (!listeners.size && timer) { clearTimer(timer); timer = null }
        }
    }
    return { subscribe, getSnapshot: () => snapshot, poll }
}

let shared = null
/** The page's one store. */
export const getLaserShowStore = () => {
    if (!shared) shared = createLaserShowStore()
    return shared
}
