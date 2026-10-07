/**
 * Where a token comes from — and, as much, where it does NOT.
 *
 * Every project in this estate reached into `/home/nooo/di.iiii/serverXR/
 * .env.local` for its token: a hardcoded absolute path into the PLATFORM's
 * working tree, from a project that is supposed to be a separate thing. It
 * breaks the moment the checkout moves, it cannot work on anyone else's
 * machine, and it means a project can read every secret the platform holds
 * when it only ever needed one line.
 *
 * This module exists so that habit has somewhere better to go.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const TIERS = {
    local: { base: 'http://localhost:4000/serverXR', env: 'DI_TOKEN_LOCAL', site: 'http://localhost:4000' },
    dev: { base: 'https://dev.diiii.xyz/serverXR', env: 'DI_TOKEN_DEV', site: 'https://dev.diiii.xyz' },
    prod: { base: 'https://di-studio.xyz/serverXR', env: 'DI_TOKEN_PROD', site: 'https://di-studio.xyz' }
}

export const credentialsPath = (home = homedir()) => join(home, '.config', 'di', 'credentials.json')

// The dev tier was once called `staging`. The old name is refused with a
// pointer rather than mapped, so nothing keeps writing it.
const refuseOldTier = (tier) => {
    if (tier === 'staging') throw new Error('"staging" is now "dev"')
}

const readStore = (path) => {
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'))
        // Valid JSON that is not an object ("null", a list) used to throw on the first lookup.
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch { return {} }
}

const originOf = (base) => {
    try { return new URL(base).origin } catch { return null }
}

/**
 * DI_TOKEN wins, then the per-tier variable, then ~/.config/di/credentials.json.
 * Nothing here reads a repository, ever.
 *
 * `di login` writes that file (scripts/di/loginStore.mjs, which cannot be
 * imported from here: an install lays cli/ and sdk/ side by side, a checkout
 * does not). A login is filed under `dev` / `prod` / `local` for those servers
 * and under the server's origin for any other, so when the tier has nothing the
 * entry for the ORIGIN of `base` is the one that fits:
 * `connect({ base: 'https://example.org/serverXR' })` after `di login --to https://example.org`.
 */
export const resolveToken = ({ tier, base = null, token = null, env = process.env, home = homedir() } = {}) => {
    refuseOldTier(tier)
    if (token) return token
    if (env.DI_TOKEN) return env.DI_TOKEN
    const known = TIERS[tier]
    if (known && env[known.env]) return env[known.env]
    const store = readStore(credentialsPath(home))
    const filed = (key) => (key && Object.hasOwn(store, key) ? store[key]?.token || null : null)
    const own = filed(tier)
    if (own) return own
    const origin = base ? originOf(base) : null
    if (!origin) return null
    return filed(Object.keys(TIERS).find((name) => TIERS[name].site === origin) || origin)
}

export const resolveBase = ({ tier = null, base = null } = {}) => {
    refuseOldTier(tier)
    if (base) return String(base).replace(/\/+$/, '')
    if (tier && TIERS[tier]) return TIERS[tier].base
    if (tier) throw new Error(`unknown tier "${tier}" — one of ${Object.keys(TIERS).join(', ')}, or pass base`)
    return TIERS.local.base
}

/**
 * The address a PERSON would open, which is not the API root — the difference
 * is what made one script hand out invite links nobody could use.
 */
export const resolveSite = ({ tier = null, base = null } = {}) => {
    if (tier && TIERS[tier]) return TIERS[tier].site
    const root = resolveBase({ tier, base })
    try { return new URL(root).origin } catch { return root }
}
