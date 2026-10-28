/**
 * Where is the install called <label>? One function, used by `di follow`, by the
 * running follower and by the join flow.
 *
 * Order (docs/ai/team-sync-by-network-name.md §8), and what worked is returned
 * as `route` so `di follows` can say it:
 *   1. beacon — the install announced itself on this wifi (no internet needed);
 *   2. dns    — the system resolver, `<label>.<zone>`;
 *   3. last   — the last address that worked, stored with the follow.
 * An answer only says WHERE to connect. The name stays for Host, SNI and the
 * certificate check (the address pin, httpClient `address`), so a wrong answer
 * from any step cannot be trusted by accident: the certificate for that name
 * is the proof.
 *
 * The collaborators are arguments so tests (and the offline proof) can supply
 * their own; no real network is touched by importing this file.
 */
const dns = require('node:dns')
const net = require('node:net')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { LABEL_PATTERN, listen } = require('./beacon')

const DEFAULT_ZONE = 'di-studio.xyz' // the owner's call is pending (design doc §15 Q1)
const DEFAULT_PORT = 443

/** A bare label: no scheme, no dot, no slash, no port. That is a network name, not an address. */
const isLabel = (text) => {
    const value = String(text ?? '').trim()
    return value.length > 0 && value.length <= 63 && LABEL_PATTERN.test(value)
}

const networkName = (label, zone = DEFAULT_ZONE) => `${label}.${zone}`

const nameBase = (label, zone = DEFAULT_ZONE, port = DEFAULT_PORT) =>
    `https://${networkName(label, zone)}${Number(port) === DEFAULT_PORT ? '' : `:${port}`}`

/** Reads the label from a base this module made: `https://<label>.<zone>[:port]`. */
const labelOfBase = (base, zone = DEFAULT_ZONE) => {
    try {
        const url = new URL(base)
        const suffix = `.${zone}`
        if (url.protocol !== 'https:' || !url.hostname.endsWith(suffix)) return null
        const label = url.hostname.slice(0, -suffix.length)
        return isLabel(label) ? { label, port: Number(url.port) || DEFAULT_PORT } : null
    } catch { return null }
}

/**
 * The zone: DI_NAME_ZONE, else the one PR 2 wrote to <home>/.di/name/name.json,
 * else the default.
 */
const readZone = ({ env = process.env, home = os.homedir() } = {}) => {
    const fromEnv = String(env.DI_NAME_ZONE || '').trim().toLowerCase()
    if (fromEnv) return fromEnv
    try {
        const stored = JSON.parse(fs.readFileSync(path.join(home, '.di', 'name', 'name.json'), 'utf8'))
        const zone = String(stored?.zone || '').trim().toLowerCase()
        if (zone) return zone
    } catch { /* not claimed on this install */ }
    return DEFAULT_ZONE
}

const systemLookup = (name) => new Promise((resolve) => {
    dns.lookup(name, { all: true }, (error, addresses) => resolve(error ? [] : addresses.map(entry => entry.address)))
})

// A broker record points at loopback while its install is private (§5 A): that
// is "not shared", never an address to pin another machine to.
const usable = (address) => net.isIP(address) !== 0 && !/^127\./.test(address) && address !== '::1' && address !== '0.0.0.0'

/**
 * @param {object} options
 * @param {string} options.label
 * @param {string} [options.zone]
 * @param {number} [options.port]       the port to use when the route gives none (DNS, last)
 * @param {{address: string, port?: number}|string|null} [options.last]  what worked last time
 * @param {(o: {label: string, timeoutMs: number}) => Promise<{address: string, port: number}|null>} [options.beacon]
 * @param {(name: string) => Promise<string[]>} [options.lookup]
 * @param {number} [options.beaconMs]
 * @returns {Promise<{ok: true, route: 'beacon'|'dns'|'last', address: string, port: number, name: string}
 *                  | {ok: false, tried: string[], name: string}>}
 */
const resolveName = async ({ label, zone = DEFAULT_ZONE, port = DEFAULT_PORT, last = null, beacon = listen, lookup = systemLookup, beaconMs = 2000 } = {}) => {
    const name = networkName(label, zone)
    const tried = []

    tried.push('beacon')
    const heard = await Promise.resolve(beacon({ label, timeoutMs: beaconMs })).catch(() => null)
    if (heard && usable(heard.address)) return { ok: true, route: 'beacon', address: heard.address, port: Number(heard.port) || port, name }

    tried.push('dns')
    const found = (await Promise.resolve(lookup(name)).catch(() => [])).find(usable)
    if (found) return { ok: true, route: 'dns', address: found, port, name }

    tried.push('last')
    const remembered = typeof last === 'string' ? { address: last } : last
    if (remembered && usable(remembered.address)) return { ok: true, route: 'last', address: remembered.address, port: Number(remembered.port) || port, name }

    return { ok: false, tried, name }
}

const withPort = (base, port) => {
    const url = new URL(base)
    url.port = Number(port) === DEFAULT_PORT ? '' : String(port)
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`
}

/**
 * What the running follower calls when a request to a named host failed: look
 * the host up again, in the same order, and move `side` to where it is now.
 * At most once per `minGapMs` (a host that is simply off must not make every
 * tick wait two seconds on the beacon). `record` is told only about a change,
 * so follows.json is not rewritten on every poll.
 */
const reresolver = ({ side, name, resolve = resolveName, record = null, log = console, minGapMs = 10000, now = Date.now }) => {
    let askedAt = -Infinity
    return async () => {
        if (now() - askedAt < minGapMs) return null
        askedAt = now()
        const labelAndPort = labelOfBase(side.base, name.zone) || { port: DEFAULT_PORT }
        const found = await resolve({ label: name.label, zone: name.zone, port: labelAndPort.port, last: side.address ? { address: side.address, port: labelAndPort.port } : null })
        if (!found.ok) { log.warn?.(`[follow] ${name.label}.${name.zone}: not found (tried ${found.tried.join(', ')})`); return null }
        const changed = found.address !== side.address || found.port !== labelAndPort.port
        side.address = found.address
        if (found.port !== labelAndPort.port) side.base = withPort(side.base, found.port)
        if (changed) log.info?.(`[follow] ${name.label}.${name.zone} found at ${found.address}:${found.port} (${found.route})`)
        await Promise.resolve(record?.({ address: found.address, via: found.route, remote: side.base })).catch(() => {})
        return found
    }
}

module.exports = { DEFAULT_ZONE, DEFAULT_PORT, isLabel, networkName, nameBase, labelOfBase, readZone, resolveName, withPort, reresolver }
