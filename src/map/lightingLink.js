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
export const lightingDeskPath = () => lightingPath('/')

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
    const id = cueLightScene(cue)
    if (!id) return Promise.resolve(false)
    const call = resolveFetch(fetchImpl)
    if (!call) return Promise.resolve(false)

    const fadeMs = cueFadeMs(cue)
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
