import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'
import { lightingDeskPath } from '../map/lightingLink.js'

// /{space}/touch/{projectId} is not a page of its own: the Touch pane is a tab of the light
// desk. People guess this address (2026-10-02 human audit: it silently drew the plain room), so
// it forwards to the desk's Touch tab. Same shape as /{space}/visualise/{id}: exactly three
// segments with the word in the middle.
export const TOUCH_SEGMENT = 'touch'

const { stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

const EMPTY = { isTouch: false, spaceId: null, projectId: null }

export const getTouchLocationState = (locationLike = null) => {
    const resolved = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolved) return EMPTY
    const relative = stripBasePath(resolved.pathname || '/').replace(/^\/+/g, '').replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    if (segments.length !== 3 || segments[1] !== TOUCH_SEGMENT || !segments[0] || !segments[2]) return EMPTY
    return { isTouch: true, spaceId: segments[0], projectId: segments[2] }
}

export const isTouchLocation = (state = null) => Boolean(state?.isTouch)

/** The desk's Touch tab for that project. */
export const touchDeskPath = (spaceId, projectId) => `${lightingDeskPath({ spaceId, projectId })}#touch`
