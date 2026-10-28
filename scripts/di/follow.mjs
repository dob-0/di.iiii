/**
 * What `di follow` DOES, with nothing printed.
 *
 * It was the body of cmdFollow, and it moved here the day `di stage join`
 * needed the same eight steps: resolve the base, check the key, refuse a loop,
 * refuse a silent merge, make room locally, write the follow down. A stage
 * machine that grew its own copy of that would drift from the one the artist
 * types, and the address pin — the flag that exists because a real rig could
 * not resolve a name — would have to be got right twice.
 *
 * So: one function, one set of refusal reasons, two callers. The words stay in
 * ui.mjs and the printing stays with the command.
 */

import fs from 'node:fs'
import path from 'node:path'
import { isIP } from 'node:net'

import { addFollow, FollowsCorruptError, inspectFollows, readFollows } from './follows.mjs'
import { paths } from './paths.mjs'
import { apiBase, alive, readEnv } from './state.mjs'
import { isLabelInput, resolveName, baseOf, zoneFrom, DEFAULT_ZONE } from './nameResolve.mjs'
import { checkFollowable, createLocalSpace, instanceOf, localSpaceExists, resolveBase } from './share.mjs'

/**
 * Would a key sent to this URL cross only a network the owner already trusts?
 * https always; http only to loopback, a `.local` name, or a private address
 * (10/8, 172.16/12, 192.168/16, link-local, Tailscale 100.64/10, IPv6 ULA).
 * SPEC_follow.md says peers are typed URLs and Tailscale `--at <ip>` is the
 * documented way, so those stay allowed; a public name over http needs --insecure.
 */
export const isTrustedCleartext = (url, address = null) => {
    let parsed
    try { parsed = new URL(url) } catch { return false }
    if (parsed.protocol === 'https:') return true
    if (parsed.protocol !== 'http:') return false
    const host = (address || parsed.hostname).replace(/^\[|\]$/g, '').toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true
    const kind = isIP(host)
    if (kind === 4) {
        const [a, b] = host.split('.').map(Number)
        return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
            (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)
    }
    if (kind === 6) return host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host)
    return false
}

/**
 * A manage key (its id starts with 'm': serverXR/src/syncKeyStore.js) is never
 * sent over plain http to another machine — not on a LAN, not on Tailscale,
 * not with --insecure (SPEC_space_sync_keys.md §13.4; review L2). Loopback only.
 */
export const isManageKey = (key) => /^dii_sync_m/.test(String(key || '').trim())
export const manageKeyMayTravel = (url, address = null) => {
    let parsed
    try { parsed = new URL(url) } catch { return false }
    if (parsed.protocol === 'https:') return true
    if (parsed.protocol !== 'http:') return false
    const host = (address || parsed.hostname).replace(/^\[|\]$/g, '').toLowerCase()
    return host === 'localhost' || host === '::1' || /^127\./.test(host)
}

/**
 * Is there already a space of that name in the data folder of an install that is
 * NOT running? Spaces live in di.db. Anything unreadable counts as "yes": the
 * refusal is a flag away (--into), an overwrite is not.
 */
export const localSpaceOnDisk = async (home, spaceId) => {
    const data = paths(home).data
    const db = path.join(data, 'di.db')
    if (!fs.existsSync(db)) return false
    try {
        const { DatabaseSync } = await import('node:sqlite')
        const handle = new DatabaseSync(db, { readOnly: true })
        try { return Boolean(handle.prepare('SELECT 1 FROM spaces WHERE id = ?').get(spaceId)) } finally { handle.close() }
    } catch {
        return true
    }
}

/**
 * @returns {Promise<{ok: true, base: string, running: boolean, address: string|null, previous: object|null, keptKey: boolean}
 *                  | {ok: false, reason: string, stored?: string, base?: string}>}
 *
 * `reason` is one of the words ui.followRefused already knows: unreachable,
 * cert-mismatch, missing, denied, local-space, itself, merge, no-from, and
 * remote-differs (which also carries `stored` and `base`, the two remotes).
 */
/**
 * This install's own name file (`<home>/name/name.json`, `{ label, zone, name }`,
 * left by `di name`): the zone every install of the team shares. Absent or
 * unreadable is "no opinion", never an error.
 */
export const readOwnName = (home) => {
    try { return JSON.parse(fs.readFileSync(path.join(home, 'name', 'name.json'), 'utf8')) } catch { return null }
}

/**
 * A bare label (`ponyo-k7q2`) is a network name: find the install by beacon, DNS or its
 * last address (docs/ai/team-sync-by-network-name.md §8) and probe it under the name.
 * @returns {Promise<{ok: true, base, address, name} | {ok: false, reason: 'name-not-found', label, tried}>}
 */
export const findByName = async ({ home, label, stored = null, env = process.env, resolve = resolveName, probe = null }) => {
    const zone = zoneFrom({ env, own: readOwnName(home) })
    const last = stored?.name?.label === label && stored.name.lastAddress
        ? { address: stored.name.lastAddress, port: stored.name.lastPort || 443 }
        : null
    const asked = probe || (async ({ address, port }) => Boolean((await resolveBase(baseOf(label, zone, port), { address })).base))
    const found = await resolve({ label, zone, last, probe: asked })
    if (!found.ok) return { ok: false, reason: 'name-not-found', label, zone, tried: found.tried }
    return {
        ok: true, base: found.base, address: found.address,
        name: { label, zone, route: found.route, lastAddress: found.address, lastPort: found.port }
    }
}

export const followSpace = async ({ home, spaceId, from = null, key = null, into = null, address = null, port, insecure = false, direction = null, start = null, env = process.env, find = findByName }) => {
    if (direction && direction !== 'take-host' && direction !== 'take-mine') return { ok: false, reason: 'direction' }
    if (inspectFollows(paths(home).data).state === 'corrupt') return { ok: false, reason: 'corrupt' }

    // `di follow <space> --take-mine` alone, on a space already followed: the
    // answer to that follow's refusal, so it means THAT follow — its remote, its
    // pin, its key. The space is already wired to it, so it is not a merge.
    // Without a direction a bare name is still a question (2026-10-20).
    const stored = readFollows(paths(home).data)[spaceId] ?? null
    if (!from) {
        if (!direction || !stored?.remote) return { ok: false, reason: 'no-from' }
        // A named follow asks again by its name: its address may have moved.
        from = stored.name?.label || stored.remote
        address = address || stored.address || null
        into = into || spaceId
    }
    // A bare label: find the install (beacon, DNS, last address) and keep its name
    // for Host, SNI and the certificate check. The address is the pin of THIS run;
    // it is not stored (the server re-resolves, so a changed address needs no edit).
    let named = null
    if (from && isLabelInput(from)) {
        const found = address
            // `--at` typed: the person already says where; the name is still checked.
            ? { ok: true, base: baseOf(String(from).trim(), zoneFrom({ env, own: readOwnName(home) })), address, name: { label: String(from).trim(), zone: zoneFrom({ env, own: readOwnName(home) }), route: 'typed', lastAddress: address, lastPort: 443 } }
            : await find({ home, label: String(from).trim(), stored, env })
        if (!found.ok) return { ok: false, reason: found.reason, label: found.label, zone: found.zone, tried: found.tried }
        from = found.base
        address = found.address
        named = found.name
    }
    // Refuse before touching anything: a key must not travel in clear to a public
    // host, and a follows.json that does not parse must not be written over.
    if (!insecure && !isTrustedCleartext(from, address)) return { ok: false, reason: 'cleartext' }
    if (isManageKey(key) && !manageKeyMayTravel(from, address)) return { ok: false, reason: 'manage-cleartext' }

    const resolved = await resolveBase(from, { address })
    if (!resolved.base) return { ok: false, reason: resolved.reason }
    const base = resolved.base

    // No --key is "I did not say", never "no key" (2026-10-20: a re-run without
    // --key wrote "token": null over a key minted 10-04, and the host refused
    // every edit after). Same remote: the stored key and label stay. Another
    // remote: its key cannot be the stored one, and dropping that one silently
    // is the defect — refused, the record untouched, until --key is said.
    let label = null
    let keptKey = false
    if (!key && stored?.token) {
        const sameName = named && stored.name?.label === named.label
        if (stored.remote !== base && !sameName) return { ok: false, reason: 'remote-differs', stored: stored.remote, base }
        key = stored.token
        label = stored.label ?? null
        keptKey = true
    }
    if (keptKey && isManageKey(key) && !manageKeyMayTravel(base, address)) return { ok: false, reason: 'manage-cleartext' }

    const check = await checkFollowable({ base, spaceId, key, address })
    if (!check.ok) return { ok: false, reason: check.reason }

    const selfBase = apiBase(home, port)
    const running = await alive(home, port)

    // Following yourself is a loop with no second person in it: the same server
    // reading and writing its own log forever.
    if (running) {
        const [there, here] = await Promise.all([instanceOf(base, { address }), instanceOf(selfBase)])
        if (there && here && there === here) return { ok: false, reason: 'itself' }
    }

    const token = readEnv(home).ADMIN_API_TOKEN || null

    // A space of that name already here is somebody's work — `main` is the front
    // room on every install. Wiring a stranger's log into it, and pushing its
    // contents out to them, must be asked for out loud.
    if (!into) {
        const exists = running
            ? await localSpaceExists({ base: selfBase, spaceId, token })
            : await localSpaceOnDisk(home, spaceId)
        if (exists) return { ok: false, reason: 'merge' }
    }

    // The space has to exist here for the ops to land in. Created through this
    // install's own route, so it is an ordinary space in every other way.
    if (running) {
        const made = await createLocalSpace({ base: selfBase, spaceId, token })
        if (!made.ok) return { ok: false, reason: 'local-space' }
    }

    // Kept so `di stage leave` can put follows.json back exactly as it was:
    // undefined when there was no entry, the whole entry when there was one.
    const all = readFollows(paths(home).data)
    const previous = all[spaceId] ?? null
    const hadFile = Object.keys(all).length > 0

    try {
        await addFollow(paths(home).data, spaceId, { remote: base, token: key, label, address: named ? null : address, name: named, direction, start })
    } catch (error) {
        if (error instanceof FollowsCorruptError) return { ok: false, reason: 'corrupt' }
        throw error
    }
    return { ok: true, base, running, address: address || null, name: named, previous, hadFile, keptKey }
}
