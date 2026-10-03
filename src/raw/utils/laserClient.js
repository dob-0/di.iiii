// The page's side of the laser lane (serverXR/src/routes/laserRoutes.js): this
// di.iiii's own server at /laser, beside the app the way the lighting desk sits at
// /light — no /serverXR prefix, and under a base path it moves with the app.

import { createBasePathHelpers, joinPath } from '../../project/routing/laneBasePath.js'

const { getBasePrefix } = createBasePathHelpers(
    (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
)
const currentOrigin = () => (typeof window !== 'undefined' ? window.location.origin : 'http://localhost')

export const laserApiBase = (origin = currentOrigin(), basePrefix = getBasePrefix()) =>
    new URL(joinPath('/', basePrefix, '/laser/api'), origin).toString().replace(/\/+$/, '')

export const LASER_STATUS = Object.freeze({
    CHECKING: 'checking',
    ABSENT: 'absent',       // 404: a hosted di.iiii — the laser lane is local only
    FORBIDDEN: 'forbidden', // 403: another machine on the network, LAN devices not allowed
    ANSWERING: 'answering',
    UNREACHABLE: 'unreachable',
})

const readJson = async (response) => {
    try { return await response.json() } catch { return null }
}

const classify = (response) => {
    if (response.status === 404) return LASER_STATUS.ABSENT
    if (response.status === 403) return LASER_STATUS.FORBIDDEN
    return response.ok ? LASER_STATUS.ANSWERING : LASER_STATUS.UNREACHABLE
}

export async function readLaserState(base, { fetchImpl = fetch, signal } = {}) {
    try {
        const response = await fetchImpl(`${base}/state`, { cache: 'no-store', signal })
        return { status: classify(response), state: response.ok ? await readJson(response) : null }
    } catch {
        return { status: LASER_STATUS.UNREACHABLE, state: null }
    }
}

// Settings, look and on/off. Every call is also the heartbeat the lane needs to keep
// the cube on: stop calling and it switches the cube off within 3 s.
export async function sendLaserUpdate(base, body, { fetchImpl = fetch } = {}) {
    try {
        const response = await fetchImpl(`${base}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        const json = await readJson(response)
        return { ok: response.ok, status: classify(response), state: response.ok ? json : null, error: json?.error || '' }
    } catch (error) {
        return { ok: false, status: LASER_STATUS.UNREACHABLE, state: null, error: String(error?.message || error) }
    }
}

export async function sendLaserOff(base, { fetchImpl = fetch } = {}) {
    try {
        const response = await fetchImpl(`${base}/off`, { method: 'POST' })
        return { ok: response.ok }
    } catch {
        return { ok: false }
    }
}

// One line for the node's Status port and the panel.
export function laserStatusText(status, state) {
    if (status === LASER_STATUS.CHECKING) return 'Looking for the laser lane…'
    if (status === LASER_STATUS.ABSENT) return 'No laser here — the LaserCube runs from a di.iiii on your own machine'
    if (status === LASER_STATUS.FORBIDDEN) return 'The laser answers a browser on its own machine only'
    if (status === LASER_STATUS.UNREACHABLE || !state) return 'The server is not answering'
    if (!state.on) return `Off${state.offReason ? ` — ${state.offReason}` : ''}`
    if (!state.answering) return `On, but the cube at ${state.ip} is not answering — nothing is drawn`
    const info = state.info || {}
    const battery = info.battery === 'mains' ? 'mains' : (Number.isFinite(info.battery) ? `${info.battery}%` : '?')
    return `On — ${info.model || 'LaserCube'} at ${state.ip} · ${state.rate} pps · ${battery} · ${info.temperature ?? '?'}°C`
}

// The frame the cube would get for `look`, from the server's own renderer — the
// panel's picture is exactly what would be drawn, not a guess made in the page.
export async function readLaserPreview(base, look, t, { fetchImpl = fetch } = {}) {
    try {
        const response = await fetchImpl(`${base}/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ look: look || {}, t }),
        })
        if (!response.ok) return null
        return (await readJson(response))?.points || null
    } catch {
        return null
    }
}
