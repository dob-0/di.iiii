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
 * @returns {Promise<{ok: true, base: string, running: boolean, address: string|null, previous: object|null}
 *                  | {ok: false, reason: string}>}
 *
 * `reason` is one of the words ui.followRefused already knows: unreachable,
 * cert-mismatch, missing, denied, local-space, itself, merge.
 */
export const followSpace = async ({ home, spaceId, from, key = null, into = null, address = null, port, insecure = false, direction = null, start = null }) => {
    if (direction && direction !== 'take-host' && direction !== 'take-mine') return { ok: false, reason: 'direction' }
    // Refuse before touching anything: a key must not travel in clear to a public
    // host, and a follows.json that does not parse must not be written over.
    if (!insecure && !isTrustedCleartext(from, address)) return { ok: false, reason: 'cleartext' }
    if (inspectFollows(paths(home).data).state === 'corrupt') return { ok: false, reason: 'corrupt' }

    const resolved = await resolveBase(from, { address })
    if (!resolved.base) return { ok: false, reason: resolved.reason }
    const base = resolved.base

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
        await addFollow(paths(home).data, spaceId, { remote: base, token: key, address, direction, start })
    } catch (error) {
        if (error instanceof FollowsCorruptError) return { ok: false, reason: 'corrupt' }
        throw error
    }
    return { ok: true, base, running, address: address || null, previous, hadFile }
}
