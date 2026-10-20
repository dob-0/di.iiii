// A RIG VERSION's place in its set (RIG_BUILD.md §15): read from the production's VERSION LIST
// when it has one (src/shared/productionVersions.js), else from the space's own rows, else from
// the show entity's stored siblings. Pure, imports nothing heavy — the published viewer loads it.

import { FOR_THE_SHOW, listProjectIdOf } from '../shared/productionVersions.js'

/** The document's rigVariant (on the show's entity), or null. A mark counts with an id or a sibling list. */
export const rigVariantOf = (entities = []) => {
    const holder = entities.find((e) => e?.components?.rigVariant?.siblings?.length || e?.components?.rigVariant?.id)
    return holder ? holder.components.rigVariant : null
}

/** The short name a version is called by in the row: its title up to the dash, the set's name dropped (or its id, never nothing). */
export const shortTitle = (title, id = '') => {
    const t = String(title || '').split(' — ')[0].trim()
    if (!t) return String(id || '')
    // One naming style for a numbered version (owner, 2026-10-12): "MOXIR v1.1 · looks" -> "v1.1 looks",
    // "MOXIR v2.0 · 2.6" -> "v2.6" (a bare number after the version is the build; the build is the name).
    // The set's own name before the version is dropped; a title with no version token is left as written.
    const m = /(?:^|\s)(v\d+(?:\.\d+)*)(?:\s*·\s*|\s+)?(.*)$/.exec(t)
    if (!m) return t
    const rest = m[2].trim().replace(/\s*·\s*/g, ' ')
    return /^\d+(?:\.\d+)*$/.test(rest) ? `v${rest}` : `${m[1]}${rest ? ` ${rest}` : ''}`
}

/** The number a project's slug names in the naming standard vX-Y (`v2-9` -> "2.9", `moxir-v10-2` -> "10.2"), or null. */
export const versionNumberOfSlug = (slug) => {
    const m = /(?:^|-)v(\d+)-(\d+)$/.exec(String(slug || ''))
    return m ? `${m[1]}.${m[2]}` : null
}

const warned = new Set()

/**
 * A version's name for the chip and the row: ONE source for its number. The project's slug gives the number;
 * the stored title (the list entry's, the rows', the document's own mark) may add words after it, never a
 * different number. A stored number that disagrees loses to the slug (console.warn names both); a title with
 * no number gets the slug's in front. A slug without the vX-Y pattern: the stored label as it is.
 */
export const versionName = (title, id, projectId) => {
    const label = shortTitle(title, id)
    const number = versionNumberOfSlug(projectId)
    if (!number) return label
    // A stored number may come with or without its 'v' ("v2.8 …" or a bare "2.8" from a list entry titled "2.8 — …";
    // the bare one showed the chip as "v2.9 2.8" on the test copy, 2026-10-14): both are the number token.
    const m = /^v?(\d+(?:\.\d+)+)(\b.*)$/.exec(label) || /^v(\d+)(\b.*)$/.exec(label)
    if (!m) return `v${number} ${label}`.trim()
    if (m[1] !== number) {
        const key = `${projectId}|${m[1]}`
        if (!warned.has(key)) {
            warned.add(key)
            console.warn(`[versions] project ${projectId}: stored label says v${m[1]}, its slug says v${number}; showing v${number}`)
        }
        return `v${number}${m[2]}`
    }
    return `v${m[1]}${m[2]}`
}

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
    return members.map((m) => ({ projectId: m.projectId, id: m.id, title: m.title, summary: m.summary, href: hrefOf(m.projectId), current: m.projectId === currentProjectId, copy: m.copy }))
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
            projectId: v.projectId,
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
    if (!links.some((l) => l.current)) links.unshift({ projectId: currentProjectId, id: variant.id, title: variant.title || variant.id, summary: variant.summary || '', href: hrefOf(currentProjectId), current: true, copy: Boolean(variant.copyOf), show: false })
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
const linksOf = (variant, currentProjectId, hrefOf, existing, list) => {
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
    const all = siblings.map((s) => ({ projectId: s.projectId, id: s.id, title: s.title || s.id, summary: s.summary || '', href: hrefOf(s.projectId), current: isCurrent(s), copy: false }))
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

/** The switch's entries (see linksOf above), each with `name`: what the row and the chip show (versionName). */
export const versionLinks = (variant, currentProjectId, hrefOf, existing = undefined, list = null) => {
    const links = linksOf(variant, currentProjectId, hrefOf, existing, list)
    return links ? links.map((l) => ({ ...l, name: versionName(l.title, l.id, l.projectId) })) : links
}
