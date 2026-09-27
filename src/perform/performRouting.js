import { createBasePathHelpers, joinPath } from '../project/routing/laneBasePath.js'

// /{space}/perform/{projectId}[?preset=<id>][&from=map|raw|studio]
//
// The show run with only the windows the job needs (decision 2026-09-24,
// di-atlas decisions/2026-09-24-perform-line.md). Same shape as the mapper's
// /{space}/map/{projectId}: one exact three-segment path with the word in the
// middle, claimed before the generic /{space}/{projectSlug} rule reads
// "perform" as the name of a project.
//
// `preset` is part of the address so a phone or a guest opens exactly one
// arrangement from a link. `from` names the desk the person came from, so
// the Desk half of the Desk | Perform switch goes back to THAT desk.
export const PERFORM_SEGMENT = 'perform'
export const PERFORM_FROM = ['map', 'raw', 'studio']

const { getBasePrefix, stripBasePath } = createBasePathHelpers(import.meta.env.BASE_URL || '/')

// A preset id as presets.js makes them: a built-in word, `show:<id>` or
// `mine:<id>`. Anything else in the address is ignored rather than trusted.
export const PRESET_ID_PATTERN = /^(?:[a-z][a-z0-9-]{0,31}|(?:show|mine):[A-Za-z0-9_-]{1,64})$/

export const buildPerformPath = (spaceId, projectId, { preset = null, from = null } = {}) => {
    const path = joinPath(getBasePrefix(), spaceId, PERFORM_SEGMENT, projectId)
    const query = new URLSearchParams()
    if (preset && PRESET_ID_PATTERN.test(preset)) query.set('preset', preset)
    if (from && PERFORM_FROM.includes(from)) query.set('from', from)
    const text = query.toString()
    return text ? `${path}?${text}` : path
}

const EMPTY = { isPerform: false, spaceId: null, projectId: null, preset: null, from: null }

export const getPerformLocationState = (locationLike = null) => {
    const resolved = locationLike || (typeof window !== 'undefined' ? window.location : null)
    if (!resolved) return EMPTY
    const relative = stripBasePath(resolved.pathname || '/')
        .replace(/^\/+/g, '')
        .replace(/\/+$/g, '')
    const segments = relative ? relative.split('/') : []
    // Exactly three. A fourth segment is not this lane: returning "perform,
    // but ignore the tail" would open the show at an address somebody meant
    // as something else (the same rule mapRouting.js keeps).
    if (segments.length !== 3) return EMPTY
    if (segments[1] !== PERFORM_SEGMENT) return EMPTY
    if (!segments[0] || !segments[2]) return EMPTY
    const query = new URLSearchParams(resolved.search || '')
    const preset = query.get('preset')
    const from = query.get('from')
    return {
        isPerform: true,
        spaceId: segments[0],
        projectId: segments[2],
        preset: preset && PRESET_ID_PATTERN.test(preset) ? preset : null,
        from: from && PERFORM_FROM.includes(from) ? from : null
    }
}

export const isPerformLocation = (state = null) => Boolean(state?.isPerform)
