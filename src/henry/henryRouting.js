import { slugifySpaceName } from '../utils/spaceNames.js'

// henry — a two-minute surreal dream the visitor walks through. Same routing
// shape as algovrithm: the name is already a legal server space id
// (`/^[a-z0-9-]{1,48}$/`), so the id, the public URL and the display label are
// one and the same string and there is no slug seam to get wrong.
export const HENRY_SPACE_ID = 'henry'

export const HENRY_PATH = '/henry'

export const HENRY_LABEL = 'henry'

// Routing hands us the raw path segment, so matching goes through the same
// slugifier the rest of the app uses — a visitor arriving at /Henry should
// land on the space rather than a 404.
export const isHenrySegment = (segment = '') =>
    slugifySpaceName(String(segment || '')) === HENRY_SPACE_ID
