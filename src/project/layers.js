import { NODE_TYPES, getNodeFamily } from './nodeRegistry.js'

// WHAT INSIDE WHAT. One project, built one layer at a time — each tool appears
// once the layer before it holds something (di-atlas decisions,
// 2026-09-23-layers-what-inside-what.md; the owner's words: "make it layer as
// layer, you create 1st what inside what and next next").
//
// The method is progressive disclosure: show the few things first and the rest
// when they are earned (J. Nielsen, "Progressive Disclosure", Nielsen Norman
// Group, 2006).
//
//   layer         opens when                  holds something when
//   space         always                      it has a project
//   things        a project is open           one thing stands in the room
//   connections   things holds something      a node that is not a thing, or a wire
//   wall          connections holds           a surface, or a Picture Out
//                 something
//   lamps         a lamp stands in the room   a lamp is joined to a fixture
//   hand over     things holds something      the link is shared or the file saved
//
// Three riders, and this file is where they live:
//   - A layer that holds something never hides again, even if an earlier layer
//     is emptied: a layer shows when its opening fact is true OR when it holds
//     something itself.
//   - Nothing opens or hides until the project has loaded. Before the load the
//     store holds a blank stand-in document (state/projectStore.js) whose every
//     count reads 0, so `loaded: false` answers `open: null` — "not decided" —
//     and every caller keeps what it shows today.
//   - The rule stores nothing. It is worked out from what the project holds,
//     every time, on every device. Nothing here writes a count or a kind
//     anywhere (serverXR/src/routes/projectRoutes.js says why a stored kind
//     is a claim the data cannot keep).
//
// The server runs the same rule for the project list from its twin,
// shared/layers.cjs. layers.test.js holds the two in lockstep.

export const LAYER_KEYS = ['space', 'things', 'connections', 'wall', 'lamps', 'handover']

// A node that stands in the room is a THING, not a connection: the 17 kinds
// Nodes' room draws (RawViewport.jsx isSpatialNode). Read from the registry so
// a new kind is counted the day it lands; the server's copy is a hand-kept list
// checked against this one.
export const STANDING_NODE_KINDS = new Set(
    Object.values(NODE_TYPES).filter((type) => type.render === 'spatial-3d').map((type) => type.id)
)

// A window on the canvas is neither a thing nor a connection: it is furniture,
// and opening an outliner must not open the wall. The registry names its
// windows itself — the "watch" family (outliner, inspector, timeline, monitor,
// director) and the "agents" family (work status, agents: the desk, which the
// same decision places inside Nodes on its own) — plus the two windows that do
// the jobs of Studio's Create and Share windows. A mic, a webcam, a MIDI input
// are drawn as windows too, but they are sources: they stay connections.
const WINDOW_FAMILIES = new Set(['watch', 'agents'])
const FURNITURE_WINDOWS = ['view.library', 'view.publish']
export const WINDOW_NODE_KINDS = new Set([
    ...Object.values(NODE_TYPES)
        .filter((type) => type.render === 'panel-2d' && WINDOW_FAMILIES.has(getNodeFamily(type.id)?.id))
        .map((type) => type.id),
    ...FURNITURE_WINDOWS
])

// The lamps a person places from Studio's Lights row (entityPalette.js LIGHTS).
export const LAMP_OBJECT_TYPES = new Set(['pointLight', 'spotLight', 'directionalLight', 'ambientLight'])

// Picture operators' output: the wall's own source (MapOutput.jsx).
const PICTURE_OUT = 'top.out'

const list = (value) => (Array.isArray(value) ? value : [])
const text = (value) => (typeof value === 'string' ? value.trim() : '')

// The join the lighting desk reads (src/rigMirror/liveLight.js fixtureIndexOf).
const joinedToFixture = (entity) => {
    const index = Number(entity?.components?.fixture?.index)
    return Number.isInteger(index) && index > 0
}

const ZERO_COUNTS = Object.freeze({
    objects: 0,
    standingNodes: 0,
    things: 0,
    lamps: 0,
    joinedLamps: 0,
    nodes: 0,
    wires: 0,
    surfaces: 0,
    pictureOuts: 0,
    cues: 0,
    lightCues: 0,
    shared: false,
    exported: false,
    page: false
})

/**
 * What each layer of a project holds, and which layers are open.
 *
 * @param {object} document  a project document (normalized or raw — every
 *                           field is read defensively)
 * @param {{ loaded?: boolean }} options  false while the real document has not
 *                           arrived; the answer is then "not decided"
 * @returns {{
 *   loaded: boolean,
 *   counts: typeof ZERO_COUNTS,
 *   holds: Record<'things'|'connections'|'wall'|'lamps'|'handover', boolean>,
 *   open: null | Record<'space'|'things'|'connections'|'wall'|'lamps'|'handover', boolean>,
 *   empty: null | boolean
 * }}
 */
export function readProjectLayers(document, { loaded = true } = {}) {
    if (!loaded) {
        return {
            loaded: false,
            counts: { ...ZERO_COUNTS },
            holds: { things: false, connections: false, wall: false, lamps: false, handover: false },
            open: null,
            empty: null
        }
    }
    const entities = list(document?.entities)
    const nodes = list(document?.nodes)
    const edges = list(document?.edges)
    const mapping = document?.mappingState || {}
    const cues = list(mapping.cues)
    const publish = document?.publishState || {}
    const presentation = document?.presentationState || {}

    const lampObjects = entities.filter((entity) => LAMP_OBJECT_TYPES.has(entity?.type))
    const standingNodes = nodes.filter((node) => STANDING_NODE_KINDS.has(node?.typeId)).length
    // Any other node is a connection — an operator, a source, a Picture Out, a
    // kind this build does not know yet — except a window.
    const operatorNodes = nodes.filter((node) => !STANDING_NODE_KINDS.has(node?.typeId) && !WINDOW_NODE_KINDS.has(node?.typeId)).length

    const counts = {
        objects: entities.length,
        standingNodes,
        things: entities.length + standingNodes,
        lamps: lampObjects.length,
        joinedLamps: lampObjects.filter(joinedToFixture).length,
        nodes: operatorNodes,
        wires: edges.length,
        surfaces: list(mapping.surfaces).length,
        pictureOuts: nodes.filter((node) => node?.typeId === PICTURE_OUT).length,
        cues: cues.length,
        // A cue that calls a light scene or look (projectSchema.js
        // defaultMappingCue) is the light show already in use from this project.
        lightCues: cues.filter((cue) => text(cue?.lightScene) || text(cue?.lightLook)).length,
        shared: Boolean(publish.shareEnabled),
        exported: Number(publish.lastExportAt) > 0,
        // A project that builds a page holds its code even with no thing in it.
        // It is no layer of the room, but it is never "empty".
        page: presentation.mode === 'code'
            || Boolean(text(presentation.codeHtml) || text(presentation.codeUrl) || list(presentation.codeFiles).length)
    }

    const holds = {
        things: counts.things > 0,
        connections: counts.nodes > 0 || counts.wires > 0,
        wall: counts.surfaces > 0 || counts.pictureOuts > 0,
        lamps: counts.joinedLamps > 0 || counts.lightCues > 0,
        handover: counts.shared || counts.exported
    }

    const open = {
        space: true,
        things: true,
        connections: holds.things || holds.connections,
        wall: holds.connections || holds.wall,
        lamps: counts.lamps > 0 || holds.lamps,
        handover: holds.things || holds.handover
    }

    const empty = !Object.values(holds).some(Boolean) && !counts.page

    return { loaded: true, counts, holds, open, empty }
}

/**
 * Has the REAL document of THIS project arrived?
 *
 * Two facts, both needed. The store's own `hasLoaded` (projectStore.js, shared
 * with Nodes' zen) says a document has arrived at all — until then the store
 * holds a blank stand-in whose every count reads 0. And the id: the server
 * stamps every document it sends with its own id (serverXR projectStore
 * coerceProjectDocument), and an editor switched to another project keeps the
 * old document, and `hasLoaded`, until the new one lands. A store too old to
 * carry `hasLoaded` (undefined) is judged by the id alone.
 */
export const isProjectLoaded = (document, projectId, hasLoaded) =>
    Boolean(projectId) && hasLoaded !== false && document?.projectMeta?.id === projectId

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The card's one line: "3 things · 2 wires · 1 surface · 1 lamp", or "empty".
 * Lamps are named on their own, so the things counted here are the things
 * that are not lamps; a lamp is still a thing to the rule above.
 */
export function describeProjectLayers(counts) {
    if (!counts) return ''
    const parts = []
    const things = (Number(counts.things) || 0) - (Number(counts.lamps) || 0)
    if (things > 0) parts.push(plural(things, 'thing'))
    if (counts.nodes > 0) parts.push(plural(counts.nodes, 'node'))
    if (counts.wires > 0) parts.push(plural(counts.wires, 'wire'))
    if (counts.surfaces > 0) parts.push(plural(counts.surfaces, 'surface'))
    if (counts.lamps > 0) parts.push(plural(counts.lamps, 'lamp'))
    if (!parts.length) return counts.page ? 'a page' : 'empty'
    return parts.join(' · ')
}

export default readProjectLayers
