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

// A node that stands in the room is a THING, not a connection: the 18 kinds
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

// Bytes of a string as UTF-8, counted by hand so this file and its server twin
// (shared/layers.cjs) give the same number for the same page.
const utf8Length = (value) => {
    let bytes = 0
    for (let i = 0; i < value.length; i++) {
        const unit = value.charCodeAt(i)
        if (unit < 0x80) bytes += 1
        else if (unit < 0x800) bytes += 2
        else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < value.length && (value.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
            bytes += 4
            i += 1
        } else bytes += 3
    }
    return bytes
}

// The page's own size: its files when it has them, else its single html.
const pageSize = (presentation) => {
    const files = list(presentation.codeFiles)
    if (files.length) {
        return files.reduce((sum, file) => sum + (file && typeof file.content === 'string' ? utf8Length(file.content) : 0), 0)
    }
    return typeof presentation.codeHtml === 'string' ? utf8Length(presentation.codeHtml) : 0
}

const assetSize = (asset) => {
    const size = Number(asset?.size)
    return Number.isFinite(size) && size > 0 ? size : 0
}

const mediaAssetId = (entity) => text(entity?.components?.media?.assetId)

// A stage fixture: the rig builder's lamp (src/rigbuild/autoPatch.js isLamp, a
// typed components.fixture) or a light joined to a fixture of the lighting desk.
// Measured on 13 real MOXIR documents of 10-09 and 10-13: 1374 of 1374 spots
// carry a typed fixture, only 96 carry an index.
const typedFixture = (entity) => {
    const type = entity?.components?.fixture?.type
    return typeof type === 'string' && type !== ''
}
const stageLamp = (entity) => joinedToFixture(entity) || typedFixture(entity)

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

    // Files (document.assets). The file a picture or a video shows is counted
    // with that picture or video, not once more as a file; the size is all of them.
    const images = entities.filter((entity) => entity?.type === 'image')
    const videos = entities.filter((entity) => entity?.type === 'video')
    const shown = new Set([...images, ...videos].map(mediaAssetId).filter(Boolean))
    const held = new Map()
    list(document?.assets).forEach((asset, index) => {
        const key = text(asset?.id) || `#${index}`
        if (!held.has(key)) held.set(key, assetSize(asset))
    })
    // A project that builds a page holds its code even with no thing in it.
    // It is no layer of the room, but it is never "empty".
    const page = presentation.mode === 'code'
        || Boolean(text(presentation.codeHtml) || text(presentation.codeUrl) || list(presentation.codeFiles).length)

    const counts = {
        objects: entities.length,
        standingNodes,
        things: entities.length + standingNodes,
        lamps: lampObjects.length,
        joinedLamps: lampObjects.filter(joinedToFixture).length,
        stageLamps: lampObjects.filter(stageLamp).length,
        nodes: operatorNodes,
        wires: edges.length,
        surfaces: list(mapping.surfaces).length,
        pictureOuts: nodes.filter((node) => node?.typeId === PICTURE_OUT).length,
        cues: cues.length,
        // A cue that calls a light scene or look (projectSchema.js
        // defaultMappingCue) is the light show already in use from this project.
        lightCues: cues.filter((cue) => text(cue?.lightScene) || text(cue?.lightLook)).length,
        images: images.length,
        videos: videos.length,
        files: [...held.keys()].filter((key) => !shown.has(key)).length,
        fileBytes: [...held.values()].reduce((sum, size) => sum + size, 0),
        templates: list(document?.templates).length,
        shared: Boolean(publish.shareEnabled),
        exported: Number(publish.lastExportAt) > 0,
        page,
        pageBytes: page ? pageSize(presentation) : 0
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

const KB = 1024

// A size as the card writes it: bytes, whole kB, then MB and GB with one
// decimal ("117.4 MB"). 1024-based, like every other size in the product.
const formatSize = (bytes) => {
    const n = Math.max(0, Number(bytes) || 0)
    if (n < KB) return `${Math.round(n)} B`
    const kb = Math.round(n / KB)
    if (kb < KB) return `${kb} kB`
    const mb = Math.round((n / (KB * KB)) * 10) / 10
    if (mb < KB) return `${mb.toFixed(1)} MB`
    return `${(n / (KB * KB * KB)).toFixed(1)} GB`
}

/**
 * The card's one line: "53 objects · 74 lamps · 1 surface · 3 files · 3.2 MB",
 * or "empty" — said only when the project holds nothing at all.
 *
 * Words are the dictionary's (docs/ai/vocabulary.md). An object is one thing in
 * the scene; a lamp is a stage fixture, here a light that carries a fixture (a
 * typed one from the rig builder, or a join to the lighting desk); a light is a
 * 3D scene light that carries none. A picture or a
 * video is counted as one, so it is not an object as well, and its file is not
 * a file as well. A cue that calls the light desk is a light cue and is counted
 * once, there. The size is the size of every file the project holds.
 */
export function describeProjectLayers(counts) {
    if (!counts) return ''
    const n = (key) => Number(counts[key]) || 0
    const lamps = Math.min(n('stageLamps'), n('lamps'))
    const lights = Math.max(0, n('lamps') - lamps)
    const objects = Math.max(0, n('things') - n('lamps') - n('images') - n('videos'))
    const parts = []
    const add = (count, word) => { if (count > 0) parts.push(plural(count, word)) }
    add(objects, 'object')
    add(lamps, 'lamp')
    add(lights, 'light')
    add(n('nodes'), 'node')
    add(n('wires'), 'wire')
    add(n('surfaces'), 'surface')
    add(Math.max(0, n('cues') - n('lightCues')), 'cue')
    add(n('lightCues'), 'light cue')
    add(n('templates'), 'template')
    if (counts.page) parts.push(n('pageBytes') > 0 ? `page ${formatSize(n('pageBytes'))}` : 'page')
    add(n('images'), 'image')
    add(n('videos'), 'video')
    add(n('files'), 'file')
    if (n('fileBytes') > 0) parts.push(formatSize(n('fileBytes')))
    return parts.length ? parts.join(' · ') : 'empty'
}

export default readProjectLayers
