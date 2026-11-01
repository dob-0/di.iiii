// Continue, never recreate (owner 2026-11-02, N1880; docs/ai/decisions/2026-11-02-continue-never-recreate.md).
// What `di new` and scripts/place/import.mjs do with the server's answer
// "space_exists_similar": say which space to continue, exit 2, and only a written
// reason (--new-anyway "<reason>") makes the second space.
import { createRequire } from 'node:module'

// ONE stem rule, shared with the server: shared/continueStem.cjs (CJS). The CLI sits at scripts/di
// in a checkout (shared/ two levels up) and at <version>/cli in a pack (shared/ beside it), so the
// path is tried in each layout, the way nameResolve.mjs finds the beacon: no single relative
// require resolves in both, and a CLI that only ran from a checkout would not run once installed.
const requireHere = createRequire(import.meta.url)
const stem = (() => {
    for (const rel of ['../../shared/continueStem.cjs', '../shared/continueStem.cjs']) {
        try { return requireHere(rel) } catch (error) { if (error?.code !== 'MODULE_NOT_FOUND') throw error }
    }
    throw new Error('shared/continueStem.cjs not found beside the CLI (checkout or pack)')
})()
const { findSimilar, newAnywayReason, sameStem } = stem

export { findSimilar, newAnywayReason, sameStem }
export const EXIT_CONTINUE = 2

/** The reason typed after --new-anyway, or '' (a bare flag is not a reason). */
export const reasonFromFlags = (flags = {}) => newAnywayReason(flags['new-anyway'])

/** The line a person reads when the space already exists. */
export const continueMessage = (existing, label, how) =>
    `continue: ${existing} (${label || existing}) — use it; to add this work as a project: ${how}`

/**
 * POST /api/spaces through `fetchImpl`. Returns { status: 'made'|'continue'|'error', ... }.
 * 'continue' carries the existing space and the ready-to-print message.
 */
export const createSpace = async ({ base, label, newAnyway = '', fetchImpl = fetch, how = 'di move PROJECT --to <space>' }) => {
    const body = { label, permanent: true }
    if (newAnyway) body.newAnyway = newAnyway
    const response = await fetchImpl(`${base}/api/spaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    const json = await response.json().catch(() => ({}))
    if (response.status === 409 && json?.error === 'space_exists_similar') {
        return {
            status: 'continue',
            existing: json.existing,
            message: continueMessage(json.existing, json.label, how),
            hint: json.hint
        }
    }
    if (!response.ok) return { status: 'error', error: json?.error || `could not make a space called "${label}"` }
    return { status: 'made', space: json?.space }
}
