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
// mirror are still one stream (or one 10 Hz poll), not four.
//
// THE STREAM (2026-09-29, RIG_BUILD.md §19.5). Where the browser has EventSource the
// DMX is PUSHED by the desk (GET /light/api/dmx/stream, serverXR/src/lighting/
// dmxstream.js) at its own frame rate, 40–44 Hz, key frame then deltas — the 100 ms poll
// was the visualiser's whole latency and too slow for a strobe or a chase. What arrives
// is published at most once per animation frame (a burst of desk frames between two
// screen frames is one render). The browser reconnects by itself; a stream that never
// opened (a proxy that will not stream, an old desk without the route) falls back to the
// 10 Hz poll, and a desk that stops answering is "gone" exactly as before.

export const DMX_POLL_MS = 100 // 10 Hz — the fallback poll, the rate the desk's own stage view reads at
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
const KNOWN_LIGHT_ROLES = new Set(['dimmer', 'r', 'g', 'b', 'w', 'a', 'uv', 'lime', 'y', 'warm', 'cool'])

// The look the desk is playing on a layer (GET /light/api/dmx `looks`), highest priority
// first: what a room following the desk poses by (src/rigbuild/looks.js).
export const liveLooksOf = (looks) => (Array.isArray(looks) ? looks : [])
    .filter((l) => l && typeof l.lookId === 'string' && Number(l.level) > 0)
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))
    .map((l) => l.lookId)

// The fade the top live look arrived with (GET /light/api/dmx `from`, `since`, `fadeMs`,
// RIG_BUILD.md §15.6): which look it came from and when, as a time on THIS clock — so a
// room can draw the lamps part-way between the two. `previous` keeps the answer stable
// while the same firing is reported again (10 Hz), so nothing re-renders for it.
export const lookFadeOf = (looks, previous = null, now = Date.now()) => {
    const top = (Array.isArray(looks) ? looks : [])
        .filter((l) => l && typeof l.lookId === 'string' && Number(l.level) > 0)
        .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))[0]
    if (!top || !Number.isFinite(Number(top.since))) return null
    const firedAt = now - Math.max(0, Number(top.since))
    const fadeMs = Math.max(0, Number(top.fadeMs) || 0)
    const from = typeof top.from === 'string' && top.from ? top.from : null
    if (previous && previous.lookId === top.lookId && previous.from === from && previous.fadeMs === fadeMs
        && Math.abs(previous.firedAt - firedAt) < 1000) return previous
    return { lookId: top.lookId, from, fadeMs, firedAt }
}

export const mirrorFixtures = (patch, dmx) => {
    if (!patch) return []
    return (patch.fixtures || []).map((fixture) => {
        const lit = fixtureColour({
            fixture,
            profile: patch.profiles?.[fixture.profile],
            dmx,
            emitters: patch.roleKinds?.emitter
        })
        // A profile whose channels are not known (a rig type whose channel list is owed:
        // ch1…chN, RIG_BUILD.md §4.2) says nothing about colour or level — the room keeps
        // what the document says rather than drawing it white at full.
        const roles = patch.profiles?.[fixture.profile]?.channels || []
        const known = roles.some((role) => KNOWN_LIGHT_ROLES.has(role) || (patch.roleKinds?.emitter || []).includes(role))
        // The fixture's own slots as they are on the wire, in its channel order: what a
        // room reads through the type's channel list (src/rigbuild/dmxDecode.js).
        const buf = dmx?.[fixture.universe] || []
        const start = (Number(fixture.address) || 1) - 1
        const values = roles.map((_, i) => Number(buf[start + i]) || 0)
        return {
            id: fixture.id,
            index: fixture.index,
            known,
            name: fixture.name,
            profile: fixture.profile,
            universe: fixture.universe,
            address: fixture.address,
            x: Number(fixture.x) || 0,
            y: Number(fixture.y) || 0,
            colour: { r: round(lit.r), g: round(lit.g), b: round(lit.b) },
            level: Math.round(lit.level * 1000) / 1000,
            values
        }
    })
}

// Stream frames for anyone measuring (the visualiser's latency harness reads it):
// { s, t, at } of the last frame applied, `at` on performance.now().
export const streamStats = { frames: 0, last: null, mode: 'none', opens: 0, errors: 0 }
// Readable by the page around a framed room (the visualiser's readout, same origin).
if (typeof window !== 'undefined') window.__diDeskStream = streamStats

const defaultEventSource = () => (typeof EventSource === 'function' ? EventSource : null)
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())
const onNextFrame = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16))
const cancelFrame = (id) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id))

// A stream's meta into the poll's shape: `since` from the frame's own desk time.
const looksFromMeta = (looks, t) => (Array.isArray(looks) ? looks : []).map((l) => ({
    ...l,
    since: Number.isFinite(Number(l.firedAt)) && Number.isFinite(Number(t)) ? Math.max(0, Number(t) - Number(l.firedAt)) : null
}))

export function createLightingMirror({ fetchImpl, doc, EventSourceImpl } = {}) {
    const theDocument = doc || (typeof document !== 'undefined' ? document : null)
    const EventSourceCtor = EventSourceImpl === undefined ? defaultEventSource() : EventSourceImpl
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
    let stream = null // the EventSource while streaming
    let streamOpened = false // this stream has opened at least once
    let streamRefused = false // a stream that never opened: poll instead, this page
    let streamErrors = 0
    let frameQueued = null
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
        blackout: Boolean(dmxFrame.blackout),
        looks: dmxFrame.looks || [],
        lookFade: dmxFrame.lookFade || null
    })

    const closeStream = () => {
        if (stream) { try { stream.close() } catch { /* already */ } stream = null }
        if (frameQueued != null) { cancelFrame(frameQueued); frameQueued = null }
    }

    const stopPolling = () => {
        if (dmxTimer) { clearInterval(dmxTimer); dmxTimer = null }
        if (patchTimer) { clearInterval(patchTimer); patchTimer = null }
        closeStream()
    }

    // At most one publish per screen frame, however many desk frames arrived.
    const publishSoon = () => {
        if (frameQueued != null) return
        frameQueued = onNextFrame(() => {
            frameQueued = null
            if (snapshot.present && watchers > 0 && patch) publishLive()
        })
    }

    const applyFrame = (body) => {
        const dmx = body.k ? {} : { ...dmxFrame.dmx }
        for (const run of Array.isArray(body.d) ? body.d : []) {
            const [u, start, values] = run
            if (!Array.isArray(values)) continue
            const buf = (dmx[u] = (dmx[u] && !body.k ? dmx[u].slice() : (dmx[u] || new Array(512).fill(0))))
            for (let i = 0; i < values.length && start + i < 512; i++) buf[start + i] = values[i]
        }
        // Universes a key frame did not carry are gone from the desk.
        const next = { ...dmxFrame, dmx }
        if (body.m) {
            const looks = looksFromMeta(body.m.looks, body.t)
            next.master = body.m.master ?? null
            next.blackout = Boolean(body.m.blackout)
            next.looks = liveLooksOf(looks)
            next.lookFade = lookFadeOf(looks, dmxFrame.lookFade || null)
        }
        dmxFrame = next
        streamStats.frames += 1
        streamStats.last = { s: body.s, t: body.t, at: nowMs() }
        publishSoon()
    }

    const openStream = () => {
        if (stream || !EventSourceCtor) return
        streamOpened = false
        let es
        try { es = new EventSourceCtor(lightingApiUrl('api/dmx/stream')) } catch { streamRefused = true; return }
        stream = es
        streamStats.mode = 'stream'
        es.addEventListener('open', () => {
            streamOpened = true
            streamErrors = 0
            fails = 0
            streamStats.opens += 1
        })
        es.addEventListener('frame', (event) => {
            let body
            try { body = JSON.parse(event.data) } catch { return }
            applyFrame(body)
        })
        es.addEventListener('error', () => {
            streamStats.errors += 1
            // Never opened: this desk (or the way to it) does not stream — poll instead.
            if (!streamOpened) {
                closeStream()
                streamRefused = true
                streamStats.mode = 'poll'
                reconcile()
                return
            }
            // Opened before: the browser retries by itself (`retry:`). Too many in a row
            // and the desk has gone, as for the poll.
            streamErrors += 1
            if (es.readyState === 2 || streamErrors >= LOST_AFTER_FAILS) {
                closeStream()
                lost()
            }
        })
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

    function lost() {
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
            dmxFrame = { dmx: body?.dmx || {}, master: body?.master ?? null, blackout: Boolean(body?.blackout), looks: liveLooksOf(body?.looks), lookFade: lookFadeOf(body?.looks, dmxFrame.lookFade || null) }
            if (snapshot.present && watchers > 0 && patch) publishLive()
        } catch {
            fails += 1
            if (fails >= LOST_AFTER_FAILS) lost()
        } finally {
            dmxInFlight = false
        }
    }

    // Listening runs only while the desk is there, somebody is looking, and the tab is up:
    // the stream where the browser has one and the desk streams, else the poll.
    function reconcile() {
        const shouldPoll = !disposed && snapshot.present && watchers > 0 && !hidden()
        if (!shouldPoll) { stopPolling(); return }
        if (!patchTimer) {
            pullPatch()
            patchTimer = setInterval(pullPatch, PATCH_POLL_MS)
        }
        if (EventSourceCtor && !streamRefused) {
            if (dmxTimer) { clearInterval(dmxTimer); dmxTimer = null }
            openStream()
            return
        }
        if (dmxTimer) return
        streamStats.mode = 'poll'
        pullDmx()
        dmxTimer = setInterval(pullDmx, DMX_POLL_MS)
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
