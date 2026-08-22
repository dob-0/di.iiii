// Pure helpers for dev-stack.mjs, split out so they can be unit-tested without
// starting the stack.

/**
 * How stale the local knowledge of the remote is.
 *
 * The tree warning counts `HEAD..origin/dev` against the LOCAL origin/dev ref
 * and never fetches — deliberately, because this desktop goes offline and a dev
 * stack must still start. The cost was never named: if you have not fetched,
 * the count is measured against an old ref, so a checkout six commits behind
 * reports itself current and says nothing. This turns that silence into a line,
 * using the mtime of FETCH_HEAD — still no network.
 *
 * @param {number} fetchedAtMs mtime of .git/FETCH_HEAD, or 0 if unknown
 * @param {number} nowMs
 * @param {number} staleAfterHours
 * @returns {string|null} a line to print, or null when the ref is fresh enough
 */
export const formatFetchAgeNote = (fetchedAtMs, nowMs, staleAfterHours = 4) => {
    if (!fetchedAtMs) return '[dev-stack] Remote never fetched in this clone — "behind" counts mean nothing yet. Run: git fetch'
    const ageMs = nowMs - fetchedAtMs
    if (ageMs < staleAfterHours * 60 * 60 * 1000) return null
    const hours = Math.floor(ageMs / (60 * 60 * 1000))
    const age = hours >= 48 ? `${Math.floor(hours / 24)}d` : `${hours}h`
    return `[dev-stack] Last fetched ${age} ago — the behind-count above is measured against that old ref. Run: git fetch`
}

// Per-identity scratch space, provisioned lazily per session — another tier's
// sandbox is not a space this box is missing.
export const isSandboxSpaceId = (id) => /^sandbox-/.test(String(id || ''))

/**
 * Which live spaces this box does not have, and the tier each was first seen on.
 *
 * Tier order is significance order, not alphabetical: a space present on both
 * production and staging is reported as production's, and a staging-only space
 * is named as staging's — that difference is the whole reason the check exists
 * (`dilijan` was built on staging and never promoted, so a production-only
 * comparison called the box complete while it lacked the space).
 *
 * A tier whose list could not be read is `null` and is skipped, never treated
 * as empty: "the network was down" must not read as "nothing is missing".
 *
 * @param {string[]} localIds
 * @param {Array<{tier: string, ids: string[] | null}>} tiers
 * @returns {Map<string, string>} space id → tier name
 */
/**
 * Installed packages that disagree with the lockfile.
 *
 * The fourth staleness channel, and the one nothing has ever watched: the tree
 * warning covers the code, the space-drift check covers the data, and a
 * `node_modules` quietly behind `package-lock.json` is what makes "it builds on
 * my machine" untrue of CI. Compares only what the lock pins directly, and only
 * packages actually installed — a missing one is `npm ci`'s business, not a
 * version disagreement.
 *
 * @param {Record<string,{version?:string}>} lockPackages the lockfile's "packages" map
 * @param {(dir:string)=>string|null} readInstalledVersion given "node_modules/x", its installed version
 * @param {number} limit how many to name before summarising
 * @returns {{name:string, locked:string, installed:string}[]}
 */
export const collectDependencyDrift = (lockPackages, readInstalledVersion, limit = 40) => {
    const drift = []
    for (const [key, entry] of Object.entries(lockPackages || {})) {
        if (!key.startsWith('node_modules/') || !entry?.version) continue
        // Nested copies (a/node_modules/b) are a resolution detail, not
        // something a person acts on.
        if (key.indexOf('node_modules/', 'node_modules/'.length) !== -1) continue
        if (drift.length >= limit) break
        const installed = readInstalledVersion(key)
        if (!installed || installed === entry.version) continue
        drift.push({ name: key.slice('node_modules/'.length), locked: entry.version, installed })
    }
    return drift
}

/**
 * @param {{name:string, locked:string, installed:string}[]} drift
 * @returns {string[]} lines, already prefixed
 */
export const formatDependencyDriftWarning = (drift) => {
    if (!drift || drift.length === 0) return []
    const shown = drift.slice(0, 3).map((d) => `${d.name} ${d.installed}→${d.locked}`).join(', ')
    const rest = drift.length > 3 ? `, +${drift.length - 3} more` : ''
    return [
        `[dev-stack] ${drift.length} package(s) differ from package-lock.json: ${shown}${rest}`,
        '[dev-stack] Nothing else checks this. Run: npm ci',
    ]
}

/**
 * The banner text for a set of missing spaces, or [] when there is nothing to
 * say. Kept here so what the developer actually reads is under test — the
 * comparison being right is worth nothing if the sentence never prints.
 *
 * @param {Map<string, string>} missing
 * @returns {string[]} lines, already prefixed
 */
export const formatSpaceDriftWarning = (missing) => {
    if (!missing || missing.size === 0) return []
    const rule = '-'.repeat(64)
    const named = [...missing.entries()].map(([id, tier]) => `${id} (${tier})`).join(', ')
    return [
        '',
        `[dev-stack] ${rule}`,
        `[dev-stack] --- STALE LOCAL DATA — ${missing.size} space(s) live but not on this box:`,
        `[dev-stack] --- ${named}`,
        '[dev-stack] --- They will be missing from /spaces. This is data, not a bug.',
        '[dev-stack] --- Fix: npm run local:mirror     (preview: npm run local:mirror:check)',
        `[dev-stack] ${rule}`,
        '',
    ]
}

export const collectMissingSpaces = (localIds, tiers) => {
    const here = new Set((localIds || []).filter((id) => !isSandboxSpaceId(id)))
    const missing = new Map()
    for (const { tier, ids } of tiers || []) {
        if (!Array.isArray(ids)) continue
        for (const id of ids) {
            if (isSandboxSpaceId(id)) continue
            if (here.has(id) || missing.has(id)) continue
            missing.set(id, tier)
        }
    }
    return missing
}
