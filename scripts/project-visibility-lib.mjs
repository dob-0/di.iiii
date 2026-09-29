/**
 * project-visibility-lib.mjs — carrying a project's visibility across tiers.
 *
 * A project can be private inside its space (serverXR/src/projectVisibility.js,
 * docs/architecture/SPEC_project_visibility.md). Every tool that copies a
 * project from one di.iiii to another must carry that, or a private project
 * arrives on the next tier as a public one — and on a public space that means
 * visitors see it. Three rules, the same in every tool:
 *
 *   1. Create it private. The create route takes `visibility`, so the copy is
 *      never public for the moment between a create and a PATCH.
 *   2. Check the destination KEPT it, before any content is written. A server
 *      older than this field ignores it (an unknown body field is dropped, not
 *      refused) and would answer 201 with a public project. The content is only
 *      written once the destination says `visibility: 'private'` back.
 *   3. Never widen. A project private at the destination and public at the
 *      source stays private; making work public is a person's decision, made
 *      on the tier where it shows.
 */

export const isPrivateMeta = (meta) => meta?.visibility === 'private'

// The create body's extra field — nothing at all for a public project, so a
// public copy sends exactly what it always sent.
export const visibilityCreateFields = (sourceMeta) => (isPrivateMeta(sourceMeta) ? { visibility: 'private' } : {})

/**
 * Make the destination copy at least as private as the source, and prove it.
 *
 * `request(method, path, body)` → `{ ok, status, body }` against the
 * destination. `destMeta` is what the destination reported after the create
 * (or null when the create answered 409 — then it is read here).
 *
 * Returns `{ ok: true, note }` or `{ ok: false, error }`. On `ok: false` the
 * caller must NOT write the document or assets.
 */
export const ensureDestinationVisibility = async ({ request, projectId, sourceMeta, destMeta = null }) => {
    if (!isPrivateMeta(sourceMeta)) {
        return { ok: true, note: isPrivateMeta(destMeta) ? 'kept private at the destination (never widened)' : null }
    }
    let current = destMeta
    if (!current) {
        const read = await request('GET', `/api/projects/${encodeURIComponent(projectId)}`)
        current = read.ok ? (read.body?.project || null) : null
    }
    if (current && !Object.prototype.hasOwnProperty.call(current, 'visibility')) {
        return { ok: false, error: `the destination does not know project visibility (a server older than it) — "${projectId}" is private at the source and would be PUBLIC there. Nothing was written into it; update that server first.` }
    }
    if (isPrivateMeta(current)) return { ok: true, note: 'private' }
    const patched = await request('PATCH', `/api/projects/${encodeURIComponent(projectId)}`, { visibility: 'private' })
    if (!patched.ok || !isPrivateMeta(patched.body?.project)) {
        return { ok: false, error: `could not make "${projectId}" private at the destination (HTTP ${patched.status}${patched.body?.error ? `: ${patched.body.error}` : ''}) — it is private at the source. Nothing was written into it.` }
    }
    return { ok: true, note: 'made private' }
}
