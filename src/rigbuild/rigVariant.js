// A RIG VERSION's place in its set (RIG_BUILD.md §15): read from the show's entity, for
// the space view's switch. Pure, imports nothing heavy — the published viewer loads it.

/** The document's rigVariant (on the show's entity), or null. */
export const rigVariantOf = (entities = []) => {
    const holder = entities.find((e) => e?.components?.rigVariant?.siblings?.length)
    return holder ? holder.components.rigVariant : null
}

/** The switch's entries, in the set's order, with the current one marked; null when there is nothing to switch to. */
export const versionLinks = (variant, currentProjectId, hrefOf) => {
    const siblings = variant?.siblings || []
    if (siblings.length < 2) return null
    return siblings.map((s) => ({ id: s.id, title: s.title, summary: s.summary || '', href: hrefOf(s.projectId), current: s.projectId === currentProjectId || s.id === variant.id }))
}
