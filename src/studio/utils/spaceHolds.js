import { WORKS } from '../../works/works.js'

// What a space card says the space holds.
//
// A work compiled into di.iiii's own code (src/works/works.js: a work with a
// codeSpace block) has no project row on any server, so a card that counts only
// projects calls its space empty beside a finished work. This module only has
// to know which spaces hold one. It is kept apart from codeSpaces.js, which
// calls the Studio router while it loads and so cannot be pulled into a space
// card; both read the same registry by the same rule.
const COMPILED_WORK_SPACES = new Set(WORKS.filter((work) => work.codeSpace).map((work) => work.id))

export const holdsCompiledWork = (spaceId) => COMPILED_WORK_SPACES.has(spaceId)

/**
 * "29 projects · 9 published", "a work in di.iiii's code", or both — and
 * "No projects yet" only when the space holds neither.
 * Takes the space as the server sends it: { id, projectCount, publishedCount }.
 */
export function describeSpaceHolds({ id, projectCount, publishedCount } = {}) {
    const parts = []
    if (projectCount > 0) {
        parts.push(`${projectCount} project${projectCount === 1 ? '' : 's'}`)
        parts.push(publishedCount > 0 ? `${publishedCount} published` : 'none published')
    }
    if (holdsCompiledWork(id)) parts.push("a work in di.iiii's code")
    return parts.length ? parts.join(' · ') : 'No projects yet'
}
