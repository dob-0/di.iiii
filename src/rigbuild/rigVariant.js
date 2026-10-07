// A RIG VERSION's place in its set (RIG_BUILD.md §15): read from the production's VERSION LIST
// when it has one (src/shared/productionVersions.js), else from the space's own rows, else from
// the show entity's stored siblings. Pure, imports nothing heavy — the published viewer loads it.

import { FOR_THE_SHOW, listProjectIdOf } from '../shared/productionVersions.js'

/** The document's rigVariant (on the show's entity), or null. A mark counts with an id or a sibling list. */
export const rigVariantOf = (entities = []) => {
    const holder = entities.find((e) => e?.components?.rigVariant?.siblings?.length || e?.components?.rigVariant?.id)
    return holder ? holder.components.rigVariant : null
}

/** The short word a version is called by in the row: its title up to the dash (or its id, never nothing). */
export const shortTitle = (title, id = '') => String(title || '').split(' — ')[0].trim() || String(id || '')

const byProjectId = (a, b) => (a.projectId < b.projectId ? -1 : a.projectId > b.projectId ? 1 : 0)

/**
 * The set as the SPACE holds it: every live project whose own version mark names this set,
 * reachable from any of them. `rows` are the rows of GET /api/spaces/:id/contents — already
 * only what this viewer may see (live, not archived, not private to someone else) — each
 * carrying `rigVariant` { set, id, title, summary, copyOf? } when its document has one.
 * Same list from every version (sorted by project id, live versions first, then labelled
 * copies), so the row does not reshuffle as you move. The current version is always in it.
 * Returns null when nothing else in the space names this set (the caller falls back to the
 * document's own stored list).
 */
const setFromRows = (variant, currentProjectId, hrefOf, rows) => {
    if (!variant?.set) return null
    const members = rows
        .filter((r) => r?.id && r.rigVariant?.id && r.rigVariant.set === variant.set)
        .map((r) => ({
            projectId: r.id,
            id: r.rigVariant.id,
            title: r.rigVariant.title || r.rigVariant.id,
            summary: r.rigVariant.summary || '',
            copy: Boolean(r.rigVariant.copyOf)
        }))
    if (!members.some((m) => m.projectId !== currentProjectId)) return null
    if (!members.some((m) => m.projectId === currentProjectId)) {
        // Opened directly — e.g. an archived version by its address: it is still where you are.
        members.push({ projectId: currentProjectId, id: variant.id, title: variant.title || variant.id, summary: variant.summary || '', copy: Boolean(variant.copyOf) })
    }
    members.sort((a, b) => (a.copy === b.copy ? byProjectId(a, b) : a.copy ? 1 : -1))
    return members.map((m) => ({ id: m.id, title: m.title, summary: m.summary, href: hrefOf(m.projectId), current: m.projectId === currentProjectId, copy: m.copy }))
}

/** The project that holds the version list of this version's production (`<set>-versions`), or null. */
export const versionListProjectOf = (variant) => (variant?.set ? listProjectIdOf(variant.set) : null)

/**
 * The set as the production's VERSION LIST holds it (docs/architecture/decisions/2026-10-04-production-
 * versions.md): its entries in the list's order (for the show first, then candidates, then kept copies, then concepts;
 * archived versions are not on the row). Linked only where the space really holds the project for this
 * viewer (`rows`, as setFromRows) — a version the viewer may not see, or that is not on this install,
 * is never a dead link. The current project is always in the row, listed or not. Returns null when the
 * list is not this production's or names nothing linkable (the caller falls back).
 */
const setFromList = (variant, currentProjectId, hrefOf, rows, list) => {
    if (!variant?.set || !list || list.production?.id !== variant.set || !Array.isArray(list.entries) || !list.entries.length) return null
    const here = new Set(rows.map((r) => r?.id).filter(Boolean))
    const twoForTheShow = list.entries.filter((v) => v.status === FOR_THE_SHOW).length > 1
    const links = list.entries
        .filter((v) => v.projectId === currentProjectId || (v.status !== 'archived' && here.has(v.projectId)))
        .map((v) => ({
            id: v.id,
            title: v.title || v.id,
            summary: '',
            href: hrefOf(v.projectId),
            current: v.projectId === currentProjectId,
            copy: v.status === 'kept-copy',
            concept: v.status === 'concept',
            // two "for the show" can only come from a merge of two machines' edits; then neither is marked
            show: v.status === FOR_THE_SHOW && !twoForTheShow
        }))
    if (!links.some((l) => l.current)) links.unshift({ id: variant.id, title: variant.title || variant.id, summary: variant.summary || '', href: hrefOf(currentProjectId), current: true, copy: Boolean(variant.copyOf), show: false })
    return links
}

/**
 * The switch's entries, with the current one marked; null when there is nothing to switch to.
 *
 * `list` — the production's version list (versionsFromDocument of `<set>-versions`), or null when this
 * install has none or the viewer may not read it. With a list AND the space's rows, the row is the list
 * (setFromList). Without one, everything below holds, unchanged.
 *
 * `existing` — what the space really holds (GET /api/spaces/:id/contents), or null while that
 * is not known yet:
 *   - rows `[{ id, rigVariant? }]`: the set is derived from the space (setFromRows) — every
 *     live version, from every version. If no other row carries a mark for this set (an older
 *     server, or documents made before the mark was listed), the stored list below is used,
 *     filtered by the ids of those rows;
 *   - ids (a Set or array of strings): the document's stored `siblings`, kept to the ones present;
 *   - undefined: the caller does not check (tools, tests of the old shape) — every stored sibling.
 * A version whose project is not there is never linked: the owner clicked "Full" on
 * rigbuilder.7 and got "Project not found." While the list is unknown only the current
 * version is shown — a label, no links. With fewer than two real versions there is no row.
 */
export const versionLinks = (variant, currentProjectId, hrefOf, existing = undefined, list = null) => {
    const isRows = Array.isArray(existing) && existing.some((x) => x && typeof x === 'object')
    if (isRows && list) {
        const listed = setFromList(variant, currentProjectId, hrefOf, existing, list)
        if (listed) return listed.length >= 2 ? listed : null
    }
    if (isRows) {
        const derived = setFromRows(variant, currentProjectId, hrefOf, existing)
        if (derived) return derived.length >= 2 ? derived : null
    }
    const siblings = variant?.siblings || []
    if (siblings.length < 2) return null
    const isCurrent = (s) => s.projectId === currentProjectId || s.id === variant.id
    const all = siblings.map((s) => ({ id: s.id, title: s.title || s.id, summary: s.summary || '', href: hrefOf(s.projectId), current: isCurrent(s), copy: false }))
    if (existing === undefined) return all
    if (existing === null) {
        const here = all.filter((l) => l.current)
        return here.length ? here : null
    }
    const ids = isRows ? existing.map((r) => r?.id) : existing
    const have = ids instanceof Set ? ids : new Set(ids)
    const real = siblings.map((s, i) => [s, all[i]]).filter(([s]) => isCurrent(s) || have.has(s.projectId)).map(([, l]) => l)
    return real.length >= 2 ? real : null
}
