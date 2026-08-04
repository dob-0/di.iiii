import { slugifySpaceName } from '../utils/spaceNames.js'

// The name is already a legal server space id (`/^[a-z0-9-]{1,48}$/`), so the
// id, the public URL and the display label are one and the same string. That
// is what spelling it lowercase and unpunctuated buys: /br_id_ge has to be
// slugified down to the `br-id-ge` space and the two can drift apart, and the
// earlier algo_VRitm/algo-vritm spelling had exactly that seam. This one has
// no seam to get wrong.
export const ALGO_VRITHM_SPACE_ID = 'algovrithm'

export const ALGO_VRITHM_PATH = '/algovrithm'

// The piece itself, one segment down — same split as /wcc and /wcc/scene. The
// bare path is the landing page because entering costs 1.6 MB of renderer and
// a photosensitivity warning, and neither should be spent on a visitor who has
// only followed a link.
export const ALGO_VRITHM_SCENE_PATH = '/algovrithm/scene'

export const ALGO_VRITHM_LABEL = 'algovrithm'

// getAppLocationState hands routing the raw path segment, so matching still
// goes through the same slugifier the rest of the app uses rather than a
// literal string compare — a visitor arriving at /AlgoVrithm should land on
// the space rather than a 404.
export const isAlgoVrithmSegment = (segment = '') =>
    slugifySpaceName(String(segment || '')) === ALGO_VRITHM_SPACE_ID
