import { slugifySpaceName } from '../utils/spaceNames.js'
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
