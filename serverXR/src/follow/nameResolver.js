/**
 * Where is the install called `ponyo-k7q2`? — one function, three routes.
 *
 * `di follow <space> --from ponyo-k7q2` (design doc docs/ai/team-sync-by-network-name.md §8):
 *   1. the beacon on this wifi — works with the internet cut;
 *   2. DNS of `<label>.<zone>` — the broker's record (loopback while the owner is
 *      not sharing, which is no route and is skipped);
 *   3. the last address that worked, stored with the follow.
 * Each route that finds an address is PROBED before it is believed: the probe is
 * a request to that address under the name (Host, SNI, certificate check), so a
 * stale record, a forged beacon or somebody else's machine fails the check and the
 * next route is tried. The first route whose probe passes wins.
 *
 * scripts/di/nameResolve.mjs is this file's twin for the CLI (the packed CLI
 * cannot import the server); nameResolveParity.test.js holds them to one behaviour.
 */

const dns = require('node:dns')
const net = require('node:net')
const beacon = require('./beacon')

const DEFAULT_ZONE = 'l.di-studio.xyz'
const ROUTES = ['beacon', 'dns', 'last']

/** A bare label: no scheme, no dot, no slash, no port — the only form that means "a network name". */
const isLabelInput = (value) => beacon.isLabel(String(value ?? '').trim())

const nameOf = (label, zone = DEFAULT_ZONE) => `${label}.${zone}`

/** `https://<label>.<zone>` with the port only when it is not 443 — the name the certificate is checked for. */
const baseOf = (label, zone, port = 443) => `https://${nameOf(label, zone)}${port && port !== 443 ? `:${port}` : ''}`

/** The zone: a config value. Env, then the install's own name file, then the default. */
const zoneFrom = ({ env = process.env, own = null } = {}) => String(env.DI_NAME_ZONE || own?.zone || DEFAULT_ZONE).trim().toLowerCase()

const lookupDns = (name) => new Promise((resolve) => {
    dns.lookup(name, { family: 4 }, (error, address) => resolve(error ? null : address))
})

// A record that points at this very machine is the broker's "not shared" marker.
const isLoopback = (address) => /^127\./.test(String(address)) || address === '::1'

/**
 * @param {object} p
 * @param {string} p.label
 * @param {string} [p.zone]
 * @param {number} [p.port]            443 unless the follow stored another
 * @param {{address: string, port?: number}|null} [p.last]   stored with the follow
 * @param {(o: {label: string}) => Promise<{address: string, port: number}|null>} [p.listen]
 * @param {(name: string) => Promise<string|null>} [p.lookup]
 * @param {(c: {address: string, port: number, name: string, route: string}) => Promise<boolean>} [p.probe]
 * @param {string[]} [p.skip]          routes not to try (offline tests, `--no-beacon`)
 * @returns {Promise<{ok: true, address: string, port: number, route: string, name: string, base: string} | {ok: false, tried: string[]}>}
 */
const resolveName = async ({ label, zone = DEFAULT_ZONE, port = 443, last = null, listen = beacon.listen, lookup = lookupDns, probe = null, skip = [], beaconMs = 2000 }) => {
    const name = nameOf(label, zone)
    const tried = []
    const attempt = async (route, address, usePort) => {
        if (!address || !net.isIP(address)) return null
        tried.push(route)
        const candidate = { address, port: usePort, name, route }
        if (probe && !(await probe(candidate))) return null
        return { ok: true, address, port: usePort, route, name, base: baseOf(label, zone, usePort) }
    }
    const steps = {
        beacon: async () => {
            const heard = await listen({ label, timeoutMs: beaconMs })
            return heard ? attempt('beacon', heard.address, heard.port) : null
        },
        dns: async () => {
            const address = await lookup(name)
            return address && !isLoopback(address) ? attempt('dns', address, last?.port || port) : null
        },
        last: async () => (last?.address ? attempt('last', last.address, last.port || port) : null)
    }
    for (const route of ROUTES) {
        if (skip.includes(route)) continue
        const found = await steps[route]()
        if (found) return found
    }
    return { ok: false, tried }
}

/**
 * The running follower's side of it: a function that asks again where a followed
 * name is, moves `remote` there (`address` and `base`, in place) and says whether
 * it moved. Asked only when a request got no answer; a failed search is not
 * repeated for `minGapMs`, so a host that is really off does not cost a beacon
 * wait on every tick. A found address is handed to `onRoute` to be remembered.
 */
const createReresolver = ({ name, remote, resolve = resolveName, probe, onRoute = () => {}, minGapMs = 5000, now = Date.now }) => {
    let failedAt = -Infinity
    return async () => {
        if (now() - failedAt < minGapMs) return false
        let port = 443
        let basePath = ''
        try { const url = new URL(remote.base); port = Number(url.port) || 443; basePath = url.pathname.replace(/\/$/, '') } catch { /* keep defaults */ }
        const found = await resolve({ label: name.label, zone: name.zone, port, last: remote.address ? { address: remote.address, port } : null, probe })
        if (!found.ok) { failedAt = now(); return false }
        const base = `${found.base}${basePath}`
        const moved = found.address !== remote.address || base !== remote.base
        remote.address = found.address
        remote.base = base
        try { await onRoute({ route: found.route, address: found.address, port: found.port }) } catch { /* remembering is a courtesy */ }
        return moved
    }
}

module.exports = { createReresolver, DEFAULT_ZONE, ROUTES, isLabelInput, nameOf, baseOf, zoneFrom, resolveName }
