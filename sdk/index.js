/**
 * di.iiii, from the outside.
 *
 *   import { connect } from './sdk/index.js'
 *   const di = await connect({ tier: 'local' })
 *   await di.run('space.list')
 *
 * One core, three faces: this is the manual one. `sdk/mcp.mjs` is the same
 * moves as tools for an agent, and the `di` command is the same moves typed by
 * hand. Whatever is true here is true in all three.
 */

import { credentialsPath, resolveBase, resolveSite, resolveToken } from './credentials.js'
import { createHttp } from './http.js'
import { MOVES, moveNames } from './moves.js'
import { PUBLIC, guard, reachOf } from './reach.js'

const memoryCache = () => {
    const map = new Map()
    return { get: async (k) => map.get(k) || null, set: async (k, v) => { map.set(k, v) } }
}

export const connect = async ({
    tier = null,
    base = null,
    token = null,
    // No confirm means public moves are REFUSED, not performed. See reach.js —
    // this is the one default that must never be convenient.
    confirm = null,
    cache = null,
    fetchImpl = globalThis.fetch,
    env = process.env
} = {}) => {
    const resolvedBase = resolveBase({ tier, base })
    const resolvedToken = resolveToken({ tier, token, env })
    // A `di up` install on your own machine runs with auth off and has no
    // token to give — demanding one would make the SDK unusable in exactly the
    // place it is safest. Loopback only: anything reachable by another machine
    // must still prove who it is.
    const loopback = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(resolvedBase)
    if (!resolvedToken && !loopback) {
        throw new Error(
            `no token for ${tier || resolvedBase}.\n` +
            `  Set DI_TOKEN, or ${tier ? `DI_TOKEN_${tier.toUpperCase()}, or ` : ''}put one in ${credentialsPath()}.\n` +
            `  Do not read it out of di.iiii's checkout — a project that needs the platform's working tree is not a separate project.`
        )
    }
    const site = resolveSite({ tier, base })
    const ctx = {
        http: createHttp({ base: resolvedBase, token: resolvedToken, fetchImpl }),
        site,
        host: new URL(site).host,
        cache: cache || memoryCache(),
        tier
    }

    const run = async (name, args = {}) => {
        const move = MOVES[name]
        if (!move) throw new Error(`no such move "${name}" — one of ${moveNames().join(', ')}`)
        await guard({ move, args, confirm })
        return move.run(ctx, args)
    }

    return {
        run,
        moves: MOVES,
        site,
        tier,
        base: resolvedBase,
        /** What this call would open, without doing it. */
        explain: (name, args = {}) => {
            const move = MOVES[name]
            if (!move) return null
            const reach = reachOf(move, args)
            return {
                move: name,
                reach,
                opens: reach === PUBLIC && typeof move.opens === 'function' ? move.opens(args) : null,
                summary: move.summary
            }
        }
    }
}

export { MOVES, moveNames } from './moves.js'
export { PRIVATE, PUBLIC, READ, PublicMoveRefused } from './reach.js'
export { ApprovalPending, DiError } from './http.js'
export { TIERS, credentialsPath } from './credentials.js'
