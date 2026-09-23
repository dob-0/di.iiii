/* global __DI_WORKS__ */
import { slugifySpaceName } from '../utils/spaceNames.js'
import { buildAppSpacePath, buildPublicProjectPath } from '../utils/spaceRouting.js'
import { WORKS, WORK_IDS } from './works.js'

/**
 * Which work, if any, owns this URL segment.
 *
 * Matching goes through the same slugifier the rest of the app uses rather
 * than a literal compare, so a visitor arriving at /AlgoVrithm lands on the
 * work instead of a 404. Kept out of works.js because that file has to stay
 * import-free for the build to read it.
 */
export const workForSegment = (segment = '') => {
    const slug = slugifySpaceName(String(segment || ''))
    if (!slug) return null
    return WORKS.find((work) => work.id === slug) ?? null
}

export const isWorkSegment = (segment = '') => workForSegment(segment) !== null

/**
 * The door a space's own card opens — the SPACE, never the code that shares
 * its name.
 *
 * Two spaces answer to a segment a work has already claimed. `/wcc` bare is
 * the coded microsite in src/wccSite/; the `wcc` SPACE is eleven artist
 * projects in the database at `/wcc/<slug>`. RootApp resolves the bare segment
 * to the work before the space router ever sees it (the isWorkSurface branch),
 * so a card built on buildAppSpacePath could only ever land on the piece:
 * the exhibition landing on a hosted tier, and on an offline install — where
 * DI_PROFILE=local resolves every work to HostedPieceStub — "not in this copy",
 * for a space whose rows that very machine is holding.
 *
 * So where a work shadows the segment, the card addresses the space's own
 * declared published project instead. The /{space}/p/{id} form, not the vanity
 * one: publishedProjectId is a raw id and needs no resolve step, and a
 * three-segment path is past the isWorkSurface branch by construction.
 *
 * A space no work shadows is untouched — the bare path is already its door.
 * Nothing here names a work; the registry answers.
 */
export const buildSpaceDoorPath = (space) => {
    const spaceId = typeof space === 'string' ? space : space?.id
    const publishedProjectId = typeof space === 'string' ? null : space?.publishedProjectId
    if (spaceId && publishedProjectId && isWorkSegment(spaceId)) {
        return buildPublicProjectPath(spaceId, publishedProjectId)
    }
    return buildAppSpacePath(spaceId)
}

// Which works are compiled into THIS artifact — the build wrote it down
// (vite.config.js `define`). Undefined under vitest, where every work is in.
// Read at call time so a test can say "a copy without the works".
const worksInThisBuild = () => (typeof __DI_WORKS__ === 'undefined' ? WORK_IDS : __DI_WORKS__)

/**
 * The face a space's card shows — what a visitor meets at the address the
 * card prints.
 *
 * The card prints `/wcc`, and `/wcc` is the exhibition's front page. The
 * picture above that address was the space's published project instead (the
 * door path above), so the card showed a bare wireframe room under the name
 * of an exhibition whose front page is the red one (owner, 2026-09-18).
 *
 * Where a work shadows the segment AND is in this build, the face is the
 * work's own path. A copy that left the work out keeps the door path: there
 * the front page is HostedPieceStub, and the rows are the only thing to show.
 */
export const buildSpaceFacePath = (space, worksInBuild = worksInThisBuild()) => {
    const spaceId = typeof space === 'string' ? space : space?.id
    const work = workForSegment(spaceId)
    if (work && worksInBuild.includes(work.id)) return work.path
    return buildSpaceDoorPath(space)
}
