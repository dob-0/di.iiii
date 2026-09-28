// A RIG VERSION's place in its set (RIG_BUILD.md §15): read from the show's entity, for
// the space view's switch. Pure, imports nothing heavy — the published viewer loads it.

/** The document's rigVariant (on the show's entity), or null. */
export const rigVariantOf = (entities = []) => {
    const holder = entities.find((e) => e?.components?.rigVariant?.siblings?.length)
    return holder ? holder.components.rigVariant : null
}

/**
 * The switch's entries, in the set's order, with the current one marked; null when there
 * is nothing to switch to.
 *
 * `existing` — the ids of the projects the space really holds (GET /api/spaces/:id/contents),
 * or null while that is not known yet. A version whose project is not there is never
 * linked: the owner clicked "Full" on rigbuilder.7 and got "Project not found." (the set
 * named four versions, the space held two). While the list is unknown only the current
 * version is shown — a label, no links. With fewer than two real versions there is no row.
 */
export const versionLinks = (variant, currentProjectId, hrefOf, existing = undefined) => {
    const siblings = variant?.siblings || []
    if (siblings.length < 2) return null
    const isCurrent = (s) => s.projectId === currentProjectId || s.id === variant.id
    const all = siblings.map((s) => ({ id: s.id, title: s.title, summary: s.summary || '', href: hrefOf(s.projectId), current: isCurrent(s) }))
    // `undefined`: the caller does not check (tools, tests of the old shape) — every sibling.
    if (existing === undefined) return all
    if (existing === null) {
        const here = all.filter((l) => l.current)
        return here.length ? here : null
    }
    const have = existing instanceof Set ? existing : new Set(existing)
    const real = siblings.map((s, i) => [s, all[i]]).filter(([s]) => isCurrent(s) || have.has(s.projectId)).map(([, l]) => l)
    return real.length >= 2 ? real : null
}
