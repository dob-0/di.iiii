// WHAT VISITORS SEE (owner 2026-10-13: "look how many UI things pop up when you first load the view page ... not
// connected to the Studio, not manageable"). The view page's own controls are data a production's author chooses in
// the Studio, stored the way the views are (decision 3, 2026-10-13: the choice lives per production, every version
// shows the same): the list project's `production` entity keeps component `productionViews.visitorChrome`, each
// version keeps a copy in its own presentationState.visitorChrome (the viewer reads only the project it shows).
// A part not mentioned is ALLOWED (the old behaviour); the viewer still starts every allowed panel closed
// (src/utils/rememberedOpen.js). Pure; no production is named here.
import { PRODUCTION_ENTITY_ID } from './productionVersions.js'

export const VISITOR_PARTS = Object.freeze([
    { id: 'versions', label: 'Versions chip' },
    { id: 'show', label: 'SHOW chip' },
    { id: 'scenes', label: 'Scene bricks' },
    { id: 'walk', label: 'Walk / Fly and Quality' },
    { id: 'views', label: 'Views bar' },
    { id: 'layers', label: 'Layers' }
])

const IDS = VISITOR_PARTS.map((p) => p.id)

/** Every part as a boolean; anything not explicitly `false` is shown. */
export const normalizeVisitorChrome = (value) => {
    const source = value && typeof value === 'object' ? value : {}
    return Object.fromEntries(IDS.map((id) => [id, source[id] !== false]))
}

/** The chrome a project's viewer draws: its own presentationState.visitorChrome. */
export const visitorChromeOf = (document) => normalizeVisitorChrome(document?.presentationState?.visitorChrome)

/** The production's stored choice (as written), or null when it has not chosen one. */
export const productionChromeOf = (document) => {
    const entities = Array.isArray(document?.entities) ? document.entities : []
    const chrome = entities.find((e) => e?.id === PRODUCTION_ENTITY_ID)?.components?.productionViews?.visitorChrome
    return chrome && typeof chrome === 'object' ? normalizeVisitorChrome(chrome) : null
}

/** The op that sets the production's chrome. Throws when the list has no production entity yet. Pure. */
export const productionChromeOps = (document, chrome) => {
    const entities = Array.isArray(document?.entities) ? document.entities : []
    if (!entities.some((e) => e?.id === PRODUCTION_ENTITY_ID)) throw new Error('the version list has no production entity yet (productionOps first)')
    return [{ type: 'updateComponent', payload: { entityId: PRODUCTION_ENTITY_ID, component: 'productionViews', patch: { visitorChrome: normalizeVisitorChrome(chrome) } } }]
}

/** Can this session edit in `spaceId`? (Edit in Studio is offered only to someone who can.) Mirrors SpaceContentsPage. */
export const canEditSession = (session, spaceId, inScope) => {
    if (!session?.requireAuth) return true
    if (session.role === 'admin') return true
    return Boolean(session.authenticated) && Boolean(inScope(session, spaceId))
}
