import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// THE ONE WIRE between the mapper's desk and the lighting desk.
//
// They are one show toolset: the wall and the light in the room in front of it
// change together or the change is only half made. A map cue can therefore
// carry a lighting scene, and firing the cue recalls it.
//
// Everything the mapper says to the lighting desk goes through this file, so
// there is exactly one place that knows the address, one place that decides
// what a fade means in milliseconds, and one place that swallows a failure.
//
// FIRE AND FORGET, ALWAYS. The lighting desk runs on a LOCAL di.iiii only — a
// hosted tab answers 404 for every one of these calls. A projection cue that
// waited on the light, or that threw when the light was not there, would make
// the wall depend on a rig that is usually absent. The wall is the promise;
// the light is a bonus this can offer when the desk happens to be running.
const { getBasePrefix } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

// App-level `/light`, honouring the app's base path the way every other lane
// does — a build mounted under a prefix reaches its own serverXR, not the root
// of whatever host it is served from.
const lightingPath = (rest = '') => joinPath(getBasePrefix(), 'light', rest)

// Directory-shaped on purpose: the desk's own interface uses relative
// addresses and only resolves under a trailing slash. (/light redirects, but
// the link should not need the round trip.)
//
// Opened FROM a project, the link says which one — ?space=&project=, and the
// project's title as &label= when it has one — so the desk can show the way
// back (serverXR/src/lighting/ui/from.js reads it). The bar's Light link uses
// the same shape. Without a project it is the bare desk, exactly as before.
export const lightingDeskPath = ({ spaceId = null, projectId = null, label = null } = {}) => {
    const path = lightingPath('/')
    if (!spaceId || !projectId) return path
    const query = new URLSearchParams({ space: spaceId, project: projectId })
    const title = typeof label === 'string' ? label.trim() : ''
    if (title && title !== projectId) query.set('label', title)
    return `${path}?${query.toString()}`
}

export const lightingApiUrl = (rest = '') => {
    const origin = (typeof window !== 'undefined' && window.location?.origin) || ''
    return `${origin}${lightingPath(rest)}`
}

// Never the bare global: `fetch` called detached from `window` throws
// "Illegal invocation" in a browser.
const resolveFetch = (fetchImpl) => {
    if (typeof fetchImpl === 'function') return fetchImpl
    if (typeof fetch === 'function') return (...args) => fetch(...args)
    return null
}

// Seconds on a cue, milliseconds on the desk. The conversion lives here and
// nowhere else so the two desks cannot disagree about how long a fade is.
export const cueFadeMs = (cue) => {
    const fade = Number(cue?.fade)
    return Number.isFinite(fade) && fade >= 0 ? Math.round(fade * 1000) : null
}

// What a cue names on the lighting desk, and WHICH KIND of thing it is. A cue may
// carry a look (the desk's content model) or a scene (the older one); both are ids and
// nothing about an id says which, so the cue stores them in separate fields and this is
// the one place that reads them.
export const cueLightTarget = (cue) => {
    const look = typeof cue?.lightLook === 'string' ? cue.lightLook.trim() : ''
    if (look) return { kind: 'look', id: look }
    const scene = typeof cue?.lightScene === 'string' ? cue.lightScene.trim() : ''
    if (scene) return { kind: 'scene', id: scene }
    return null
}

export const cueLightScene = (cue) => {
    const id = cue?.lightScene
    return typeof id === 'string' && id.trim() ? id.trim() : ''
}

// The picker's list. This one THROWS when the desk is unreachable: the caller
// has to be able to tell "no scenes" from "no desk" to say the right sentence.
export async function fetchLightScenes({ fetchImpl, signal } = {}) {
    const call = resolveFetch(fetchImpl)
    if (!call) throw new Error('no fetch')
    const response = await call(lightingApiUrl('api/scenes/summary'), { signal })
    if (!response?.ok) throw new Error(`lighting desk answered ${response?.status ?? 'nothing'}`)
    if (!answeredJson(response)) throw new Error('no lighting desk here')
    const body = await response.json()
    return Array.isArray(body?.scenes) ? body.scenes : []
}

// Everything a cue may fire, in the order a person would look for it: the looks the desk
// is built around now, then the scenes it still holds. One call, because a picker that
// asked twice would show half a list whenever one of the two answered slowly.
export async function fetchLightTargets({ fetchImpl, signal } = {}) {
    const call = resolveFetch(fetchImpl)
    if (!call) throw new Error('no fetch')
    const response = await call(lightingApiUrl('api/fireable'), { signal })
    if (!response?.ok) throw new Error(`lighting desk answered ${response?.status ?? 'nothing'}`)
    if (!answeredJson(response)) throw new Error('no lighting desk here')
    const body = await response.json()
    const looks = (Array.isArray(body?.looks) ? body.looks : [])
        .map((l) => ({ kind: 'look', id: l.id, name: l.name, note: `${l.steps} step${l.steps === 1 ? '' : 's'}` }))
    const scenes = (Array.isArray(body?.scenes) ? body.scenes : [])
        .map((s) => ({ kind: 'scene', id: s.id, name: s.name, note: s.missing ? `${s.missing} missing` : 'scene' }))
    return [...looks, ...scenes]
}

// A 200 alone is not a desk. A hosted tier serves the app's own index.html for
// every address it does not know, so this asked for JSON and got a web page and
// believed it — and the map desk grew a Light link to a desk that is not there.
const answeredJson = (response) => /^application\/json\b/i.test(response?.headers?.get?.('content-type') || '')

// Is there a desk at all? Only a 200 that is really JSON counts; a 404 from a
// hosted di.iiii, an HTML fallback and a refused connection are all the same
// answer — no.
export async function probeLightingDesk({ fetchImpl, signal } = {}) {
    const call = resolveFetch(fetchImpl)
    if (!call) return false
    try {
        const response = await call(lightingApiUrl('api/summary'), { signal })
        return Boolean(response?.ok) && answeredJson(response)
    } catch {
        return false
    }
}

// What a fired cue does about light. Resolves true only when the desk took it;
// it NEVER rejects, and a cue with no scene never touches the network at all.
export function recallCueLighting(cue, { fetchImpl } = {}) {
    const target = cueLightTarget(cue)
    if (!target) return Promise.resolve(false)
    const call = resolveFetch(fetchImpl)
    if (!call) return Promise.resolve(false)

    const fadeMs = cueFadeMs(cue)
    // A look is content and is FIRED — it lands on the desk's cue layer and stays there
    // until another cue replaces it. A scene is a state and is RECALLED, with a fade.
    // The two verbs are different on purpose; the cue simply says which it named.
    if (target.kind === 'look') {
        return Promise.resolve()
            .then(() => call(lightingApiUrl('api/looks/fire'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: target.id })
            }))
            .then((response) => Boolean(response?.ok))
            .catch(() => false)
    }
    const id = target.id
    const payload = fadeMs === null ? { id } : { id, fadeMs }
    return Promise.resolve()
        .then(() => call(lightingApiUrl('api/scenes/recall'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }))
        .then((response) => Boolean(response?.ok))
        .catch(() => false)
}

// --- the show clock and the master (the Perform line, 2026-09-24) ----------
//
// The Light desk's clock leads the show (src/perform/showClock.js). These are
// the three things a Perform page says to it, through this one wire like
// everything else, and on the same terms: never throws, and "no desk" is an
// answer, not an error.

// One reading of the desk's clock, with the local times the request left and
// the reply arrived — what a clock-offset estimate needs. `now` is injectable
// so a test does not depend on the wall clock.
export async function readLightClock({ fetchImpl, signal, now = () => Date.now() } = {}) {
    const call = resolveFetch(fetchImpl)
    if (!call) return { up: false, reason: 'no fetch' }
    const sentAt = now()
    try {
        const response = await call(lightingApiUrl('api/clock'), { signal, cache: 'no-store' })
        const receivedAt = now()
        if (!response?.ok) return { up: false, reason: `the Light desk answered ${response?.status ?? 'nothing'}`, sentAt, receivedAt }
        if (!answeredJson(response)) return { up: false, reason: 'no Light desk on this machine', sentAt, receivedAt }
        const body = await response.json()
        return {
            up: body?.up === true,
            // A di.iiii with a Light desk route answered (a local install),
            // whether or not the desk is open yet.
            reachable: true,
            bpm: Number(body?.bpm),
            epoch: Number(body?.epoch),
            beatsPerBar: Number(body?.beatsPerBar) || 4,
            master: Number.isFinite(Number(body?.master)) ? Number(body.master) : null,
            blackout: body?.blackout === true,
            show: typeof body?.show === 'string' ? body.show : null,
            serverNow: Number(body?.now),
            sentAt,
            receivedAt,
            reason: body?.up === true ? '' : 'the Light desk is not open on this machine'
        }
    } catch (error) {
        if (error?.name === 'AbortError') throw error
        return { up: false, reason: 'no Light desk on this machine', sentAt, receivedAt: now() }
    }
}

const postLight = (path, body, { fetchImpl } = {}) => {
    const call = resolveFetch(fetchImpl)
    if (!call) return Promise.resolve(false)
    return Promise.resolve()
        .then(() => call(lightingApiUrl(path), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }))
        .then((response) => Boolean(response?.ok))
        .catch(() => false)
}

// A follower proposing a tempo to the leader (Link lets any participant do it).
// `epoch` is in the DESK's milliseconds: the caller moves its tap by the
// offset it measured. The desk keeps whole bpm (fx.js sanitizeFxPatch).
export const proposeLightTempo = ({ bpm, epoch }, options) => postLight('api/fx', {
    bpm: Math.round(Number(bpm)),
    ...(Number.isFinite(Number(epoch)) ? { epoch: Math.max(0, Math.round(Number(epoch))) } : {})
}, options)

export const setLightBlackout = (blackout, options) => postLight('api/master', { blackout: Boolean(blackout) }, options)

// 0..1 here, 0..255 on the desk.
export const setLightMaster = (level, options) => postLight('api/master', {
    master: Math.round(Math.max(0, Math.min(1, Number(level) || 0)) * 255)
}, options)
