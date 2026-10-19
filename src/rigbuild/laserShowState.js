// WHAT THE CUBES PLAY, AS THE ROOM KNOWS IT (MOXIR 2026-10-17).
//
// A network laser — a LaserCube line: `fixture.dmx === false`, its picture in `beam.laser` — is not a DMX lamp: no desk
// drives it, the laser server does. So while the room follows a live desk (useRigLook.js → dmxPose.js), such a line is
// drawn only while GET /laser/api/state says the show plays AND the cube that plays the line's group is armed. Anything
// else reads dark: no show, its cube disarmed or not mapped, a failed or slow read, a tier with no lasers (a hosted di).
// A laser rests dark.
//
// Which cube plays which line is the player's own answer, never guessed here: `show.cubes` [{ cube, group }]
// (serverXR/src/laser/laserShow.js state()), a group being a line's id without its trailing letters (rig-laser-1a … 1f →
// rig-laser-1, laserShow.js groupOfLine). Whether a cube emits is the engine's: `cubes` [{ id, armed }]
// (laserEngine.js state(): armed = the engine armed AND that cube armed).
//
// One poll for the page, every POLL_MS while anything listens, none when nothing does. No imports: dmxPose.js (pure,
// also run by node scripts) reads the helpers; the page's store and its same-origin URL live in useRigLook.js.

export const POLL_MS = 2000
// A read not answered by then counts as failed, so a stuck server never keeps a show drawn.
export const TIMEOUT_MS = 4000
// A tier with no laser lane (404: a hosted di) is asked again only this often.
export const OFF_POLL_MS = 60000
export const NOT_PLAYING = Object.freeze({ playing: false, groups: Object.freeze([]) })

/** A line's group: its id without the trailing letters (rig-laser-1a → rig-laser-1), else the id — laserShow.js groupOfLine. Pure. */
export const groupOfLine = (id) => {
    const s = String(id ?? '')
    const m = /^(.*\d)[a-z]+$/.exec(s)
    return m ? m[1] : s
}

/** A network laser: a lamp off DMX that draws laser lines (a LaserCube line). Pure. */
export const isNetworkLaser = (e) => e?.type === 'spotLight' && e.components?.fixture?.dmx === false && Boolean(e.components?.beam?.laser)

/** Does the room hold a network laser? (the page polls the laser server only while it does) Pure. */
export const hasNetworkLasers = (entities) => Array.isArray(entities) && entities.some(isNetworkLaser)

/** GET /laser/api/state as the room uses it: { playing: true, groups } — the line groups the show plays on an ARMED cube — else NOT_PLAYING. Pure. */
export const laserShowOf = (state) => {
    const show = state?.show
    if (!show || show.playing !== true || !Array.isArray(show.cubes)) return NOT_PLAYING
    const armed = new Set((Array.isArray(state.cubes) ? state.cubes : []).filter((c) => c?.armed === true).map((c) => String(c.id)))
    const groups = [...new Set(show.cubes.filter((m) => m?.group != null && armed.has(String(m.cube))).map((m) => String(m.group)))].sort()
    return Object.freeze({ playing: true, groups: Object.freeze(groups) })
}

/** Does the laser state light this network laser line (by entity id)? Pure. */
export const laserLineLit = (laserShow, id) => laserShow?.playing === true && Array.isArray(laserShow.groups) && laserShow.groups.includes(groupOfLine(id))

const same = (a, b) => a.playing === b.playing && a.groups.length === b.groups.length && a.groups.every((g, i) => g === b.groups[i])

/**
 * The page's poll of the laser server (useSyncExternalStore shape): reads `url()` at once when the first listener comes,
 * then every POLL_MS, and stops — forgetting the show, so it reads dark — when the last one leaves. One read at a time.
 * `url`, `fetchImpl` and the timers are injected (tests; useRigLook.js gives the page's same-origin URL).
 */
export const createLaserShowStore = ({ url = () => '/laser/api/state', fetchImpl = (...a) => fetch(...a), setTimer = setTimeout, clearTimer = clearTimeout } = {}) => {
    let snapshot = NOT_PLAYING
    const listeners = new Set()
    let timer = null
    let busy = false
    const read = async () => {
        const abort = typeof AbortController === 'function' ? new AbortController() : null
        const cut = setTimer(() => abort?.abort(), TIMEOUT_MS)
        try {
            const res = await fetchImpl(url(), { cache: 'no-store', signal: abort?.signal })
            if (!res?.ok) return { show: NOT_PLAYING, wait: res?.status === 404 ? OFF_POLL_MS : POLL_MS }
            return { show: laserShowOf(await res.json()), wait: POLL_MS }
        } catch {
            return { show: NOT_PLAYING, wait: POLL_MS }
        } finally {
            clearTimer(cut)
        }
    }
    const poll = async () => {
        timer = null
        if (busy) return
        busy = true
        const { show, wait } = await read()
        busy = false
        if (!listeners.size) return
        if (!same(snapshot, show)) {
            snapshot = show
            for (const fn of listeners) fn()
        }
        if (!timer) timer = setTimer(poll, wait)
    }
    const subscribe = (fn) => {
        listeners.add(fn)
        if (!timer && !busy) timer = setTimer(poll, 0)
        return () => {
            listeners.delete(fn)
            if (listeners.size) return
            if (timer) clearTimer(timer)
            timer = null
            snapshot = NOT_PLAYING // nobody draws from it: the next room starts dark until the server says otherwise
        }
    }
    return { subscribe, getSnapshot: () => snapshot }
}
