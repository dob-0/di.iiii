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
    staging: { base: 'https://staging.di-studio.xyz/serverXR', env: 'DI_TOKEN_STAGING', site: 'https://staging.di-studio.xyz' },
    prod: { base: 'https://di-studio.xyz/serverXR', env: 'DI_TOKEN_PROD', site: 'https://di-studio.xyz' }
}

export const credentialsPath = (home = homedir()) => join(home, '.config', 'di', 'credentials.json')

const readStore = (path) => {
    try { return JSON.parse(readFileSync(path, 'utf8')) } catch { return {} }
}

/**
 * DI_TOKEN wins, then the per-tier variable, then ~/.config/di/credentials.json.
 * Nothing here reads a repository, ever.
 */
export const resolveToken = ({ tier, token = null, env = process.env, home = homedir() } = {}) => {
    if (token) return token
    if (env.DI_TOKEN) return env.DI_TOKEN
    const known = TIERS[tier]
    if (known && env[known.env]) return env[known.env]
    const store = readStore(credentialsPath(home))
    if (store[tier]?.token) return store[tier].token
    return null
}

export const resolveBase = ({ tier = null, base = null } = {}) => {
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
