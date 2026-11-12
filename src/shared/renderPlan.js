// RENDER PLAN — what a room is drawn FOR (render: Studio / Tech / Show) and what the device can carry (quality: Low / High),
// as one pure function of the document. Decision: docs/ai/decisions/2026-10-15-studio-tech-show-render.md (its table is
// renderPlan.test.js). The document is never written: every plan draws a copy.
//
//   studio  the building view — the document as authored; the Studio viewport adds its edit tools
//   tech    the schematic for the crew in the live show — ONLY the show's things (the rig, the cue data, the stage solids and the wall picture): the rig as plain flat shapes in their own
//           colour, the floor and the hall as plain grey faces; no air, fog, bloom, shadows, floor reflection, machines,
//           outside, or other objects (owner 2026-10-15 07:1x–07:2x)
//   show    the room as the audience sees it — the document as authored (its own air, bloom, lasers with halo); the public
//           link's default and the Studio's Preview
//
// Quality on top, render first: Low = the output (outputDocument) on whatever the render left; High = the render's copy.
// Pure: no DOM, no three.js. The Low rule lives here so src/project/viewport/outputMode.js and this plan share one copy.

export const RENDER_MODES = Object.freeze(['studio', 'tech', 'show'])
export const RENDER_STORAGE_KEY = 'di.view.render'
export const SCHEMATIC_LOOK = 'schematic'
/** Tech's light on the hall: white, never tinted by the version's ambient (owner 2026-10-15: "why the lights like this"). */
export const TECH_AMBIENT = Object.freeze({ color: '#ffffff', intensity: 0.6 })
/** Tech's exposure: the plain grey solids read at 1, whatever the room's authored haze exposure is. */
export const TECH_EXPOSURE = 1
/** Tech's layers: the factory's machines and the world outside the hall are not the show's things. */
export const TECH_LAYERS = Object.freeze({ machines: false, outside: false })

const RENDER_RE = /(?:^|[?&])render=(studio|tech|show)(?:&|$)/i

/** One render word as 'studio' | 'tech' | 'show' (null for anything else). */
export const normalizeRender = (value) => {
    const v = String(value ?? '').toLowerCase()
    return RENDER_MODES.includes(v) ? v : null
}

/**
 * The render a ROOM PAGE draws: `?render=` in the address wins, then the tab's own choice, else Show. The room page has no
 * edit tools, so 'studio' there draws Show (stated in the decision).
 */
export const roomRenderWanted = ({ search = '', stored = null } = {}) => {
    const pick = normalizeRender(RENDER_RE.exec(String(search || ''))?.[1]) || normalizeRender(stored)
    return pick === 'tech' ? 'tech' : 'show'
}

// ---------------------------------------------------------------------------------------
// Quality Low — the output (moved from outputMode.js 2026-10-15; outputMode.js re-exports it)

export const OUTPUT_POOL_SLOTS = 4

/** The room's render settings as the output draws them. */
export const outputRenderSettings = (renderSettings = {}) => {
    const rs = renderSettings && typeof renderSettings === 'object' ? renderSettings : {}
    const { bloom: _bloom, surfaces: _surfaces, ...rest } = rs
    return {
        ...rest,
        shadows: false,
        shadowCasting: { ...(rs.shadowCasting || {}), enabled: false },
        antialias: false,
        dprMin: 1,
        dprMax: 1
    }
}

/** A copy of the document drawn as the output: its render settings, and the light pool on. */
export const outputDocument = (document) => {
    if (!document) return document
    const pool = document.mappingState?.lightPool || {}
    const slots = Math.min(OUTPUT_POOL_SLOTS, Number.isFinite(Number(pool.slots)) ? Number(pool.slots) : OUTPUT_POOL_SLOTS)
    return {
        ...document,
        renderSettings: outputRenderSettings(document.renderSettings),
        mappingState: { ...(document.mappingState || {}), lightPool: { ...pool, enabled: true, slots } }
    }
}

// ---------------------------------------------------------------------------------------
// Tech — which entities are the show's things

// The same sets as smartViewGeometry.js isRigEntity / isArchitectureEntity (src/shared may not import src/project);
// renderPlan.test.js checks the two agree on every entity it draws.
const LIGHT_TYPES = new Set(['spotLight', 'pointLight', 'directionalLight', 'rectAreaLight', 'hemisphereLight'])
const PLACE_NAME = /\b(hall|building|venue|room|architecture|walls?|warehouse|factory|scan|place|interior)\b/i
const FLOOR_NAME = /\b(floor|stage|ground|deck)\b/i

const isRig = (e) => {
    const c = e?.components || {}
    return LIGHT_TYPES.has(e?.type) || Boolean(c.fixture) || Boolean(c.light) || Boolean(c.beam) || Boolean(c.piece)
}
const isBuilding = (e) => {
    if (!e || isRig(e)) return false
    const c = e.components || {}
    if (c.viewRole === 'architecture') return true
    if (c.viewRole) return false
    if (e.id === 'place-hall' || c.venuePlan) return true
    return e.type === 'model' && PLACE_NAME.test(String(e.name || ''))
}

// The show's own data holders: the entity that carries the looks/cues (rigLooks), the part map (rigParts) or the hall plan
// (venuePlan). They draw nothing themselves, but the cue player (useRigLookEntities → rigLooksOf) reads the looks from the
// entity list it is fed, so dropping the holder left Tech with no cue at all (the lamps stayed at their authored state).
const DATA_COMPONENTS = ['rigLooks', 'rigParts', 'venuePlan']
const holdsShowData = (e) => DATA_COMPONENTS.some((k) => e?.components?.[k] != null)
// A picture or video on the stage's wall: the LED wall picture (named for what it is, never for a production).
const SCREEN_TYPES = new Set(['image', 'video'])
const SCREEN_NAME = /\b(screen|led|wall|projection|backdrop)\b/i
const isScreenPicture = (e) => SCREEN_TYPES.has(e?.type) && SCREEN_NAME.test(String(e?.name || ''))
// A stage solid: a plain box/cylinder/... (towers, wings, screen frame, stands). Kept only in a room that holds a rig.
const isSolid = (e) => Boolean(e?.components?.primitive || e?.components?.occluder)

/** Is this entity one of the show's things — kept in Tech on its own merit? */
export const isShowThing = (entity) => {
    if (!entity) return false
    if (isRig(entity) || isBuilding(entity) || holdsShowData(entity) || isScreenPicture(entity)) return true
    if (entity.type === 'camera') return true
    return FLOOR_NAME.test(String(entity.name || ''))
}

/** Tech's entities: the show's things and every parent of one (a lamp hung in a group keeps its group). */
export const techEntities = (entities = []) => {
    const list = Array.isArray(entities) ? entities : []
    const byId = new Map(list.map((e) => [e?.id, e]))
    const keep = new Set()
    // in a room with a rig the stage's own solids are the show's things too (drawn plain grey in Tech)
    const rigRoom = list.some((e) => isRig(e))
    for (const e of list) {
        if (!isShowThing(e) && !(rigRoom && isSolid(e))) continue
        let at = e
        const seen = new Set()
        while (at && !keep.has(at.id) && !seen.has(at.id)) {
            seen.add(at.id)
            keep.add(at.id)
            at = at.parentId ? byId.get(at.parentId) : null
        }
    }
    return list.filter((e) => keep.has(e?.id))
}

// ---------------------------------------------------------------------------------------
// The plan

const techDocument = (document) => {
    const rs = document.renderSettings && typeof document.renderSettings === 'object' ? document.renderSettings : {}
    const { atmosphere: _air, bloom: _bloom, surfaces: _surfaces, ...rest } = rs
    const ws = document.worldState && typeof document.worldState === 'object' ? document.worldState : {}
    return {
        ...document,
        entities: techEntities(document.entities),
        renderSettings: {
            ...rest,
            look: SCHEMATIC_LOOK,
            // the authored exposure belongs to the haze (Show's 0.1 here turned the plain grey solids black): Tech's fixed
            toneMappingExposure: TECH_EXPOSURE,
            shadows: false,
            shadowCasting: { ...(rs.shadowCasting || {}), enabled: false }
        },
        worldState: { ...ws, fog: { ...(ws.fog || {}), enabled: false }, ambientLight: { ...TECH_AMBIENT } }
    }
}

/**
 * The plan for drawing `document` for `mode` on a device of `quality`:
 *   { mode, quality, document, layers, editing, schematic }
 * `document` is a copy (or the same object when nothing changes); `layers` the layer switches the render forces off
 * (null = the viewer's own); `editing` whether edit tools belong on it; `schematic` the flat look of Tech.
 */
export const renderPlan = (document, { mode = 'show', quality = 'high' } = {}) => {
    const render = normalizeRender(mode) || 'show'
    const q = quality === 'low' ? 'low' : 'high'
    const plan = { mode: render, quality: q, document, layers: null, editing: render === 'studio', schematic: render === 'tech' }
    if (!document) return plan
    let doc = render === 'tech' ? techDocument(document) : document
    if (q === 'low') doc = outputDocument(doc)
    return { ...plan, document: doc, layers: render === 'tech' ? { ...TECH_LAYERS } : null }
}
