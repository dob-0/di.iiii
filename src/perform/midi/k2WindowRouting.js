import { createBasePathHelpers, joinPath } from '../../project/routing/laneBasePath.js'

// /{space}/perform/{projectId}/k2 — the controller window: the K2 drawn as a picture, read only.
// Same shape as the output page's /{space}/map/{projectId}/out: the lane word, the project, one
// last word. It claims no new top-level word (nothing to reserve); the space and project in the
// address only say which deck's session to sit behind, the page loads no project data.
export const K2_WINDOW_SEGMENT = 'k2'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildK2WindowPath = (spaceId, projectId) => joinPath(getBasePrefix(), spaceId, 'perform', projectId, K2_WINDOW_SEGMENT)

const EMPTY = { isK2Window: false, spaceId: null, projectId: null }

export const getK2WindowLocationState = (locationLike = null) => {
    const resolved = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolved) return EMPTY
    const relative = stripBasePath(resolved.pathname || '/').replace(/^\/+/g, '').replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    if (segments.length !== 4 || segments[1] !== 'perform' || segments[3] !== K2_WINDOW_SEGMENT) return EMPTY
    if (!segments[0] || !segments[2]) return EMPTY
    return { isK2Window: true, spaceId: segments[0], projectId: segments[2] }
}

export const isK2WindowLocation = (state = null) => Boolean(state?.isK2Window)
