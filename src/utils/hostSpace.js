// A space on its own domain — the browser half.
// Spec: docs/architecture/SPEC_space_own_domain.md.
//
// On yokozo.xyz the page has to know, before it routes anything, that it IS the
// space `taronx`: `/` is the space and `/instruments` is its project. The server
// answers that (GET /serverXR/api/host); this file asks once at boot, remembers
// the answer, and spaceRouting.js reads it.
//
// On di.iiii's own addresses nothing is asked: the answer is known to be "no
// space", and every platform page load would otherwise pay a round trip for it.
// A platform address missing from this list only costs that one request — the
// server says null and the page renders exactly as before.

const PLATFORM_SUFFIXES = ['diiii.xyz', 'di-studio.xyz', 'thedi.studio']

let hostSpace = null

/** { id, slug, label, platformOrigin } on a space's own domain, else null. */
export const getHostSpace = () => hostSpace

/** For tests, and for the boot below. */
export const setHostSpace = (value) => { hostSpace = value || null }

const isUnder = (hostname, suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)

/**
 * True for an address that can only ever be the platform itself: one of our
 * names, a machine on the local network, a bare name, an IP address.
 */
export const isPlatformHostname = (hostname = '') => {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '')
    if (!host || !host.includes('.')) return true
    if (/^\d+(\.\d+){3}$/.test(host) || host.includes(':')) return true
    if (host.endsWith('.local') || host.endsWith('.ts.net') || host.endsWith('.localhost')) return true
    return PLATFORM_SUFFIXES.some((suffix) => isUnder(host, suffix))
}

/**
 * Ask the server which space this host shows. Never throws: on any failure the
 * page renders as the platform, which is what it did before this existed.
 */
export const resolveHostSpace = async ({ hostname = window.location.hostname, fetchImpl = window.fetch.bind(window), apiBase = '/serverXR' } = {}) => {
    if (isPlatformHostname(hostname)) return null
    try {
        const response = await fetchImpl(`${apiBase}/api/host`, { credentials: 'omit' })
        if (!response.ok) return null
        const body = await response.json()
        if (!body?.space?.id) return null
        const value = { ...body.space, platformOrigin: body.platformOrigin || '' }
        setHostSpace(value)
        return value
    } catch {
        return null
    }
}
