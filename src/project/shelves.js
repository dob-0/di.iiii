/**
 * Projects grouped by the shelf they are on.
 *
 * Audit of 2026-11-12: the Studio hub grouped a space's projects under their
 * shelves inline, and the space page, which lists the same projects, did not.
 * One pure helper, so a space is organised the same way wherever its projects
 * are listed. The result is what the hub drew before, unchanged.
 */

// The id of the group that holds whatever is on no shelf.
export const UNSHELVED = '__loose__'

// The shelves, in their order, each with what is on it, and everything else
// under one last heading. A space with no shelves gives one group with no
// label: one grid, no headings, nothing to learn.
export const groupByShelf = (projects, collections, { looseLabel = 'Not on a shelf' } = {}) => {
    if (!collections.length) return [{ id: UNSHELVED, label: null, items: projects }]
    const byShelf = new Map(collections.map(c => [c.id, []]))
    const loose = []
    for (const project of projects) {
        const bucket = project.collectionId && byShelf.has(project.collectionId)
            ? byShelf.get(project.collectionId)
            : loose
        bucket.push(project)
    }
    return [
        ...collections.map(c => ({ id: c.id, label: c.label, items: byShelf.get(c.id) || [] })),
        ...(loose.length ? [{ id: UNSHELVED, label: looseLabel, items: loose }] : [])
    ]
}
