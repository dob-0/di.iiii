import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// /{space}/show/{project} — the SHOW PAGE (docs/architecture/RIG_BUILD.md §24): the live
// cue and the cue list as big cards, for everyone in the space, on a phone first. The
// project segment is its id or its slug (the server resolves either). Same shape as the
// cards' /{space}/cards/{id} and the scene deck's /{space}/scenes/{id}: exactly three
// segments with the word in the middle, claimed before the generic /{space}/{projectSlug}
// rule. A page of its own, not a mode of the room: the room is a WebGL scene, and a
// remote on a phone in a dark hall must open in a second and never load one.
export const SHOW_SEGMENT = 'show'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildShowPath = (spaceId, projectId) => joinPath(getBasePrefix(), spaceId, SHOW_SEGMENT, projectId)

const EMPTY = { isShow: false, spaceId: null, projectId: null }

export const getShowLocationState = (locationLike = null) => {
    const resolved = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolved) return EMPTY
    const relative = stripBasePath(resolved.pathname || '/').replace(/^\/+/g, '').replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    if (segments.length !== 3 || segments[1] !== SHOW_SEGMENT || !segments[0] || !segments[2]) return EMPTY
    return { isShow: true, spaceId: segments[0], projectId: segments[2] }
}

export const isShowLocation = (state = null) => Boolean(state?.isShow)
