import { slugifySpaceName } from '../utils/spaceNames.js'
import { buildAppSpacePath, buildPublicProjectPath } from '../utils/spaceRouting.js'
import { WORKS } from './works.js'

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
