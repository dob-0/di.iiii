import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'
import { pickByName } from '../shared/nameMatch.js'

// THE ONE WIRE between a page and the NDI® receiver on its own machine.
//
// NDI carries video between machines on a local network — it is how
// TouchDesigner, OBS and Resolume hand each other pictures. serverXR can
// receive it (serverXR/src/ndi), but only on a LOCAL install: every /ndi route
// sits behind requireLocalRuntime, so a hosted di.iiii answers 404 and the
// runtime is never loaded there at all. The machine that DRAWS the wall is the
// machine that receives, which is why a surface stores a source NAME and not
// an address.
//
// Everything a page says to that receiver goes through this file, so there is
// one place that knows the addresses, one place that decides what "no picture"
// means, and one place that turns a refusal into a sentence.
//
// NDI® is a registered trademark of Vizrt NDI AB — https://ndi.video
// di.iiii never ships the runtime: a person installs it themselves and we use
// whatever is already on the machine. See docs/architecture/NDI.md.
const { getBasePrefix } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

const ndiPath = (rest = '') => joinPath(getBasePrefix(), 'ndi', rest)

export const ndiApiUrl = (rest = '') => {
    const origin = (typeof window !== 'undefined' && window.location?.origin) || ''
    return `${origin}${ndiPath(rest)}`
}

// The picture itself: multipart/x-mixed-replace, straight into an <img>.
// `w` caps what the server encodes — the corner-pin scales the result, so a
// surface that lands small on the wall need not cost a 1080p JPEG per frame.
export const ndiStreamUrl = ({ name = '', maxWidth = 0 } = {}) => {
    const query = new URLSearchParams({ name })
    const width = Math.round(Number(maxWidth) || 0)
    if (width >= 16 && width <= 4096) query.set('w', String(width))
    return ndiApiUrl(`in.mjpg?${query.toString()}`)
}

// Never the bare global: `fetch` called detached from `window` throws
// "Illegal invocation" in a browser.
const resolveFetch = (fetchImpl) => {
    if (typeof fetchImpl === 'function') return fetchImpl
    if (typeof fetch === 'function') return (...args) => fetch(...args)
    return null
}

// A 200 alone is not a receiver. A hosted tier serves the app's own index.html
// for every address it does not know, so a probe that asked for JSON and got a
// web page would believe a wall could show NDI when nothing there can.
// (The same trap lightingLink.js documents, and the same guard.)
const answeredJson = (response) => /^application\/json\b/i.test(response?.headers?.get?.('content-type') || '')

/**
 * Is there a receiver on this machine, and does it have a runtime?
 * @returns {{ here: boolean, available: boolean, reason: string, how: string }}
 *   here      — the /ndi routes answered JSON at all (a local di.iiii)
 *   available — the NDI runtime loaded
 *   how       — the server's own one line on how to fix it
 */
export async function probeNdi({ fetchImpl, signal } = {}) {
    const away = { here: false, available: false, reason: '', how: '' }
    const call = resolveFetch(fetchImpl)
    if (!call) return away
    try {
        const response = await call(ndiApiUrl('api/summary'), { signal })
        if (!response?.ok || !answeredJson(response)) return away
        const body = await response.json()
        return {
            here: true,
            available: Boolean(body?.available),
            reason: typeof body?.reason === 'string' ? body.reason : '',
            how: typeof body?.how === 'string' ? body.how : ''
        }
    } catch {
        return away
    }
}

/** What the finder can see on this network right now. Never throws. */
export async function fetchNdiSources({ fetchImpl, signal } = {}) {
    const call = resolveFetch(fetchImpl)
    if (!call) return []
    try {
        const response = await call(ndiApiUrl('api/sources'), { signal })
        if (!response?.ok || !answeredJson(response)) return []
        const body = await response.json()
        return Array.isArray(body?.sources) ? body.sources : []
    } catch {
        return []
    }
}

/** This machine's receiver for one name, as the server describes it — or null. */
export async function fetchNdiReceiver({ name, fetchImpl, signal } = {}) {
    const call = resolveFetch(fetchImpl)
    if (!call) return null
    try {
        const response = await call(ndiApiUrl('api/stats'), { signal })
        if (!response?.ok || !answeredJson(response)) return null
        const body = await response.json()
        const receivers = Array.isArray(body?.receivers) ? body.receivers : []
        return pickByName(receivers, name, (receiver) => receiver?.name) || null
    } catch {
        return null
    }
}

// The five things that can be true when a surface named an NDI source and no
// picture is on the wall. Said in the SERVER's words wherever the server has
// them: `how` for a missing runtime, and the receiver's own `detail` — which
// names the address it dialled and says whether the session was ever opened —
// for a source that resolved and then stayed silent. One vocabulary, because
// two would leave whoever is at the rig deciding which of them to believe.
export const NDI_NOT_HERE = 'this di.iiii cannot receive NDI'

/**
 * Why is there no picture yet?
 * @returns {{ ready: boolean, settled: boolean, detail: string }}
 *   ready   — the runtime is here, so the picture may be asked for
 *   settled — asking again will not change the answer
 */
export async function ndiTrouble({ name = '', fetchImpl, signal } = {}) {
    const status = await probeNdi({ fetchImpl, signal })
    // A hosted di.iiii will never grow a receiver. Say so once and stop asking.
    if (!status.here) return { ready: false, settled: true, detail: NDI_NOT_HERE }
    if (!status.available) {
        const how = status.how ? ` — ${status.how}` : ''
        return { ready: false, settled: false, detail: `NDI is not installed on this machine${how}` }
    }
    // The runtime is here. Is the name anything the finder has seen? The match
    // is the shared rule, so the desk, the wall and the server all agree about
    // what "td_out" means.
    const sources = await fetchNdiSources({ fetchImpl, signal })
    if (!pickByName(sources, name, (source) => source?.name)) {
        return { ready: true, settled: false, detail: `no NDI source called “${name}” on this network` }
    }
    // It is out there and this machine is not showing it. The receiver knows
    // more than we do — it dialled an address and either connected or did not.
    const receiver = await fetchNdiReceiver({ name, fetchImpl, signal })
    if (receiver?.detail) return { ready: true, settled: false, detail: receiver.detail }
    return { ready: true, settled: false, detail: `looking for “${name}”…` }
}
