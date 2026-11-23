/**
 * The CLI's twin of serverXR/src/follow/nameResolver.js: where is the install called
 * `ponyo-k7q2`? beacon on this wifi, then DNS of `<label>.<zone>`, then the last
 * address that worked; every route probed under the name before it is believed.
 * The beacon itself is not a twin: both sides import serverXR/src/follow/beacon.js.
 */

import dns from 'node:dns'
import net from 'node:net'
import { createRequire } from 'node:module'

// ONE beacon module, shared with the server: serverXR/src/follow/beacon.js (CJS). The CLI sits
// at scripts/di in a checkout and at <root>/cli in a pack, serverXR beside it in both, so the
// path is tried in each layout (no single static import resolves in both).
const requireHere = createRequire(import.meta.url)
const beacon = (() => {
    for (const rel of ['../../serverXR/src/follow/beacon.js', '../serverXR/src/follow/beacon.js']) {
        try { return requireHere(rel) } catch (error) { if (error?.code !== 'MODULE_NOT_FOUND') throw error }
    }
    throw new Error('serverXR/src/follow/beacon.js not found beside the CLI (checkout or pack)')
})()

export const { BEACON_PORT, isLabel, encode, decode, announce } = beacon
export const listenBeacon = beacon.listen

export const DEFAULT_ZONE = 'l.diiii.xyz'
export const ROUTES = ['beacon', 'dns', 'last']

/** A bare label: no scheme, no dot, no slash, no port — the only form that means "a network name". */
export const isLabelInput = (value) => isLabel(String(value ?? '').trim())

export const nameOf = (label, zone = DEFAULT_ZONE) => `${label}.${zone}`

/** `https://<label>.<zone>` with the port only when it is not 443 — the name the certificate is checked for. */
export const baseOf = (label, zone, port = 443) => `https://${nameOf(label, zone)}${port && port !== 443 ? `:${port}` : ''}`

/** The zone: a config value. Env, then the install's own name file, then the default. */
export const zoneFrom = ({ env = process.env, own = null } = {}) => String(env.DI_NAME_ZONE || own?.zone || DEFAULT_ZONE).trim().toLowerCase()

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
export const resolveName = async ({ label, zone = DEFAULT_ZONE, port = 443, last = null, listen = listenBeacon, lookup = lookupDns, probe = null, skip = [], beaconMs = 2000 }) => {
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

