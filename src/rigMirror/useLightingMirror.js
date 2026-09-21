import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { lightingApiUrl, probeLightingDesk } from '../map/lightingLink.js'
import { fixtureColour } from './fixtureColour.js'

// THE REAL RIG, READ BACK INTO THE APP. Read-only, always.
//
// The lighting desk runs on a LOCAL di.iiii only (docs/architecture/LIGHTING_DESK.md).
// When it is there, this asks it what is patched and what each fixture is emitting
// right now, so the 3D room can show the rig as it actually is. It follows the rules
// src/map/lightingLink.js set for talking to the desk:
//   - PROBE FIRST, and a 200 is not a desk: a hosted tier serves index.html for every
//     address it does not know, so only real JSON from /light/api/summary counts.
//   - NEVER BLOCK, NEVER THROW. A missing desk is the normal case, not an error.
//   - NEVER WRITE. Every call here is a GET. Nothing in this file can move a lamp.
//
// Quiet by construction: a desk that was never there is asked ONCE per page and never
// again. A desk that was there and stopped answering is re-asked no faster than every
// 30 s. Nothing is logged either way.
//
// WHY THIS FOLDER IS NOT CALLED `light`: Vite's dev server proxies every address that
// starts with /light to the backend, and Vite serves source by its path under src/ —
// so a module at src/light/x.js is fetched as /light/x.js, handed to the lighting
// desk, and 404s. Seen, not guessed: the Rig button never drew in dev. Anything under
// src/ whose folder name starts with `light` is unreachable in dev.
//
// One store for the whole page, reference-counted: four split viewports showing the
// mirror are still one 10 Hz poll, not four.

export const DMX_POLL_MS = 100 // 10 Hz — the rate the desk's own stage view reads at
export const PATCH_POLL_MS = 5000 // fixtures + profiles: slow, so a re-patch shows up
export const REPROBE_MS = 30000 // a desk that went away is asked again no faster than this
const LOST_AFTER_FAILS = 5 // consecutive dropped DMX reads before the desk counts as gone

const ABSENT = Object.freeze({ present: false, fixtures: [], master: null, blackout: false })

const resolveFetch = (fetchImpl) => {
    if (typeof fetchImpl === 'function') return fetchImpl
    if (typeof fetch === 'function') return (...args) => fetch(...args)
    return null
}

const answeredJson = (response) => /^application\/json\b/i.test(response?.headers?.get?.('content-type') || '')

const getJson = async (call, url) => {
    const response = await call(url)
    if (!response?.ok || !answeredJson(response)) throw new Error('no lighting desk here')
    return response.json()
}

const round = (n) => Math.round(Number(n) || 0)

// The mirrored fixtures, from a patch (fixtures + profiles + roleKinds) and a DMX frame.
export const mirrorFixtures = (patch, dmx) => {
    if (!patch) return []
    return (patch.fixtures || []).map((fixture) => {
        const lit = fixtureColour({
            fixture,
            profile: patch.profiles?.[fixture.profile],
            dmx,
            emitters: patch.roleKinds?.emitter
        })
        return {
            id: fixture.id,
            index: fixture.index,
            name: fixture.name,
            x: Number(fixture.x) || 0,
            y: Number(fixture.y) || 0,
            colour: { r: round(lit.r), g: round(lit.g), b: round(lit.b) },
            level: Math.round(lit.level * 1000) / 1000
        }
    })
}

export function createLightingMirror({ fetchImpl, doc } = {}) {
    const theDocument = doc || (typeof document !== 'undefined' ? document : null)
    const listeners = new Set()
    let snapshot = ABSENT
    let signature = ''
    let watchers = 0
    let probed = false // asked at least once
    let probing = null
    let patch = null
    let dmxFrame = { dmx: {}, master: null, blackout: false }
    let dmxTimer = null
    let patchTimer = null
    let reprobeTimer = null
    let fails = 0
    let dmxInFlight = false
    let patchInFlight = false
    let disposed = false

    const hidden = () => Boolean(theDocument && theDocument.visibilityState === 'hidden')

    const publish = (next) => {
        const nextSignature = JSON.stringify(next)
        if (nextSignature === signature) return
        signature = nextSignature
        snapshot = next
        for (const listener of [...listeners]) listener()
    }

    const publishLive = () => publish({
        present: true,
        fixtures: mirrorFixtures(patch, dmxFrame.dmx),
        master: dmxFrame.master,
        blackout: Boolean(dmxFrame.blackout)
    })

    const stopPolling = () => {
        if (dmxTimer) { clearInterval(dmxTimer); dmxTimer = null }
        if (patchTimer) { clearInterval(patchTimer); patchTimer = null }
    }

    const pullPatch = async () => {
        const call = resolveFetch(fetchImpl)
        if (!call || patchInFlight || disposed) return
        patchInFlight = true
        try {
            const state = await getJson(call, lightingApiUrl('api/state'))
            patch = {
                fixtures: Array.isArray(state?.fixtures) ? state.fixtures : [],
                profiles: state?.profiles || {},
                roleKinds: state?.roleKinds || null
            }
            if (snapshot.present && watchers > 0) publishLive()
        } catch { /* the fast poll decides whether the desk has gone */ } finally {
            patchInFlight = false
        }
    }

    const lost = () => {
        stopPolling()
        patch = null
        fails = 0
        publish(ABSENT)
        if (reprobeTimer || disposed) return
        reprobeTimer = setInterval(() => {
            if (hidden()) return
            probe(true)
        }, REPROBE_MS)
    }

    const pullDmx = async () => {
        const call = resolveFetch(fetchImpl)
        if (!call || dmxInFlight || disposed) return
        dmxInFlight = true
        try {
            const body = await getJson(call, lightingApiUrl('api/dmx'))
            fails = 0
            dmxFrame = { dmx: body?.dmx || {}, master: body?.master ?? null, blackout: Boolean(body?.blackout) }
            if (snapshot.present && watchers > 0 && patch) publishLive()
        } catch {
            fails += 1
            if (fails >= LOST_AFTER_FAILS) lost()
        } finally {
            dmxInFlight = false
        }
    }

    // Polling runs only while the desk is there, somebody is looking, and the tab is up.
    const reconcile = () => {
        const shouldPoll = !disposed && snapshot.present && watchers > 0 && !hidden()
        if (!shouldPoll) { stopPolling(); return }
        if (dmxTimer) return
        pullPatch()
        pullDmx()
        dmxTimer = setInterval(pullDmx, DMX_POLL_MS)
        patchTimer = setInterval(pullPatch, PATCH_POLL_MS)
    }

    function probe(again = false) {
        if (disposed) return Promise.resolve(false)
        if (probing) return probing
        if (probed && !again) return Promise.resolve(snapshot.present)
        probed = true
        probing = probeLightingDesk({ fetchImpl })
            .then((here) => {
                probing = null
                if (disposed) return false
                if (here) {
                    if (reprobeTimer) { clearInterval(reprobeTimer); reprobeTimer = null }
                    if (!snapshot.present) publish({ ...ABSENT, present: true })
                    reconcile()
                }
                return here
            })
        return probing
    }

    const onVisibility = () => reconcile()
    theDocument?.addEventListener?.('visibilitychange', onVisibility)

    return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        probe: () => probe(false),
        // Somebody wants live colours. Returns the release.
        watch() {
            watchers += 1
            reconcile()
            let released = false
            return () => {
                if (released) return
                released = true
                watchers = Math.max(0, watchers - 1)
                reconcile()
            }
        },
        dispose() {
            disposed = true
            stopPolling()
            if (reprobeTimer) { clearInterval(reprobeTimer); reprobeTimer = null }
            theDocument?.removeEventListener?.('visibilitychange', onVisibility)
            listeners.clear()
        }
    }
}

let sharedMirror = null
// The page's one store. Exported for the two things that read it OUTSIDE React's
// render — a click handler that needs the fixtures as they are at the click, and a
// hook that selects one fixture out of the snapshot — never for polling from elsewhere.
export const getSharedLightingMirror = () => {
    if (!sharedMirror) sharedMirror = createLightingMirror()
    return sharedMirror
}
const getSharedMirror = getSharedLightingMirror

// { present, fixtures: [{ id, index, name, x, y, colour:{r,g,b}, level }], master, blackout }
// `enabled: false` still answers `present` (one probe), but never polls.
export function useLightingMirror({ enabled = true, mirror } = {}) {
    const store = mirror || getSharedMirror()
    const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
    useEffect(() => { store.probe() }, [store])
    useEffect(() => (enabled ? store.watch() : undefined), [enabled, store])
    return state
}

// Only "is there a desk?" — a boolean, so the component asking does not re-render at
// 10 Hz while the rig is running.
export function useLightingDeskPresent({ mirror } = {}) {
    const store = mirror || getSharedMirror()
    const getPresent = useCallback(() => store.getSnapshot().present, [store])
    const present = useSyncExternalStore(store.subscribe, getPresent, getPresent)
    useEffect(() => { store.probe() }, [store])
    return present
}

export default useLightingMirror
