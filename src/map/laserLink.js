import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// THE ONE WIRE between the show tools and the laser desk (serverXR/src/laser,
// served at /laser on a LOCAL di.iiii). Same rules as lightingLink.js: every
// address is built here, nothing throws, "no laser engine" is an answer.
//
// WHAT IS DELIBERATELY NOT HERE: arming. POST /laser/api/arm is the owner's
// hand on the Laser page and nothing in this file, or built on it, can reach
// it (laserLink.test.js asserts the list of addresses this file may POST to).
// Putting the cubes dark (desk blackout) is allowed; lifting it never arms.
const { getBasePrefix } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

const laserPath = (rest = '') => joinPath(getBasePrefix(), 'laser', rest)

export const laserDeskPath = () => laserPath('/')
export const laserLooksPath = () => laserPath('desk/')

export const laserApiUrl = (rest = '') => {
    const origin = (typeof window !== 'undefined' && window.location?.origin) || ''
    return `${origin}${laserPath(rest)}`
}

const resolveFetch = (fetchImpl) => {
    if (typeof fetchImpl === 'function') return fetchImpl
    if (typeof fetch === 'function') return (...args) => fetch(...args)
    return null
}

const answeredJson = (response) => /^application\/json\b/i.test(response?.headers?.get?.('content-type') || '')

async function getJson(path, { fetchImpl, signal } = {}) {
    const call = resolveFetch(fetchImpl)
    if (!call) return null
    try {
        const response = await call(laserApiUrl(path), { signal, cache: 'no-store' })
        if (!response?.ok || !answeredJson(response)) return null
        return await response.json()
    } catch (error) {
        if (error?.name === 'AbortError') throw error
        return null
    }
}

const postLaser = (path, body, { fetchImpl } = {}) => {
    const call = resolveFetch(fetchImpl)
    if (!call) return Promise.resolve(false)
    return Promise.resolve()
        .then(() => call(laserApiUrl(path), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }))
        .then((response) => Boolean(response?.ok))
        .catch(() => false)
}

// GET api/state → what the engine says, or { reachable: false }.
export async function readLaserEngine(options) {
    const body = await getJson('api/state', options)
    if (!body || typeof body !== 'object') return { reachable: false }
    const cubes = Array.isArray(body.cubes) ? body.cubes : []
    return {
        reachable: true,
        armed: body.armed === true,
        sim: typeof body.sim === 'boolean' ? body.sim : null,
        total: cubes.length,
        connected: cubes.filter((cube) => cube?.connected === true).length
    }
}

// GET desk/api/state → the desk's looks and switches, or { reachable: false }.
export async function readLaserDesk(options) {
    const body = await getJson('desk/api/state', options)
    if (!body || typeof body !== 'object' || !Array.isArray(body.looks)) return { reachable: false }
    return {
        reachable: true,
        looks: body.looks.filter((look) => look && typeof look.id === 'string').map((look) => ({ id: look.id, name: look.name || look.id })),
        liveId: typeof body.liveId === 'string' ? body.liveId : null,
        blackout: body.blackout === true,
        master: Number.isFinite(Number(body.master)) ? Number(body.master) : 1,
        followLight: body.follow?.on === true
    }
}

// The same call the Laser desk page's picture click makes (ui/desk.js: post('desk/api/go', { look: id })).
export const goLaserLook = (id, options) => postLaser('desk/api/go', { look: id }, options)
// `on` is a real boolean, never a toggle (the route answers 400 otherwise).
export const setLaserBlackout = (on, options) => postLaser('desk/api/blackout', { on: Boolean(on) }, options)
// 0..1, the desk's own range.
export const setLaserMaster = (level, options) => postLaser('desk/api/master', { level: Math.max(0, Math.min(1, Number(level) || 0)) }, options)
export const setLaserFollowLight = (on, options) => postLaser('desk/api/follow', { on: Boolean(on) }, options)

// A cue may carry a laser look id. Fired AFTER the light, fire and forget.
export const cueLaserLook = (cue) => (typeof cue?.laserLook === 'string' ? cue.laserLook.trim() : '')
export function recallCueLaser(cue, options) {
    const id = cueLaserLook(cue)
    if (!id) return Promise.resolve(false)
    return goLaserLook(id, options)
}
