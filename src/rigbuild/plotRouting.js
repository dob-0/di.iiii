import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// /{space}/plot/{projectId} — the lighting plot, view B (docs/architecture/RIG_BUILD.md
// §10): the rig drawn from above with the room beside it. The same shape as the
// patch sheet's /{space}/patch/{id} — its sheets 2 and 3 — and claimed the same way,
// before the generic /{space}/{projectSlug} rule would read "plot" as a project.
export const PLOT_SEGMENT = 'plot'

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

export const buildPlotPath = (spaceId, projectId) => joinPath(getBasePrefix(), spaceId, PLOT_SEGMENT, projectId)

const EMPTY = { isPlot: false, spaceId: null, projectId: null }

export const getPlotLocationState = (locationLike = null) => {
    const resolved = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolved) return EMPTY
    const relative = stripBasePath(resolved.pathname || '/').replace(/^\/+/g, '').replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    if (segments.length !== 3 || segments[1] !== PLOT_SEGMENT || !segments[0] || !segments[2]) return EMPTY
    return { isPlot: true, spaceId: segments[0], projectId: segments[2] }
}

export const isPlotLocation = (state = null) => Boolean(state?.isPlot)
