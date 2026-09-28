import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// /{space}/cards/{projectId} — the cards, view C (docs/architecture/RIG_BUILD.md §11):
// the rental list dealt onto named positions, the patch filling in beside them, the
// looks on the cue list. The same shape as the plot's /{space}/plot/{id} and the patch
// sheet's /{space}/patch/{id}, claimed the same way, before the generic
// /{space}/{projectSlug} rule would read "cards" as a project.
export const CARDS_SEGMENT = 'cards'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildCardsPath = (spaceId, projectId) => joinPath(getBasePrefix(), spaceId, CARDS_SEGMENT, projectId)

const EMPTY = { isCards: false, spaceId: null, projectId: null }

export const getCardsLocationState = (locationLike = null) => {
    const resolved = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolved) return EMPTY
    const relative = stripBasePath(resolved.pathname || '/').replace(/^\/+/g, '').replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    if (segments.length !== 3 || segments[1] !== CARDS_SEGMENT || !segments[0] || !segments[2]) return EMPTY
    return { isCards: true, spaceId: segments[0], projectId: segments[2] }
}

export const isCardsLocation = (state = null) => Boolean(state?.isCards)
