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

import { addFollow, readFollows } from './follows.mjs'
import { paths } from './paths.mjs'
import { apiBase, alive, readEnv } from './state.mjs'
import { checkFollowable, createLocalSpace, instanceOf, localSpaceExists, resolveBase } from './share.mjs'

/**
 * @returns {Promise<{ok: true, base: string, running: boolean, address: string|null, previous: object|null}
 *                  | {ok: false, reason: string}>}
 *
 * `reason` is one of the words ui.followRefused already knows: unreachable,
 * cert-mismatch, missing, denied, local-space, itself, merge.
 */
export const followSpace = async ({ home, spaceId, from, key = null, into = null, address = null, port }) => {
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
    if (running && !into && await localSpaceExists({ base: selfBase, spaceId, token })) {
        return { ok: false, reason: 'merge' }
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

    await addFollow(paths(home).data, spaceId, { remote: base, token: key, address })
    return { ok: true, base, running, address: address || null, previous, hadFile }
}
