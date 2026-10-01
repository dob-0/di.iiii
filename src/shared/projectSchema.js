
import { normalizePlacement } from './placement.js'
export const PROJECT_DOCUMENT_VERSION = 4
export const ENTITY_TYPES = [
    'box',
    'sphere',
    'cone',
    'cylinder',
    'plane',
    'torus',
    'capsule',
    'ring',
    'text',
    'image',
    'video',
    'audio',
    'model',
    'group',
    'portal',
    'pointLight',
    'spotLight',
    'directionalLight',
    'ambientLight'
]
export const WINDOW_IDS = ['viewport', 'assets', 'inspector', 'outliner', 'activity', 'project']

const ENTITY_TYPE_SET = new Set(ENTITY_TYPES)
const LEGACY_ROOT_NODE_IDS = new Set(['root-node', 'world-root', 'view-root'])
const LEGACY_ROOT_TYPE_IDS = new Set(['core.project', 'world.root', 'view.root'])
// No node type is a singleton — product decision 2026-07-19: every node type
// (including former singletons world.light/world.background/world.grid/
// universe.world/time/source.ar) nests freely, any number of times, in any
// scope. Do not re-add a singleton-dedup mechanism without checking with the
// user first. universe.node0 went through this same reversal earlier
// (2026-07-17); this generalizes it to every remaining former singleton.
// For scope-repeatable types where exactly one "active" result is wanted
// (e.g. a World's active Light/Background/Grid), see
// workspaceState.activeNodeIdByTypeScope in src/raw's editor — a hierarchy-
// as-connection picker, not a schema-level restriction.

export const cloneValue = (value) => {
    if (Array.isArray(value)) {
        return value.map(cloneValue)
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]))
    }
    return value
}

export const mergePatch = (target, patch) => {
    if (Array.isArray(patch)) return cloneValue(patch)
    if (!patch || typeof patch !== 'object') return patch
    const base = target && typeof target === 'object' ? cloneValue(target) : {}
    Object.entries(patch).forEach(([key, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            base[key] = mergePatch(base[key], value)
        } else {
            base[key] = cloneValue(value)
        }
    })
    return base
}

export const ensureVector = (value, fallback = [0, 0, 0]) => {
    const source = Array.isArray(value) ? value : []
    return fallback.map((entry, index) => {
        const next = Number(source[index])
        return Number.isFinite(next) ? next : entry
    })
}

const ensureString = (value, fallback = '') => {
    const next = typeof value === 'string' ? value.trim() : ''
    return next || fallback
}

const ensureBoolean = (value, fallback = false) => {
    if (typeof value === 'boolean') return value
    return fallback
}

const ensureNumber = (value, fallback = 0) => {
    const next = Number(value)
    return Number.isFinite(next) ? next : fallback
}

export const generateId = (prefix = 'id') => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID()
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const defaultWindowLayout = {
    activeWindowId: 'viewport',
    windows: {
        viewport: { id: 'viewport', title: 'Viewport', visible: true, minimized: false, pinned: true, x: 24, y: 176, width: 860, height: 580, zIndex: 3 },
        assets: { id: 'assets', title: 'Assets', visible: false, minimized: false, pinned: false, x: 910, y: 176, width: 360, height: 360, zIndex: 4 },
        inspector: { id: 'inspector', title: 'Inspector', visible: true, minimized: false, pinned: false, x: 910, y: 552, width: 360, height: 420, zIndex: 5 },
        outliner: { id: 'outliner', title: 'Outliner', visible: false, minimized: false, pinned: false, x: 24, y: 620, width: 280, height: 260, zIndex: 2 },
        activity: { id: 'activity', title: 'Activity', visible: false, minimized: false, pinned: false, x: 320, y: 620, width: 340, height: 260, zIndex: 1 },
        project: { id: 'project', title: 'Project', visible: false, minimized: false, pinned: false, x: 680, y: 620, width: 320, height: 260, zIndex: 1 }
    }
}

export const defaultWorldState = {
    backgroundColor: '#0a1118',
    environmentAssetId: null,
    environmentIntensity: 1,
    atmosphereBlend: false,
    hubDecor: false,
    spawn: null,
    fog: null,
    // null = unconfined (legacy: the walker is only clamped to the entity AABB
    // plus a 22m margin). An array of {minX,maxX,minZ,maxZ} rectangles declares
    // the walkable floor plan, and the walker cannot leave their union.
    walkableAreas: null,
    // null = free space, the historical behaviour. An object turns the room's
    // build zones ON: everything hangable that arrives is put in a numbered slot
    // by the server, so the room stays arranged no matter who edits it or how.
    // See src/shared/placement.js; switching it off leaves every photo where it is.
    placement: null,
    gridVisible: true,
    gridSize: 24,
    gridCellSize: 0.75,
    gridCellThickness: 0.3,
    gridCellColor: '#2a6e73',
    gridSectionSize: 6,
    gridSectionThickness: 0.65,
    gridSectionColor: '#4df9ff',
    gridFadeDistance: 80,
    gridFadeStrength: 1,
    gridOffset: 0.015,
    ambientLight: { color: '#ffffff', intensity: 0.85 },
    directionalLight: { color: '#fff7ea', intensity: 1.15, position: [8, 12, 4] },
    savedView: { mode: 'perspective', position: [0, 2.4, 6.5], target: [0, 0.75, 0], fov: 50, zoom: 1, near: 0.1, far: 1000 }
}

export const defaultRenderSettings = {
    shadows: true,
    // Whether the room's lamps and scenery join the shadow pass at all. Off:
    // see normalizeShadowCasting below for why this is not `shadows`.
    shadowCasting: { enabled: false, mapSize: 1024 },
    antialias: true,
    toneMapping: 'ACESFilmic',
    toneMappingExposure: 1,
    dprMin: 1,
    dprMax: 2
}

export const defaultXrState = {
    mode: 'none',
    debugVisible: false,
    vrSupported: false,
    arSupported: false
}

export const defaultPresentationFixedCamera = {
    projection: 'perspective',
    position: [0, 2.4, 6.5],
    target: [0, 0.75, 0],
    fov: 50,
    zoom: 1,
    near: 0.1,
    far: 200,
    locked: false
}

export const defaultPresentationState = {
    mode: 'scene',
    fixedCamera: defaultPresentationFixedCamera,
    codeHtml: '',
    codeSourceType: 'html',
    codeUrl: '',
    codeFiles: [],
    entryView: 'scene',
    // owner opt-in: render the published page without origin-isolating sandbox so
    // getUserMedia/device APIs work — the page then runs with the site's origin
    deviceAccess: false
}

export const defaultPublishState = {
    shareEnabled: false,
    xrDefaultMode: 'none',
    lastExportAt: 0
}

export const defaultShowState = {
    // Wall-clock ms stamped once, the first time a Time node exists in the
    // document. Every window (editor, second tab, /out) derives the same
    // elapsed value from it, so one show has ONE clock. 0 = not stamped yet;
    // the clock falls back to each window's own monotonic time.
    clockEpoch: 0
}

// The show's own Perform presets (decision 2026-09-24, the Perform line): a
// preset is a stored VIEW — which windows are open and where they stand, wide
// and narrow — and never show content. Kept here, in the document, so the
// crew following the space gets them and they travel in the .diiii file; a
// person's own presets live on their device (src/raw/utils/workspaceLayoutStorage.js).
// Added 2026-09-24 as an ADDITIVE key: a document without it normalizes to an
// empty list, so no version bump and no rewrite of stored documents.
export const PERFORM_PRESET_LIMIT = 24
export const PERFORM_PRESET_WINDOW_LIMIT = 16
export const defaultPerformState = {
    presets: []
}

export const defaultMappingSurface = {
    id: '',
    name: '',
    enabled: true,
    // Corners in the OUTPUT frame's normalised space, clockwise from
    // top-left. Normalised so a mapping aligned on a laptop still lands on the
    // wall when the projector runs at a different resolution — the paper does
    // not move because the signal changed.
    corners: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5], [0.1, 0.5]],
    // Polygon mask in the surface's OWN normalised space. Empty = the whole
    // rectangle. This is the KantanMapper move: the paper on the wall has cut
    // corners, so the mask is traced onto the surface rather than the surface
    // being forced into a rectangle.
    mask: [],
    // What is drawn: kind + ref.
    //   project — a di.iiii project id, rendered live
    //   url     — any page, in an iframe (this is how work that never landed
    //             in the platform still reaches the wall)
    //   video / image — an asset URL
    //   colour  — a flat fill
    //   test    — a generated pattern; see mapTestPattern.jsx
    // A NEW surface is born on `card`: a dim warm identification card naming
    // the surface, not the bright alignment grid. The desk and the wall are
    // two machines on a rig, so the moment Add is pressed the new surface is
    // on the projector — and the owner's standing rule is that white never
    // goes on a projector. `grid` and the rest stay one choice away in the
    // Pattern picker, at full brightness, for the person on the ladder.
    // Deliberately a `ref` and not a new `source.kind`: an older build's
    // MAPPING_SOURCE_KINDS would rewrite an unknown kind back to `test` and
    // lose the choice for good, while an unknown `ref` is kept verbatim (it
    // draws the grid on that old build, and comes back as the card here).
    source: { kind: 'test', ref: 'card' },
    // The unwarped pixel size of the layer before it is pinned. Set it to the
    // source's own aspect and the corner-pin does the rest.
    resolution: [1280, 720],
    opacity: 1,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    hue: 0,
    blend: 'normal',
    // What is done to the picture before it is drawn. Camera surfaces only, for
    // now. 'motion' keeps only what MOVES: the difference between two frames,
    // above `threshold`, multiplied by `gain`, fading by `trail` each frame —
    // stillness goes black and a moving body leaves a glowing wake.
    // 'ai' sends each frame to the local live-AI engine (serverXR/src/liveAi)
    // and draws what comes back: the room, restyled by `prompt`.
    effect: { kind: 'none', threshold: 0.08, trail: 0.88, gain: 4, prompt: '', strength: 0.5 }
}

export const defaultMappingCue = {
    id: '',
    name: '',
    // The key that fires it, '1'..'9'. Empty means mouse only.
    key: '',
    // Seconds the surfaces take to reach the cue. The fade is a CSS transition
    // on the surfaces themselves, so the desk preview and the wall fade
    // identically — there is no second animation to drift out of step.
    fade: 0.6,
    // Seconds to hold before an auto-advancing show moves on. 0 = wait for a
    // person.
    hold: 0,
    // OPTIONAL: the id of a scene on the lighting desk (serverXR/src/lighting,
    // served at /light on a LOCAL di.iiii) to recall when this cue fires. The
    // wall and the light in front of it are one show, so a cue can change
    // both. The ID is stored, never the name — a renamed scene must stay the
    // same scene. Absent unless set, so documents written before cues could
    // carry light are byte-identical after a round-trip.
    lightScene: '',
    lightLook: '',
    // Per-surface state, keyed by surface id: { enabled, opacity, source }.
    // GEOMETRY IS DELIBERATELY NOT IN A CUE. Corners and masks are the wall;
    // cues are the show. A cue that could move an alignment is a cue that can
    // destroy an afternoon's work between one key press and the next.
    surfaces: {}
}

export const defaultMappingReference = {
    // A photograph of the wall, shown behind the surfaces on the DESK only,
    // to trace paper edges over. Never drawn on the output.
    url: '',
    opacity: 0.5,
    visible: false
}

export const defaultMappingState = {
    // The signal the projector is fed. Only the ASPECT of this matters to the
    // geometry (corners are normalised); the numbers are here so the operator
    // can see what they are aiming at.
    output: { width: 1920, height: 1080 },
    background: '#000000',
    surfaces: [],
    cues: [],
    reference: defaultMappingReference,
    // Corner drags land on this many divisions of the output frame when snap
    // is on. 0 = no grid.
    grid: 0,
    // Seconds a surface takes to reach a new opacity. 0 while somebody is
    // editing; a cue writes its own fade here in the same op batch that
    // changes the surfaces, and CSS transitions read the AFTER style, so the
    // browser animates with the duration the cue just asked for.
    fade: 0
}

export const defaultWorkspaceState = {
    selectedNodeId: null,
    // Which universe.world node is the "live"/output one for a given scope — a flat
    // map keyed by scopeId (root scope key is '') so it works uniformly without a
    // container node to hold a values field. At most one live world per scope.
    liveWorldNodeIdByScope: {},
    // Generalizes liveWorldNodeIdByScope to any scope-repeatable type where
    // exactly one "active" result is wanted (world.light/world.background/
    // world.grid) — a hierarchy-as-connection picker (Kantan Mapper pattern:
    // siblings are the connection, this just marks which one), not a schema-
    // level restriction. Keyed by `${typeId}::${scopeId}` (root scope key is
    // ''); universe.world keeps its own dedicated map above rather than
    // migrating into this one, since Studio's StudioWorldSurface.jsx already
    // depends on liveWorldNodeIdByScope's exact shape.
    activeNodeIdByTypeScope: {}
}

export const defaultProjectDocument = {
    version: PROJECT_DOCUMENT_VERSION,
    projectMeta: { id: '', spaceId: 'main', title: 'Untitled Project', createdAt: 0, updatedAt: 0, source: 'project' },
    nodes: [],
    edges: [],
    templates: [],
    workspaceState: defaultWorkspaceState,
    entities: [],
    worldState: defaultWorldState,
    renderSettings: defaultRenderSettings,
    xrState: defaultXrState,
    presentationState: defaultPresentationState,
    publishState: defaultPublishState,
    showState: defaultShowState,
    performState: defaultPerformState,
    mappingState: defaultMappingState,
    windowLayout: defaultWindowLayout,
    assets: []
}

export const buildDefaultComponentsForType = (type = 'box') => {
    const base = {
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        appearance: { color: '#5fa8ff', opacity: 1 }
    }

    switch (type) {
        case 'sphere':
            base.primitive = { shape: 'sphere', radius: 0.6 }
            break
        case 'cone':
            base.primitive = { shape: 'cone', radius: 0.55, height: 1.4 }
            break
        case 'cylinder':
            base.primitive = { shape: 'cylinder', radiusTop: 0.45, radiusBottom: 0.45, height: 1.2 }
            break
        case 'plane':
            base.primitive = { shape: 'plane', width: 2, depth: 2 }
            break
        case 'torus':
            base.primitive = { shape: 'torus', radius: 0.5, tube: 0.18 }
            break
        case 'capsule':
            base.primitive = { shape: 'capsule', radius: 0.35, height: 0.8 }
            break
        case 'ring':
            base.primitive = { shape: 'ring', innerRadius: 0.4, outerRadius: 0.8 }
            break
        case 'text':
            base.text = { value: 'New Text', variant: '2d', billboard: false, fontFamily: 'Inter, sans-serif', fontWeight: '600', fontStyle: 'normal', align: 'left', fontSize3D: 0.45, depth3D: 0.08, font3D: 'helvetiker_regular', bevelEnabled3D: true, bevelThickness3D: 0.02, bevelSize3D: 0.01 }
            break
        case 'image':
            base.media = { assetId: null, fit: 'contain', autoplay: false, loop: false, muted: true }
            break
        case 'video':
            // spatial is off by default: routing a video's audio through a panner
            // changes how an existing space sounds, so it is opted into per video.
            base.media = { assetId: null, fit: 'contain', autoplay: true, loop: true, muted: true, volume: 0.8, spatial: false, distance: 6, maxDistance: 40 }
            break
        case 'audio':
            base.media = { assetId: null, autoplay: true, loop: true, muted: false, volume: 0.8, distance: 8 }
            break
        case 'model':
            base.media = { assetId: null, materialsAssetId: null, autoplay: false, loop: false, muted: false, playAnimations: true, animationSpeed: 1, clip: '' }
            break
        case 'pointLight':
            base.appearance = { color: '#ffffff', opacity: 1 }
            base.light = { color: '#ffffff', intensity: 1, distance: 10, decay: 2 }
            break
        case 'spotLight':
            base.appearance = { color: '#ffffff', opacity: 1 }
            base.light = { color: '#ffffff', intensity: 2, distance: 20, angle: 0.52, penumbra: 0.2, decay: 2 }
            break
        case 'directionalLight':
            base.appearance = { color: '#ffffff', opacity: 1 }
            base.light = { color: '#fff7ea', intensity: 1.5 }
            break
        case 'ambientLight':
            base.transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
            base.appearance = { color: '#ffffff', opacity: 1 }
            base.light = { color: '#ffffff', intensity: 0.5 }
            break
        case 'group':
            delete base.appearance
            break
        case 'portal':
            // References another project to render inline (embed) or as a
            // walk-in/click gateway to that space (portal). Keeps appearance
            // for the gateway's tint.
            base.reference = { spaceId: '', projectId: '', mode: 'portal', label: '' }
            break
        case 'box':
        default:
            base.primitive = { shape: 'box', size: [1, 1, 1] }
            break
    }

    // Solid primitives carry PBR surface options; the neutral values match
    // bare meshStandardMaterial so pre-existing documents look identical.
    if (['box', 'sphere', 'cone', 'cylinder', 'plane', 'torus', 'capsule', 'ring'].includes(type)) {
        base.appearance = {
            ...base.appearance,
            textureAssetId: null,
            roughness: 1,
            metalness: 0,
            emissive: '#000000',
            emissiveIntensity: 1
        }
    }

    return base
}

/**
 * What a NEWLY ADDED entity starts with — deliberately separate from
 * buildDefaultComponentsForType, which is also the fallback normalizeEntity
 * applies to every document ever saved.
 *
 * The two must not be merged. Turning a default on in the builder above would
 * switch that behaviour on retroactively for every existing space the moment
 * its document was next loaded; changing it here only affects things added from
 * now on. Anything a creator would expect "in the box" belongs here.
 */
export const buildCreationComponentsForType = (type = 'box') => {
    const base = buildDefaultComponentsForType(type)
    if (type === 'video') {
        // A video added to a space is expected to bring its sound with it,
        // placed in the room rather than playing flat at a constant volume.
        base.media = { ...base.media, spatial: true, muted: false }
    }
    return base
}

export const normalizeAsset = (asset = {}) => ({
    id: ensureString(asset.id, generateId('asset')),
    name: ensureString(asset.name, 'Untitled Asset'),
    mimeType: ensureString(asset.mimeType, 'application/octet-stream'),
    size: Math.max(0, ensureNumber(asset.size, 0)),
    createdAt: ensureNumber(asset.createdAt, Date.now()),
    url: ensureString(asset.url, ''),
    source: ensureString(asset.source, 'server')
})

const normalizeWindowState = (windowId, value = {}, fallback) => {
    const source = value && typeof value === 'object' ? value : {}
    return {
        ...fallback,
        ...cloneValue(source),
        id: windowId,
        title: ensureString(source.title, fallback.title),
        visible: ensureBoolean(source.visible, fallback.visible),
        minimized: ensureBoolean(source.minimized, fallback.minimized),
        pinned: ensureBoolean(source.pinned, fallback.pinned),
        x: ensureNumber(source.x, fallback.x),
        y: ensureNumber(source.y, fallback.y),
        width: Math.max(240, ensureNumber(source.width, fallback.width)),
        height: Math.max(180, ensureNumber(source.height, fallback.height)),
        zIndex: Math.max(1, ensureNumber(source.zIndex, fallback.zIndex))
    }
}

export const normalizeWindowLayout = (layout = {}) => {
    const source = layout && typeof layout === 'object' ? layout : {}
    const windows = {}
    WINDOW_IDS.forEach((windowId) => {
        windows[windowId] = normalizeWindowState(windowId, source.windows?.[windowId], defaultWindowLayout.windows[windowId])
    })
    const requestedActive = ensureString(source.activeWindowId, defaultWindowLayout.activeWindowId)
    return { activeWindowId: windows[requestedActive] ? requestedActive : defaultWindowLayout.activeWindowId, windows }
}

// Portal label fonts are chosen by name from a fixed set, never by URL — the
// renderer fetches whatever it is given and a document is untrusted input.
const LABEL_FONT_NAMES = ['default', 'helvetica']

// What shape a gateway portal draws. 'gateway' is the glowing ring every
// portal has drawn since the type existed. 'frame' is a square-cornered
// threshold — four thin bars, flat fill, no halo — the only door shape the
// brand's geometry rule allows (square corners only; never shadow, glow or
// bevel), which the ring made it impossible to build. Opt-in: anything
// authored without this field keeps the ring.
const PORTAL_STYLES = ['gateway', 'frame']

// components.link — a visitor's click follows this href (the live viewer,
// src/project/viewport/entityLink.js), and a document is untrusted input, so
// an unsafe scheme is refused here, where every write and every read passes.
// Browsers ignore tabs, newlines and leading control characters inside a
// scheme ("java\tscript:" runs), so those are stripped BEFORE the scheme is
// read. Only http(s) may carry a scheme; anything without one (a path, or a
// word being typed in the inspector) is kept and judged again at click time.
// Mirrored in shared/projectSchema.cjs (serverXR/src/schemaSync.test.js).
export const LINK_HREF_MAX_LENGTH = 2048
const LINK_SAFE_SCHEMES = new Set(['http', 'https'])
// eslint-disable-next-line no-control-regex
const LINK_IGNORED_CHARS = /[\u0000- \u007f]/g
export const sanitizeLinkHref = (value) => {
    if (typeof value !== 'string') return ''
    const href = value.trim()
    if (!href || href.length > LINK_HREF_MAX_LENGTH) return ''
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href.replace(LINK_IGNORED_CHARS, ''))
    if (scheme && !LINK_SAFE_SCHEMES.has(scheme[1].toLowerCase())) return ''
    return href
}

const TEXT_REVEAL_MODES = ['none', 'typewriter']

// A text entity's optional reveal. Absent (or 'none') means the text draws in
// full immediately, which is what every text entity authored before this did.
const normalizeTextReveal = (source) => {
    const mode = TEXT_REVEAL_MODES.includes(source?.mode) ? source.mode : 'none'
    if (mode === 'none') return { mode: 'none' }
    return {
        mode,
        speed: Math.min(400, Math.max(1, ensureNumber(source.speed, 28))),
        delay: Math.max(0, ensureNumber(source.delay, 0.4)),
        lineDelay: Math.max(0, ensureNumber(source.lineDelay, 0.35)),
        hold: Math.max(0, ensureNumber(source.hold, 3)),
        loop: ensureBoolean(source.loop, false)
    }
}

const TIMELINE_PROPERTIES = ['position', 'rotation', 'scale', 'opacity']
const TIMELINE_EASINGS = ['linear', 'ease']

const normalizeTimeline = (source) => {
    if (!source || typeof source !== 'object') return null
    const duration = Math.max(0.1, ensureNumber(source.duration, 5))
    const tracks = []
    ;(Array.isArray(source.tracks) ? source.tracks : []).forEach((track) => {
        if (!track || typeof track !== 'object') return
        const property = ensureString(track.property, '')
        if (!TIMELINE_PROPERTIES.includes(property)) return
        if (tracks.some((existing) => existing.property === property)) return
        const keys = (Array.isArray(track.keys) ? track.keys : [])
            .filter((key) => key && typeof key === 'object')
            .map((key) => {
                const easing = ensureString(key.easing, 'ease')
                return {
                    t: Math.min(duration, Math.max(0, ensureNumber(key.t, 0))),
                    value: property === 'opacity'
                        ? Math.min(1, Math.max(0, ensureNumber(key.value, 1)))
                        : ensureVector(key.value, property === 'scale' ? [1, 1, 1] : [0, 0, 0]),
                    easing: TIMELINE_EASINGS.includes(easing) ? easing : 'ease'
                }
            })
            .sort((a, b) => a.t - b.t)
        tracks.push({ property, keys })
    })
    return { duration, loop: ensureBoolean(source.loop, true), tracks }
}

// Who made this. `subject` is the session identity ('github:99', 'guest:abc')
// and is the only half worth comparing — `label` is a display name a person
// can change. Everything made before this field existed normalizes to null,
// and null means UNOWNED: never read it as yours, never as someone else's.
// It has to live in the normalizer or it does not exist: both normalizers
// return a literal, so an unlisted field is silently dropped on every op
// apply and every document load, leaving the op-log holding a value the
// rebuilt document does not have.
export const normalizeAuthor = (author) => {
    if (!author || typeof author !== 'object') return null
    const subject = ensureString(author.subject, '')
    if (!subject) return null
    return { subject, label: ensureString(author.label, '') }
}

export const normalizeFixtureIndex = (fixture) => {
    const index = Number(fixture?.index)
    return Number.isInteger(index) && index > 0 ? index : null
}

// A lamp ON THE RIG (docs/architecture/RIG_BUILD.md §2.2): the desk's index (the
// join, above) plus the plot's own patch — fixture type and mode, universe (1-based,
// as MVR and every crew count) and address, unit number along its position, circuit,
// position name, and whether it hangs. Every field is optional, but the component
// must name an index or a type or it is no fixture at all and is dropped. A field
// that is not well formed is left out rather than stored broken, so clearing one in
// the inspector (`{ address: null }`) removes just that field.
const fixtureText = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const fixtureInt = (value, min, max) => {
    const n = Number(value)
    return Number.isInteger(n) && n >= min && n <= max ? n : null
}
export const normalizeFixture = (fixture) => {
    if (!fixture || typeof fixture !== 'object') return null
    const out = {}
    const index = normalizeFixtureIndex(fixture)
    if (index != null) out.index = index
    const type = fixtureText(fixture.type, 64)
    if (type) out.type = type
    if (index == null && !type) return null
    const mode = fixtureText(fixture.mode, 32)
    if (mode) out.mode = mode
    const universe = fixtureInt(fixture.universe, 1, 63999)
    if (universe != null) out.universe = universe
    const address = fixtureInt(fixture.address, 1, 512)
    if (address != null) out.address = address
    const unit = fixtureInt(fixture.unit, 1, 9999)
    if (unit != null) out.unit = unit
    const circuit = fixtureText(fixture.circuit, 16)
    if (circuit) out.circuit = circuit
    const position = fixtureText(fixture.position, 64)
    if (position) out.position = position
    if (fixture.hung === true) out.hung = true
    // Kept off DMX by the owner (run by hand: hazers, smoke): never patched (rigbuild/autoPatch.js).
    if (fixture.dmx === false) out.dmx = false
    return out
}

// A VENUE PLAN (RIG_BUILD.md §10): the room's architecture from above — walls,
// column grid, zones, what stands on the floor and what hangs over it — derived by
// src/rigbuild/venuePlan.js from the hall the model was built from, and drawn by
// the plot. Numbers only, bounded: a plan that is not well formed is dropped, and
// every list is capped so a document cannot carry an unbounded drawing.
const VENUE_PLAN_CAP = 2000
const planNum = (value) => {
  const n = Number(value)
  return Number.isFinite(n) && Math.abs(n) <= 1e5 ? Math.round(n * 1000) / 1000 : null
}
const planNums = (list, length) => {
  if (!Array.isArray(list) || list.length !== length) return null
  const out = list.map(planNum)
  return out.every((n) => n != null) ? out : null
}
const planText = (value, max = 120) => (typeof value === 'string' ? value.trim().slice(0, max) : '')
const planList = (list, each) => (Array.isArray(list) ? list.slice(0, VENUE_PLAN_CAP).map(each).filter(Boolean) : [])
export const normalizeVenuePlan = (plan) => {
  if (!plan || typeof plan !== 'object') return null
  const outline = planList(plan.outline, (p) => planNums(p, 2))
  if (outline.length < 3) return null
  const out = {
    name: planText(plan.name),
    source: planText(plan.source, 240),
    warning: planText(plan.warning, 240),
    outline,
    columns: planList(plan.columns, (c) => planNums(c, 4)),
    grid: {
      x: planList(plan.grid?.x, (g) => (planNum(g?.at) != null ? { at: planNum(g.at), label: planText(g.label, 8) } : null)),
      z: planList(plan.grid?.z, (g) => (planNum(g?.at) != null ? { at: planNum(g.at), label: planText(g.label, 8) } : null))
    },
    zones: planList(plan.zones, (z) => {
      const rects = planList(z?.rects, (r) => planNums(r, 4))
      return rects.length ? { id: planText(z.id, 32), label: planText(z.label), rects, note: planText(z.note, 240) } : null
    }),
    solids: planList(plan.solids, (s) => {
      const r = planNums(s?.rect, 4)
      return r ? { id: planText(s.id, 32), label: planText(s.label), rect: r, top: planNum(s.top) ?? 0 } : null
    }),
    overhead: planList(plan.overhead, (o) => {
      const r = planNums(o?.rect, 4)
      const line = Array.isArray(o?.line) && o.line.length === 2 ? o.line.map((p) => planNums(p, 2)) : null
      const lineOk = line && line.every(Boolean)
      if (!r && !lineOk) return null
      return { id: planText(o.id, 32), label: planText(o.label), ...(r ? { rect: r } : { line }), bottom: planNum(o.bottom) ?? 0 }
    }),
    openings: planList(plan.openings, (o) => {
      const from = planNums(o?.from, 2)
      const to = planNums(o?.to, 2)
      return from && to ? { id: planText(o.id, 32), label: planText(o.label), from, to } : null
    })
  }
  const north = planNums(plan.north, 2)
  if (north) out.north = north
  return out
}

// A RENTAL LIST — since 2026-09-28 the show's EQUIPMENT LIST (RIG_BUILD.md §11, §13):
// what the show takes, in what quantity, from where. The cards of view C count
// "placed n / ordered m" against it, the plot says "3 left of 12", the hotbar of view A
// stops at the order, and /{space}/equipment/{project} edits it. First written by
// scripts/rigbuild/rental.mjs from the rental house's own spreadsheet and the show's
// order, with where each number came from; lines are then added, deleted and changed
// by hand, each keeping its source. Bounded like the venue plan.
//
// A line: {code, type, ordered, stock?, rate?, label?, source?, note?} as before, plus
//   kind: 'item'           a non-DMX item (node, splitter, cable, truss, deck) — counted
//                          and costed, never hung or patched (omitted = a fixture)
//   from: 'own' | 'other'  where it comes from (omitted = the rental house)
//   supplier, category, watts, piece (a rig piece kind the line counts, e.g. truss-2m)
// The list: {name, source, writtenAt, currency, items} as before, plus
//   days, dates {from, to}  the billed rental days
//   rule {extraDay, source} the quote's own day rule (day 1 full, each further day × extraDay)
//   types[]                 fixture types added for this show (Open Fixture Library, or a
//                           rental code with its mode owed), each with its provenance
//   catalogue[], terms[]    the rental house's whole price list and its terms, with cells
const RENTAL_CAP = 200
const RENTAL_TYPES_CAP = 32
const RENTAL_MODES_CAP = 24
const rentalCount = (value) => {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : null
}
const rentalSlug = (value, max = 40) => (typeof value === 'string' && new RegExp(`^[a-z0-9][a-z0-9._-]{0,${max - 1}}$`).test(value.trim()) ? value.trim() : '')
const rentalDate = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : '')
const rentalSourced = (spec, length = 0) => {
  if (!spec || typeof spec !== 'object') return null
  const value = length ? planNums(spec.value, length) : planNum(spec.value)
  if (value == null || (!length && value < 0)) return null
  const out = { value }
  for (const k of ['src', 'basis', 'order', 'note']) {
    const t = planText(spec[k], k === 'note' || k === 'order' ? 120 : 40)
    if (t) out[k] = t
  }
  return out
}
const normalizeRentalType = (type) => {
  const id = rentalSlug(type?.id)
  const code = planText(type?.code, 40)
  if (!id || !code) return null
  const modes = planList(type.modes, (mode) => {
    const name = planText(mode?.name, 32)
    const footprint = Number(mode?.footprint)
    if (!name || !Number.isInteger(footprint) || footprint < 1 || footprint > 512) return null
    let channels = null
    if (Array.isArray(mode.channels) && mode.channels.length === footprint) {
      channels = mode.channels.map((c) => {
        const role = typeof c?.role === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(c.role) ? c.role : ''
        return role ? { role, label: planText(c.label, 40) } : null
      })
      if (!channels.every(Boolean)) channels = null
    }
    return { name, footprint, channels }
  }).slice(0, RENTAL_MODES_CAP)
  const out = {
    id,
    code,
    maker: planText(type.maker, 80) || null,
    model: planText(type.model, 80) || null,
    identified: planText(type.identified, 16) || 'OWED',
    category: rentalSlug(type.category, 24) || 'other',
    modes,
    defaultMode: modes.some((m) => m.name === type.defaultMode) ? type.defaultMode : (modes[0]?.name || null),
    modesOwed: modes.length === 0
  }
  const power = rentalSourced(type.power_w)
  if (power) out.power_w = power
  const weight = rentalSourced(type.weight_kg)
  if (weight) out.weight_kg = weight
  const size = rentalSourced(type.size_mm, 3)
  if (size) out.size_mm = size
  const sources = {}
  for (const [key, s] of Object.entries(type.sources || {}).slice(0, 8)) {
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(key) || !s || typeof s !== 'object') continue
    const src = { url: planText(s.url, 300), what: planText(s.what, 160) }
    const licence = planText(s.licence, 80)
    if (licence) src.licence = licence
    const accessed = planText(s.accessed, 32)
    if (accessed) src.accessed = accessed
    if (src.url || src.what) sources[key] = src
  }
  out.sources = sources
  if (type.ofl && typeof type.ofl === 'object') {
    const manufacturer = rentalSlug(type.ofl.manufacturer, 80)
    const key = rentalSlug(type.ofl.key, 80)
    if (manufacturer && key) out.ofl = { manufacturer, key, lastModifyDate: planText(type.ofl.lastModifyDate, 32), fetchedAt: planText(type.ofl.fetchedAt, 32) }
  }
  const note = planText(type.note, 240)
  if (note) out.note = note
  return out
}
export const normalizeRentalList = (list) => {
  if (!list || typeof list !== 'object') return null
  const items = planList(list.items, (item) => {
    const code = planText(item?.code, 40)
    const ordered = rentalCount(item?.ordered)
    if (!code || ordered == null) return null
    const out = { code, type: planText(item.type, 40) || code.toLowerCase().replace(/\s+/g, '-'), ordered }
    if (item.kind === 'item') out.kind = 'item'
    const stock = rentalCount(item.stock)
    if (stock != null) out.stock = stock
    const rate = planNum(item.rate)
    if (rate != null && rate >= 0) out.rate = rate
    const label = planText(item.label, 120)
    if (label) out.label = label
    const source = planText(item.source, 240)
    if (source) out.source = source
    const note = planText(item.note, 240)
    if (note) out.note = note
    if (item.from === 'own' || item.from === 'other') out.from = item.from
    const supplier = planText(item.supplier, 80)
    if (supplier) out.supplier = supplier
    const category = rentalSlug(item.category, 24)
    if (category) out.category = category
    const watts = planNum(item.watts)
    if (watts != null && watts >= 0) out.watts = watts
    const piece = rentalSlug(item.piece, 24)
    if (piece) out.piece = piece
    return out
  }).slice(0, RENTAL_CAP)
  const name = planText(list.name)
  // A list someone emptied is still a list (the hand takes nothing from it); a list
  // with no line and no name was never one.
  if (!items.length && !name) return null
  const out = {
    name,
    source: planText(list.source, 480),
    writtenAt: planText(list.writtenAt, 32),
    currency: planText(list.currency, 8),
    items
  }
  const days = Number(list.days)
  if (Number.isInteger(days) && days >= 1 && days <= 366) out.days = days
  const from = rentalDate(list.dates?.from)
  const to = rentalDate(list.dates?.to)
  if (from || to) out.dates = { from, to }
  const extraDay = planNum(list.rule?.extraDay)
  if (extraDay != null && extraDay >= 0 && extraDay <= 1) out.rule = { extraDay, source: planText(list.rule.source, 240) }
  const types = planList(list.types, normalizeRentalType).slice(0, RENTAL_TYPES_CAP)
  if (types.length) out.types = types
  const catalogue = planList(list.catalogue, (c) => {
    const code = planText(c?.code, 40)
    if (!code) return null
    const entry = { code, label: planText(c.label, 120), details: planText(c.details, 120), category: planText(c.category, 40), cells: planText(c.cells, 40) }
    const stock = rentalCount(c.stock)
    if (stock != null) entry.stock = stock
    const rate = planNum(c.rate)
    if (rate != null && rate >= 0) entry.rate = rate
    return entry
  }).slice(0, RENTAL_CAP)
  if (catalogue.length) out.catalogue = catalogue
  const terms = planList(list.terms, (t) => (planText(t?.text, 240) ? { text: planText(t.text, 240), cell: planText(t.cell, 40) } : null)).slice(0, 20)
  if (terms.length) out.terms = terms
  return out
}

// A RIG VERSION (RIG_BUILD.md §15): this project is one of several versions of one show's
// rig in the same hall, each a project of its own. `siblings` is the set, in order, so the
// space view can offer a switch between them. Short words and ids only; a version with no
// id, or a set that does not list it, is dropped.
const RIG_VERSIONS_CAP = 32
const variantId = (value) => (typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(value.trim()) ? value.trim() : '')
export const normalizeRigVariant = (value) => {
  if (!value || typeof value !== 'object') return null
  const id = variantId(value.id)
  const set = variantId(value.set)
  if (!id || !set) return null
  const siblings = (Array.isArray(value.siblings) ? value.siblings : []).slice(0, RIG_VERSIONS_CAP).map((s) => {
    const sid = variantId(s?.id)
    const projectId = variantId(s?.projectId)
    return sid && projectId ? { id: sid, projectId, title: planText(s.title, 60) || sid, summary: planText(s.summary, 160) } : null
  }).filter(Boolean)
  if (!siblings.some((s) => s.id === id)) return null
  // A labelled COPY of a version (copy-version.mjs, RIG_BUILD.md §15.11) says what it is a copy of, so
  // the switch keeps it apart from the live versions; kept through every normalisation pass.
  const copyId = variantId(value.copyOf?.projectId)
  const copyOf = copyId ? { projectId: copyId, id: variantId(value.copyOf.id), label: planText(value.copyOf.label, 60) } : null
  return { set, id, title: planText(value.title, 60) || id, summary: planText(value.summary, 160), source: planText(value.source, 480), siblings, ...(copyOf ? { copyOf } : {}) }
}

// THE RIG'S DESIGNED LOOKS (RIG_BUILD.md §11.4, view C): per look, a rule and its
// numbers per group of lamps (a group is `${position}/${type}`), and a colour per
// group. Written by scripts/rigbuild/looks.mjs from the rig file; the cards put them on
// the desk and the cue list, the room poses by them. Bounded, numbers and short words.
const RIG_LOOKS_CAP = 50
const RIG_GROUPS_CAP = 100
const lookKey = (value) => (typeof value === 'string' && /^[\w:.-]{1,40}\/[\w.-]{1,40}$/.test(value.trim()) ? value.trim() : '')
const lookHex = (value) => (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim().toLowerCase() : '')
export const normalizeRigLooks = (value) => {
  if (!value || typeof value !== 'object') return null
  const looks = planList(value.looks, (look) => {
    const id = typeof look?.id === 'string' && /^[a-z0-9][a-z0-9-]{0,35}$/.test(look.id.trim()) ? look.id.trim() : ''
    if (!id) return null
    const aims = {}
    for (const [k, aim] of Object.entries(look.aims || {}).slice(0, RIG_GROUPS_CAP)) {
      const key = lookKey(k)
      const rule = planText(aim?.rule, 32)
      if (!key || !rule) continue
      const params = { rule }
      for (const [p, n] of Object.entries(aim)) {
        if (p === 'rule' || !/^[a-z_]{1,16}$/.test(p)) continue
        const num = planNum(n)
        if (num != null) params[p] = num
      }
      aims[key] = params
    }
    const colours = {}
    for (const [k, c] of Object.entries(look.colours || {}).slice(0, RIG_GROUPS_CAP)) {
      const key = lookKey(k)
      const hex = lookHex(c)
      if (key && hex) colours[key] = hex
    }
    // A group's level in the look, 0..1 (RIG_BUILD.md §15: 0 = out, the look's darkness).
    // Absent = full; the field is written only when a look names one, so a look from
    // before it is unchanged.
    const levels = {}
    for (const [k, v] of Object.entries(look.levels || {}).slice(0, RIG_GROUPS_CAP)) {
      const key = lookKey(k)
      const n = planNum(v)
      if (key && n != null) levels[key] = Math.min(1, Math.max(0, n))
    }
    return { id, title: planText(look.title, 60) || id, intent: planText(look.intent, 480), aims, colours, ...(Object.keys(levels).length ? { levels } : {}) }
  }).slice(0, RIG_LOOKS_CAP)
  if (!looks.length) return null
  return { source: planText(value.source, 480), writtenAt: planText(value.writtenAt, 32), defaultLook: planText(value.defaultLook, 36), looks }
}

export const normalizeEntity = (entity = {}) => {
    const rawType = ensureString(entity.type, 'box')
    const type = ENTITY_TYPE_SET.has(rawType) ? rawType : 'box'
    const defaultComponents = buildDefaultComponentsForType(type)
    const sourceComponents = entity.components && typeof entity.components === 'object' ? cloneValue(entity.components) : {}
    const transformSource = sourceComponents.transform || {}
    const appearanceSource = sourceComponents.appearance || {}
    const nextComponents = {
        ...defaultComponents,
        ...sourceComponents,
        transform: {
            ...defaultComponents.transform,
            ...transformSource,
            position: ensureVector(transformSource.position, defaultComponents.transform.position),
            rotation: ensureVector(transformSource.rotation, defaultComponents.transform.rotation),
            scale: ensureVector(transformSource.scale, defaultComponents.transform.scale)
        }
    }
    if (defaultComponents.appearance) {
        nextComponents.appearance = {
            ...defaultComponents.appearance,
            ...appearanceSource,
            color: ensureString(appearanceSource.color, defaultComponents.appearance.color),
            opacity: Math.min(1, Math.max(0, ensureNumber(appearanceSource.opacity, defaultComponents.appearance.opacity)))
        }
    } else {
        delete nextComponents.appearance
    }
    if (nextComponents.primitive?.size) {
        nextComponents.primitive.size = ensureVector(nextComponents.primitive.size, [1, 1, 1])
    }
    if (nextComponents.text) {
        nextComponents.text = {
            ...defaultComponents.text,
            ...nextComponents.text,
            value: typeof nextComponents.text.value === 'string' ? nextComponents.text.value : defaultComponents.text.value,
            variant: ensureString(nextComponents.text.variant, defaultComponents.text.variant || '2d'),
            billboard: ensureBoolean(nextComponents.text.billboard, defaultComponents.text?.billboard ?? false),
            reveal: normalizeTextReveal(nextComponents.text.reveal)
        }
    }
    if (nextComponents.media) {
        nextComponents.media = {
            ...defaultComponents.media,
            ...nextComponents.media,
            assetId: nextComponents.media.assetId || null
        }
        // Spatial-sound fields only exist where the defaults introduced them, so
        // an image or model's media object is left exactly as it was.
        if ('spatial' in (defaultComponents.media || {})) {
            const media = nextComponents.media
            media.spatial = ensureBoolean(media.spatial, defaultComponents.media.spatial ?? false)
            // A zero or negative reference distance makes the panner divide by
            // zero and the sound never attenuates.
            media.distance = Math.max(0.1, ensureNumber(media.distance, defaultComponents.media.distance ?? 6))
            media.maxDistance = Math.max(media.distance, ensureNumber(media.maxDistance, defaultComponents.media.maxDistance ?? 40))
        }
    }
    if (sourceComponents.link || defaultComponents.link) {
        nextComponents.link = {
            enabled: ensureBoolean(sourceComponents.link?.enabled, defaultComponents.link?.enabled || false),
            href: sanitizeLinkHref(ensureString(sourceComponents.link?.href, defaultComponents.link?.href || '')),
            // What the hover nameplate says; empty = the host or the path.
            label: ensureString(sourceComponents.link?.label, defaultComponents.link?.label || '').slice(0, 120)
        }
    }
    if (sourceComponents.reference || defaultComponents.reference) {
        const refSource = sourceComponents.reference || {}
        const refDefault = defaultComponents.reference || {}
        const refMode = ensureString(refSource.mode, refDefault.mode || 'portal')
        nextComponents.reference = {
            spaceId: ensureString(refSource.spaceId, refDefault.spaceId || ''),
            projectId: ensureString(refSource.projectId, refDefault.projectId || ''),
            mode: ['embed', 'portal'].includes(refMode) ? refMode : 'portal',
            label: ensureString(refSource.label, refDefault.label || ''),
            // Label styling. Defaults reproduce the original look exactly (white
            // type on a dark plate, renderer's built-in font), so a portal
            // authored before these existed is untouched.
            labelColor: ensureString(refSource.labelColor, refDefault.labelColor || '#ffffff'),
            labelPlate: ensureBoolean(refSource.labelPlate, refDefault.labelPlate ?? true),
            labelFont: LABEL_FONT_NAMES.includes(refSource.labelFont) ? refSource.labelFont : 'default',
            // Door shape. 'gateway' reproduces the ring exactly, so an
            // unknown or absent value leaves an existing portal untouched.
            style: PORTAL_STYLES.includes(refSource.style) ? refSource.style : 'gateway'
        }
    }
    if (sourceComponents.runtime || defaultComponents.runtime) {
        nextComponents.runtime = {
            visible: ensureBoolean(sourceComponents.runtime?.visible, defaultComponents.runtime?.visible ?? true),
            locked: ensureBoolean(sourceComponents.runtime?.locked, defaultComponents.runtime?.locked ?? false)
        }
    }
    if (sourceComponents.animation) {
        const animMode = ensureString(sourceComponents.animation.mode, 'static')
        nextComponents.animation = {
            mode: ['static', 'bob', 'spin', 'float', 'sway', 'orbit'].includes(animMode) ? animMode : 'static',
            speed: ensureNumber(sourceComponents.animation.speed, 1),
            amplitude: ensureNumber(sourceComponents.animation.amplitude, 1)
        }
    }
    // Comes up as a visitor approaches: a light's intensity, and an emissive or
    // translucent surface standing in for one, scale with how close they are.
    // Absent means "always on", so nothing authored before this is touched.
    if (sourceComponents.proximity) {
        const radius = ensureNumber(sourceComponents.proximity.radius, 4)
        const falloff = ensureNumber(sourceComponents.proximity.falloff, 2)
        const min = ensureNumber(sourceComponents.proximity.min, 0)
        nextComponents.proximity = {
            radius: Math.max(0.1, radius),
            falloff: Math.max(0.05, falloff),
            min: Math.min(1, Math.max(0, min))
        }
    }
    // THE BEAM IN THE AIR: the visible cone of a spot light's throw. Absent in
    // every room published before this existed, and absent MUST keep meaning no
    // beam -- a cone switched on by a normaliser would change the look of every
    // lit space at once. `haze` is how thick the air is, 0..1; the renderer
    // reads an absent haze as 0.4 (src/objectComponents/spotBeam.js).
    // `only` (2026-09-27): draw the cone, cast NO light. A real rig is 90 lamps
    // and a browser cannot run 90 real spot lights (every one is a term in every
    // lit pixel's shader, and phones refuse to compile past ~16); a lamp marked
    // `only` keeps its beam in the air and leaves the room unlit by it, so a rig
    // can be hung whole and a budget of real lamps chosen. Stored only when
    // true, so every beam saved before this reads back exactly as it was.
    if (sourceComponents.beam) {
        nextComponents.beam = {
            visible: ensureBoolean(sourceComponents.beam.visible, false),
            haze: Math.min(1, Math.max(0, ensureNumber(sourceComponents.beam.haze, 0.4))),
            ...(sourceComponents.beam.only === true ? { only: true } : {}),
            // `aperture` (2026-09-29): the lens's radius in metres — a beam leaves the
            // lamp already that wide (beamAir.js). Stored only when given.
            ...(ensureNumber(sourceComponents.beam.aperture, 0) > 0 ? { aperture: Math.min(2, ensureNumber(sourceComponents.beam.aperture, 0)) } : {})
        }
    }
    // THE JOIN between a lamp in the room and a lamp on the lighting desk: the
    // fixture's `index` on the desk (the number a person sees there, `3.Back left`),
    // and since 2026-09-28 the plot's patch beside it (normalizeFixture, above) — the
    // record handed to a crew, the way an MVR Fixture carries its addresses. The desk's
    // show.json still holds the RUNNING patch and allocates; auto-patch keeps the two
    // equal (docs/architecture/RIG_BUILD.md §2.2, §4). A component with neither an
    // index nor a type is no fixture and is dropped rather than stored broken.
    const fixture = normalizeFixture(sourceComponents.fixture)
    if (fixture) nextComponents.fixture = fixture
    else delete nextComponents.fixture
    // A BUILD PIECE (truss, tower, stage deck): which record in the piece catalogue
    // this entity is (src/rigbuild/pieces.js; RIG_BUILD.md §2.3). A name and nothing
    // else — the size and the snap points live in the catalogue. An empty kind is no
    // piece, and the component is dropped.
    if (sourceComponents.piece) {
        const kind = typeof sourceComponents.piece.kind === 'string' ? sourceComponents.piece.kind.trim().slice(0, 32) : ''
        if (kind) nextComponents.piece = { kind }
        else delete nextComponents.piece
    }
    // The venue's plan (normalizeVenuePlan, above), on the entity that is the venue.
    if (sourceComponents.venuePlan) {
        const plan = normalizeVenuePlan(sourceComponents.venuePlan)
        if (plan) nextComponents.venuePlan = plan
        else delete nextComponents.venuePlan
    }
    // The show's rental list (normalizeRentalList, above) — view C's cards.
    if (sourceComponents.rentalList) {
        const list = normalizeRentalList(sourceComponents.rentalList)
        if (list) nextComponents.rentalList = list
        else delete nextComponents.rentalList
    }
    // The rig's designed looks (normalizeRigLooks, above) — view C's cue list.
    if (sourceComponents.rigLooks) {
        const looks = normalizeRigLooks(sourceComponents.rigLooks)
        if (looks) nextComponents.rigLooks = looks
        else delete nextComponents.rigLooks
    }
    // Which rig version this project is, and its siblings (normalizeRigVariant, above).
    if (sourceComponents.rigVariant) {
        const variant = normalizeRigVariant(sourceComponents.rigVariant)
        if (variant) nextComponents.rigVariant = variant
        else delete nextComponents.rigVariant
    }
    // A screen: a plane that shows one of the project's own mapping surfaces
    // (document.mappingState.surfaces) as its picture. The join is the surface's
    // id and nothing else -- the surface keeps its kind, file and resolution, so
    // the screen follows whatever the Projection tool later puts on it. An empty
    // or missing id means "no screen", and the component is dropped rather than
    // kept as a husk, so an entity authored before this is byte-identical.
    if (sourceComponents.surface) {
        const surfaceId = ensureString(sourceComponents.surface.surfaceId, '')
        if (surfaceId) nextComponents.surface = { surfaceId }
        else delete nextComponents.surface
    }
    if (sourceComponents.timeline) {
        const timeline = normalizeTimeline(sourceComponents.timeline)
        if (timeline) nextComponents.timeline = timeline
        else delete nextComponents.timeline
    }

    return {
        id: ensureString(entity.id, generateId('entity')),
        type,
        name: ensureString(entity.name, `${type[0].toUpperCase()}${type.slice(1)} Entity`),
        parentId: ensureString(entity.parentId, '') || null,
        createdBy: normalizeAuthor(entity.createdBy),
        components: nextComponents
    }
}

// A walkable region list is either absent (null -- unconfined, the legacy
// behaviour every existing space relies on) or a list of well-formed rectangles.
// A malformed or empty list normalizes back to null rather than to "nowhere is
// walkable", so bad data can never trap a visitor where they cannot move.
const normalizeWalkableAreas = (areas) => {
    if (!Array.isArray(areas)) return null
    const rects = []
    for (const area of areas) {
        if (!area || typeof area !== 'object') continue
        const minX = Math.min(ensureNumber(area.minX, 0), ensureNumber(area.maxX, 0))
        const maxX = Math.max(ensureNumber(area.minX, 0), ensureNumber(area.maxX, 0))
        const minZ = Math.min(ensureNumber(area.minZ, 0), ensureNumber(area.maxZ, 0))
        const maxZ = Math.max(ensureNumber(area.minZ, 0), ensureNumber(area.maxZ, 0))
        if (maxX - minX < 0.01 || maxZ - minZ < 0.01) continue
        rects.push({ minX, maxX, minZ, maxZ })
    }
    return rects.length ? rects : null
}

const normalizeWorldState = (world = {}) => {
    const source = world && typeof world === 'object' ? world : {}
    return {
        ...cloneValue(defaultWorldState),
        ...cloneValue(source),
        backgroundColor: ensureString(source.backgroundColor, defaultWorldState.backgroundColor),
        atmosphereBlend: ensureBoolean(source.atmosphereBlend, defaultWorldState.atmosphereBlend),
        hubDecor: ensureBoolean(source.hubDecor, defaultWorldState.hubDecor),
        spawn: source.spawn && typeof source.spawn === 'object' ? {
            x: ensureNumber(source.spawn.x, 0),
            z: ensureNumber(source.spawn.z, 0),
            yaw: ensureNumber(source.spawn.yaw, 0),
            pitch: ensureNumber(source.spawn.pitch, 0),
            altY: ensureNumber(source.spawn.altY, 1.6)
        } : null,
        walkableAreas: normalizeWalkableAreas(source.walkableAreas),
        placement: normalizePlacement(source.placement),
        // Walk-mode atmosphere: null keeps the built-in close fog (8..50m); an
        // authored object opens the distance for VAST scenes — the walker's
        // camera far plane follows it (LiveProjectScene), so a 150m composition
        // is invisible without this and fully present with it — and can recolour
        // or switch the fog off. Colour matters because fog was previously locked
        // to the background, which is an invisible fog on a light ground: a white
        // room simply ended at 50m.
        fog: source.fog && typeof source.fog === 'object' ? {
            near: Math.max(0, ensureNumber(source.fog.near, 8)),
            far: Math.max(1, ensureNumber(source.fog.far, 50)),
            color: source.fog.color ? ensureString(source.fog.color, defaultWorldState.backgroundColor) : null,
            enabled: ensureBoolean(source.fog.enabled, true)
        } : null,
        gridVisible: ensureBoolean(source.gridVisible, defaultWorldState.gridVisible),
        gridSize: Math.max(1, ensureNumber(source.gridSize, defaultWorldState.gridSize)),
        gridCellSize: Math.max(0.05, ensureNumber(source.gridCellSize, defaultWorldState.gridCellSize)),
        gridCellThickness: Math.max(0, ensureNumber(source.gridCellThickness, defaultWorldState.gridCellThickness)),
        gridCellColor: ensureString(source.gridCellColor, defaultWorldState.gridCellColor),
        gridSectionSize: Math.max(0.5, ensureNumber(source.gridSectionSize, defaultWorldState.gridSectionSize)),
        gridSectionThickness: Math.max(0, ensureNumber(source.gridSectionThickness, defaultWorldState.gridSectionThickness)),
        gridSectionColor: ensureString(source.gridSectionColor, defaultWorldState.gridSectionColor),
        gridFadeDistance: Math.max(0, ensureNumber(source.gridFadeDistance, defaultWorldState.gridFadeDistance)),
        gridFadeStrength: Math.max(0, ensureNumber(source.gridFadeStrength, defaultWorldState.gridFadeStrength)),
        gridOffset: ensureNumber(source.gridOffset, defaultWorldState.gridOffset),
        ambientLight: {
            color: ensureString(source.ambientLight?.color, defaultWorldState.ambientLight.color),
            intensity: ensureNumber(source.ambientLight?.intensity, defaultWorldState.ambientLight.intensity)
        },
        directionalLight: {
            color: ensureString(source.directionalLight?.color, defaultWorldState.directionalLight.color),
            intensity: ensureNumber(source.directionalLight?.intensity, defaultWorldState.directionalLight.intensity),
            position: ensureVector(source.directionalLight?.position, defaultWorldState.directionalLight.position)
        },
        savedView: {
            mode: ensureString(source.savedView?.mode, defaultWorldState.savedView.mode),
            position: ensureVector(source.savedView?.position, defaultWorldState.savedView.position),
            target: ensureVector(source.savedView?.target, defaultWorldState.savedView.target),
            fov: ensureNumber(source.savedView?.fov, defaultWorldState.savedView.fov),
            zoom: ensureNumber(source.savedView?.zoom, defaultWorldState.savedView.zoom),
            near: ensureNumber(source.savedView?.near, defaultWorldState.savedView.near),
            far: ensureNumber(source.savedView?.far, defaultWorldState.savedView.far)
        }
    }
}

const RENDER_TONE_MAPPINGS = new Set(['ACESFilmic', 'AgX', 'Neutral', 'none'])

// THE ROOM'S AIR (2026-09-29, docs/architecture/RIG_BUILD.md §20): a uniform haze the
// beams scatter in — `scattering` σs in 1/m, `anisotropy` the Henyey–Greenstein g.
// Present, the renderer draws every visible beam physically (src/objectComponents/
// beamAir.js); absent — every room made before it — the old flat cones. Stored only
// when it holds a haze, so a document without one reads back byte for byte.
// THE HAZE WORKED OUT FROM THE ROOM'S MACHINES (2026-10-01, src/objectComponents/
// hazeField.js): the hall (volume, air changes an hour), each hazer's or fog machine's
// level as it is run by hand (by entity id, or per kind), minutes since they were
// switched on (absent: steady state), and how uneven and how drifting the haze is.
// Plain numbers, clamped; anything else is dropped.
const HAZE_LEVEL_KINDS = new Set(['hazer', 'smoke-machine'])
const unitLevel = (value) => {
    const n = Number(value)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null
}
const normalizeHaze = (haze) => {
    if (!haze || typeof haze !== 'object' || Array.isArray(haze)) return null
    const out = {}
    const volume = Number(haze.volume_m3)
    if (volume > 0) out.volume_m3 = Math.min(volume, 1e7)
    const ach = Number(haze.airChangesPerHour)
    if (ach > 0) out.airChangesPerHour = Math.min(ach, 120)
    if (haze.levels && typeof haze.levels === 'object' && !Array.isArray(haze.levels)) {
        const levels = {}
        for (const [id, value] of Object.entries(haze.levels)) {
            const level = unitLevel(value)
            if (level != null && typeof id === 'string' && id.length <= 200) levels[id] = level
        }
        out.levels = levels
    }
    if (haze.kindLevels && typeof haze.kindLevels === 'object' && !Array.isArray(haze.kindLevels)) {
        const kindLevels = {}
        for (const [kind, value] of Object.entries(haze.kindLevels)) {
            const level = unitLevel(value)
            if (level != null && HAZE_LEVEL_KINDS.has(kind)) kindLevels[kind] = level
        }
        out.kindLevels = kindLevels
    }
    const minutes = Number(haze.minutes)
    if (haze.minutes != null && Number.isFinite(minutes) && minutes >= 0) out.minutes = minutes
    const patchiness = unitLevel(haze.patchiness)
    if (patchiness != null) out.patchiness = patchiness
    if (Array.isArray(haze.drift) && haze.drift.length === 3 && haze.drift.every((v) => Number.isFinite(Number(v)))) {
        out.drift = haze.drift.map((v) => Math.min(5, Math.max(-5, Number(v))))
    }
    return out
}

const normalizeAtmosphere = (atmosphere) => {
    if (!atmosphere || typeof atmosphere !== 'object') return null
    const scattering = Number(atmosphere.scattering)
    const haze = normalizeHaze(atmosphere.haze)
    if (!(scattering > 0) && !haze) return null
    const anisotropy = Number(atmosphere.anisotropy)
    return {
        // a room whose haze comes from its machines may leave scattering out: 0.03 is only
        // what a beam draws with before the machines have arrived (beamAir.js atmosphereOf)
        scattering: scattering > 0 ? Math.min(1, scattering) : 0.03,
        anisotropy: Number.isFinite(anisotropy) ? Math.min(0.95, Math.max(-0.95, anisotropy)) : 0.7,
        ...(haze ? { haze } : {})
    }
}

// SHADOWS FROM THE ROOM. Deliberately not the older `shadows` field, which is
// the renderer-level switch (gl.shadowMap.enabled) and has defaulted to true
// since this schema was written -- nothing ever cast into that map, so it was on
// and every stage was flat. This one says the lamps and the things in the room
// actually join the shadow pass, and it is OFF unless a room asks: a shadow pass
// over a scanned venue is not free, and no published space asked for one.
const SHADOW_MAP_SIZES = [1024, 2048]

const normalizeShadowCasting = (casting) => {
    const source = casting && typeof casting === 'object' ? casting : {}
    const mapSize = Number(source.mapSize)
    return {
        enabled: ensureBoolean(source.enabled, defaultRenderSettings.shadowCasting.enabled),
        mapSize: SHADOW_MAP_SIZES.includes(mapSize) ? mapSize : defaultRenderSettings.shadowCasting.mapSize
    }
}

const normalizeRenderSettings = (settings = {}) => {
    const source = settings && typeof settings === 'object' ? settings : {}
    const atmosphere = normalizeAtmosphere(source.atmosphere)
    const { atmosphere: _unchecked, ...rest } = source
    return {
        ...cloneValue(defaultRenderSettings),
        ...cloneValue(rest),
        shadows: ensureBoolean(source.shadows, defaultRenderSettings.shadows),
        antialias: ensureBoolean(source.antialias, defaultRenderSettings.antialias),
        toneMapping: RENDER_TONE_MAPPINGS.has(source.toneMapping) ? source.toneMapping : defaultRenderSettings.toneMapping,
        toneMappingExposure: Math.max(0, ensureNumber(source.toneMappingExposure, defaultRenderSettings.toneMappingExposure)),
        dprMin: Math.max(0.5, ensureNumber(source.dprMin, defaultRenderSettings.dprMin)),
        dprMax: Math.max(0.5, ensureNumber(source.dprMax, defaultRenderSettings.dprMax)),
        shadowCasting: normalizeShadowCasting(source.shadowCasting),
        ...(atmosphere ? { atmosphere } : {})
    }
}

const normalizeXrState = (xr = {}) => {
    const source = xr && typeof xr === 'object' ? xr : {}
    return {
        ...cloneValue(defaultXrState),
        ...cloneValue(source),
        mode: ensureString(source.mode, defaultXrState.mode),
        debugVisible: ensureBoolean(source.debugVisible, defaultXrState.debugVisible),
        vrSupported: ensureBoolean(source.vrSupported, defaultXrState.vrSupported),
        arSupported: ensureBoolean(source.arSupported, defaultXrState.arSupported)
    }
}

const normalizePresentationFixedCamera = (camera = {}, worldState = defaultWorldState) => {
    const source = camera && typeof camera === 'object' ? camera : {}
    const worldView = worldState?.savedView || defaultWorldState.savedView
    const projection = ensureString(source.projection, defaultPresentationFixedCamera.projection)
    const near = Math.max(0.001, ensureNumber(source.near, defaultPresentationFixedCamera.near))
    const rawFar = Math.max(0.01, ensureNumber(source.far, defaultPresentationFixedCamera.far))
    // far must exceed near or the camera frustum is degenerate/inverted and
    // renders blank — mirrors sceneSchema.js's normalizeFixedCamera guard.
    const far = rawFar > near ? rawFar : Math.max(defaultPresentationFixedCamera.far, near + 1)
    return {
        ...cloneValue(defaultPresentationFixedCamera),
        ...cloneValue(source),
        projection: ['perspective', 'orthographic'].includes(projection) ? projection : defaultPresentationFixedCamera.projection,
        position: ensureVector(source.position, worldView.position || defaultPresentationFixedCamera.position),
        target: ensureVector(source.target, worldView.target || defaultPresentationFixedCamera.target),
        fov: Math.max(1, ensureNumber(source.fov, defaultPresentationFixedCamera.fov)),
        zoom: Math.max(0.01, ensureNumber(source.zoom, defaultPresentationFixedCamera.zoom)),
        near,
        far,
        locked: ensureBoolean(source.locked, defaultPresentationFixedCamera.locked)
    }
}

export const normalizePresentationState = (presentation = {}, worldState = defaultWorldState) => {
    const source = presentation && typeof presentation === 'object' ? presentation : {}
    const mode = ensureString(source.mode, defaultPresentationState.mode)
    const entryView = ensureString(source.entryView, mode || defaultPresentationState.entryView)
    return {
        ...cloneValue(defaultPresentationState),
        ...cloneValue(source),
        mode: ['scene', 'fixed-camera', 'code'].includes(mode) ? mode : defaultPresentationState.mode,
        fixedCamera: normalizePresentationFixedCamera(source.fixedCamera, worldState),
        codeHtml: typeof source.codeHtml === 'string' ? source.codeHtml : defaultPresentationState.codeHtml,
        codeSourceType: source.codeSourceType === 'url' ? 'url' : defaultPresentationState.codeSourceType,
        codeUrl: typeof source.codeUrl === 'string' ? source.codeUrl.trim() : defaultPresentationState.codeUrl,
        codeFiles: Array.isArray(source.codeFiles)
            ? source.codeFiles
                .filter((f) => f && typeof f.name === 'string' && typeof f.content === 'string')
                .map((f) => ({ name: f.name.trim(), content: f.content }))
            : defaultPresentationState.codeFiles,
        entryView: ['scene', 'fixed-camera', 'code'].includes(entryView) ? entryView : defaultPresentationState.entryView,
        deviceAccess: source.deviceAccess === true
    }
}

export const normalizePublishState = (publish = {}) => {
    const source = publish && typeof publish === 'object' ? publish : {}
    const xrDefaultMode = ensureString(source.xrDefaultMode, defaultPublishState.xrDefaultMode)
    return {
        ...cloneValue(defaultPublishState),
        ...cloneValue(source),
        shareEnabled: ensureBoolean(source.shareEnabled, defaultPublishState.shareEnabled),
        xrDefaultMode: ['none', 'vr', 'ar', 'off'].includes(xrDefaultMode) ? xrDefaultMode : defaultPublishState.xrDefaultMode,
        lastExportAt: Math.max(0, ensureNumber(source.lastExportAt, defaultPublishState.lastExportAt))
    }
}

export const normalizeShowState = (show = {}) => {
    const source = show && typeof show === 'object' ? show : {}
    return {
        clockEpoch: Math.max(0, ensureNumber(source.clockEpoch, defaultShowState.clockEpoch))
    }
}

const PERFORM_SLOT_ID = /^[A-Za-z0-9_-]{1,40}$/
const clampPercent = (value, min, max) => Math.min(max, Math.max(min, value))

export const normalizePerformRect = (rect) => {
    if (!Array.isArray(rect) || rect.length !== 4) return null
    const numbers = rect.map(Number)
    if (!numbers.every(Number.isFinite)) return null
    const x = clampPercent(numbers[0], 0, 99)
    const y = clampPercent(numbers[1], 0, 99)
    const width = clampPercent(numbers[2], 1, 100 - x)
    const height = clampPercent(numbers[3], 1, 100 - y)
    return [x, y, width, height].map((n) => Math.round(n * 100) / 100)
}

const normalizePerformRects = (rects, ids) => {
    const out = {}
    if (!rects || typeof rects !== 'object' || Array.isArray(rects)) return out
    ids.forEach((id) => {
        const rect = normalizePerformRect(rects[id])
        if (rect) out[id] = rect
    })
    return out
}

// One preset, structurally: an id, a name, windows [{ id, kind }] and two
// layouts of percent rectangles. A window KIND this build does not know is
// kept — a newer di.iiii made it, and dropping it would lose the window the
// next time this build saves the list back. null for anything that is not one.
export const normalizePerformPreset = (preset) => {
    if (!preset || typeof preset !== 'object' || Array.isArray(preset)) return null
    const id = ensureString(preset.id).trim()
    if (!id || id.length > 72) return null
    const name = ensureString(preset.name).trim().slice(0, 60) || 'Untitled'
    const seen = new Set()
    const windows = []
    for (const item of Array.isArray(preset.windows) ? preset.windows : []) {
        if (!item || typeof item !== 'object') continue
        const slot = ensureString(item.id)
        const kind = ensureString(item.kind).slice(0, 32)
        if (!PERFORM_SLOT_ID.test(slot) || !kind || seen.has(slot)) continue
        seen.add(slot)
        windows.push({ id: slot, kind })
        if (windows.length >= PERFORM_PRESET_WINDOW_LIMIT) break
    }
    const ids = windows.map((item) => item.id)
    const out = {
        id,
        name,
        source: ['builtin', 'mine', 'show'].includes(preset.source) ? preset.source : 'show',
        windows,
        wide: normalizePerformRects(preset.wide, ids),
        narrow: normalizePerformRects(preset.narrow, ids)
    }
    const base = ensureString(preset.base)
    if (base) out.base = base.slice(0, 72)
    const updatedAt = Number(preset.updatedAt)
    if (Number.isFinite(updatedAt) && updatedAt >= 0) out.updatedAt = updatedAt
    return out
}

export const normalizePerformState = (perform = {}) => {
    const source = perform && typeof perform === 'object' ? perform : {}
    const presets = []
    const seen = new Set()
    for (const raw of Array.isArray(source.presets) ? source.presets : []) {
        const preset = normalizePerformPreset(raw)
        if (!preset || seen.has(preset.id)) continue
        seen.add(preset.id)
        // In the document every preset is the show's, whatever it claimed.
        presets.push({ ...preset, source: 'show' })
        if (presets.length >= PERFORM_PRESET_LIMIT) break
    }
    return { presets }
}

// 'stream' is a live picture named by WHAT it is ("OBS Virtual Camera", "capture"), not by a
// device id: an id belongs to one browser profile on one machine, so a mapping made on the desk
// could never name an input on the machine that actually shows it. See MapStreamSource.
//
// 'ndi' is the same idea one chain shorter: the ref is an NDI® source NAME
// ("AYLMO (td_out_windows)", or any fragment of it), received by the serverXR on whichever
// machine draws the surface. An address is never stored, because the SENDER chooses which of
// its interfaces to advertise. See MapNdiSource and docs/architecture/NDI.md.
//
// CLOSED LIST, AND THAT CUTS BOTH WAYS. normalizeMappingSurface rewrites a kind it does not
// know back to the default, so a mixed-version rig — the desk on this build, the wall on an
// older one — LOSES an 'ndi' surface the moment the old side writes the document back: it
// comes back as a test pattern and the ref is kept but meaningless. Both machines have to be
// on a build that has this list. (An unknown `ref` survives byte-identical, which is why the
// dim identification card was added as a ref and not a kind; see defaultMappingSurface.)
const MAPPING_SOURCE_KINDS = ['project', 'url', 'video', 'image', 'colour', 'test', 'camera', 'network', 'stream', 'ndi']
const MAPPING_BLEND_MODES = ['normal', 'screen', 'multiply', 'lighten', 'add']
export const MAPPING_EFFECT_KINDS = ['none', 'motion', 'ai']
export const MAPPING_EFFECT_PROMPT_MAX = 300

const clampNumber = (value, fallback, min, max) => Math.min(max, Math.max(min, ensureNumber(value, fallback)))

export const normalizeMappingEffect = (effect = {}) => {
    const source = effect && typeof effect === 'object' ? effect : {}
    const fallback = defaultMappingSurface.effect
    const kind = ensureString(source.kind, fallback.kind)
    return {
        kind: MAPPING_EFFECT_KINDS.includes(kind) ? kind : fallback.kind,
        threshold: clampNumber(source.threshold, fallback.threshold, 0, 1),
        // Below 1 always: a trail of exactly 1 never fades, and the wall fills.
        trail: clampNumber(source.trail, fallback.trail, 0, 0.99),
        gain: clampNumber(source.gain, fallback.gain, 0, 20),
        // 'ai': what the picture becomes, in words, and how far from the camera
        // it may drift (0 = the camera, 1 = only the words). Bounded so a pasted
        // essay cannot ride along in every mapping save.
        prompt: ensureString(source.prompt, fallback.prompt).slice(0, MAPPING_EFFECT_PROMPT_MAX),
        strength: clampNumber(source.strength, fallback.strength, 0.05, 1)
    }
}

const normalizePoint = (point, fallback = [0, 0]) => {
    if (!Array.isArray(point)) return [...fallback]
    const x = ensureNumber(point[0], fallback[0])
    const y = ensureNumber(point[1], fallback[1])
    return [x, y]
}

// Four corners, always. A surface that lost one to a bad write would be
// unsolvable rather than merely wrong, so the count is repaired here and the
// missing ones fall back to the default quad's.
const normalizeCorners = (corners) => {
    const source = Array.isArray(corners) ? corners : []
    return defaultMappingSurface.corners.map((fallback, index) => normalizePoint(source[index], fallback))
}

// A mask of one or two points is one being DRAWN — the operator has clicked
// the first corners of a shape and not closed it yet — so the points are kept.
// Nothing is clipped until there are three (maskToClipPath), which is what
// "fewer than three cannot enclose anything" actually means. Dropping them
// here made it impossible to trace a shape click by click at all.
const normalizeMask = (mask) => {
    if (!Array.isArray(mask)) return []
    return mask.map((point) => normalizePoint(point))
}

export const normalizeMappingSurface = (surface = {}) => {
    const source = surface && typeof surface === 'object' ? surface : {}
    const rawSource = source.source && typeof source.source === 'object' ? source.source : {}
    const kind = ensureString(rawSource.kind, defaultMappingSurface.source.kind)
    const blend = ensureString(source.blend, defaultMappingSurface.blend)
    const resolution = Array.isArray(source.resolution) ? source.resolution : defaultMappingSurface.resolution
    return {
        id: ensureString(source.id, ''),
        name: ensureString(source.name, ''),
        enabled: ensureBoolean(source.enabled, defaultMappingSurface.enabled),
        corners: normalizeCorners(source.corners),
        mask: normalizeMask(source.mask),
        source: {
            kind: MAPPING_SOURCE_KINDS.includes(kind) ? kind : defaultMappingSurface.source.kind,
            ref: ensureString(rawSource.ref, '')
        },
        resolution: [
            Math.max(1, ensureNumber(resolution[0], defaultMappingSurface.resolution[0])),
            Math.max(1, ensureNumber(resolution[1], defaultMappingSurface.resolution[1]))
        ],
        opacity: Math.min(1, Math.max(0, ensureNumber(source.opacity, defaultMappingSurface.opacity))),
        brightness: Math.max(0, ensureNumber(source.brightness, defaultMappingSurface.brightness)),
        contrast: Math.max(0, ensureNumber(source.contrast, defaultMappingSurface.contrast)),
        saturation: Math.max(0, ensureNumber(source.saturation, defaultMappingSurface.saturation)),
        hue: ensureNumber(source.hue, defaultMappingSurface.hue),
        blend: MAPPING_BLEND_MODES.includes(blend) ? blend : defaultMappingSurface.blend,
        effect: normalizeMappingEffect(source.effect)
    }
}

const normalizeCueSurface = (state = {}) => {
    const source = state && typeof state === 'object' ? state : {}
    const patch = {}
    if (source.enabled !== undefined) patch.enabled = ensureBoolean(source.enabled, true)
    if (source.opacity !== undefined) patch.opacity = Math.min(1, Math.max(0, ensureNumber(source.opacity, 1)))
    if (source.source && typeof source.source === 'object') {
        const kind = ensureString(source.source.kind, '')
        if (MAPPING_SOURCE_KINDS.includes(kind)) {
            patch.source = { kind, ref: ensureString(source.source.ref, '') }
        }
    }
    return patch
}

export const normalizeMappingCue = (cue = {}) => {
    const source = cue && typeof cue === 'object' ? cue : {}
    const rawSurfaces = source.surfaces && typeof source.surfaces === 'object' ? source.surfaces : {}
    const surfaces = {}
    Object.entries(rawSurfaces).forEach(([surfaceId, state]) => {
        const id = ensureString(surfaceId)
        if (!id) return
        const patch = normalizeCueSurface(state)
        // A cue entry that says nothing about a surface is dropped rather than
        // stored as an empty object that reads like "this cue covers it".
        if (Object.keys(patch).length) surfaces[id] = patch
    })
    const key = ensureString(source.key, '')
    // Emitted only when it holds something: a cue that never named a lighting
    // scene comes back exactly as it went in, so this field's arrival cannot
    // rewrite every mapping that already exists.
    const lightScene = ensureString(source.lightScene, '')
    // A look and a scene are both ids, and nothing about an id says which it is, so the
    // cue keeps them apart. A look wins when both are set: the desk is built on looks
    // now, and a cue that has been re-pointed at one has said what it means.
    const lightLook = ensureString(source.lightLook, '')
    return {
        id: ensureString(source.id, ''),
        name: ensureString(source.name, ''),
        key: /^[1-9]$/.test(key) ? key : '',
        fade: Math.max(0, ensureNumber(source.fade, defaultMappingCue.fade)),
        hold: Math.max(0, ensureNumber(source.hold, defaultMappingCue.hold)),
        ...(lightLook ? { lightLook } : {}),
        ...(lightScene ? { lightScene } : {}),
        surfaces
    }
}

export const normalizeMappingReference = (reference = {}) => {
    const source = reference && typeof reference === 'object' ? reference : {}
    return {
        url: ensureString(source.url, ''),
        opacity: Math.min(1, Math.max(0, ensureNumber(source.opacity, defaultMappingReference.opacity))),
        visible: ensureBoolean(source.visible, defaultMappingReference.visible)
    }
}

// WHICH DISPLAY SHOWS THIS MAPPING. `output.show` names a machine (its
// `machine.json` id, the one the machines hub hands every page) and one of its
// screens — by label, index and size, so a stage box can find "the projector"
// by whichever of those survived a reboot — or 'all' of them. It travels over
// the follow like the rest of the document, and `di stage run` reads it on
// every tick.
//
// The trap this normaliser used to be: the output block was rebuilt from width
// and height ALONE, so the first write from any machine dropped `show` on the
// floor and the stage went back to guessing. Both twins keep it now, and
// src/map/mappingState.test.js + serverXR/src/schemaSync.test.js hold a
// write→read round trip on each.
//
// Absent means absent: a document with no `show` and an `auto` slate comes
// out without those keys at all, so every mapping written before this existed
// is byte-identical after it.
export const normalizeOutputShow = (show) => {
    if (!show || typeof show !== 'object' || Array.isArray(show)) return null
    const machine = ensureString(show.machine, '').trim()
    if (!machine) return null
    let screen = 'all'
    if (show.screen && typeof show.screen === 'object' && !Array.isArray(show.screen)) {
        const label = ensureString(show.screen.label, '').trim()
        const index = Number.isInteger(show.screen.index) && show.screen.index >= 0 ? show.screen.index : null
        const size = Array.isArray(show.screen.size) && show.screen.size.length === 2
            && show.screen.size.every((value) => Number.isFinite(value) && value > 0)
            ? [Math.round(show.screen.size[0]), Math.round(show.screen.size[1])]
            : null
        if (label || index !== null || size) screen = { label, index, size }
    }
    const name = ensureString(show.name, '').trim()
    return { machine, ...(name ? { name } : {}), screen }
}

// The light pool's knobs (src/rigbuild/lightPool.js lightPoolOptions clamps the same way):
// kept so the room reads them — the normaliser used to drop the whole key. Absent means
// absent: only what the document says is written, each number clamped.
const normalizeLightPool = (pool) => {
  if (!pool || typeof pool !== 'object' || Array.isArray(pool)) return null
  const out = {}
  if (pool.enabled === true) out.enabled = true
  const num = (v) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v))
  const slots = num(pool.slots)
  if (slots !== null) out.slots = Math.max(1, Math.min(12, Math.floor(slots)))
  for (const key of ['minHoldMs', 'handoverMs', 'margin']) {
    const v = num(pool[key])
    if (v !== null) out[key] = Math.max(0, v)
  }
  const b = pool.bounds
  const vec = (a) => Array.isArray(a) && a.length >= 3 && a.slice(0, 3).every((x) => Number.isFinite(Number(x))) ? a.slice(0, 3).map(Number) : null
  if (b && vec(b.min) && vec(b.max)) out.bounds = { min: vec(b.min), max: vec(b.max) }
  return Object.keys(out).length ? out : null
}
export const normalizeMappingState = (mapping = {}) => {
    const source = mapping && typeof mapping === 'object' ? mapping : {}
    const output = source.output && typeof source.output === 'object' ? source.output : {}
    const surfaces = Array.isArray(source.surfaces) ? source.surfaces : []
    const seen = new Set()
    const seenCues = new Set()
    const show = normalizeOutputShow(output.show)
    return {
        output: {
            width: Math.max(1, ensureNumber(output.width, defaultMappingState.output.width)),
            height: Math.max(1, ensureNumber(output.height, defaultMappingState.output.height)),
            ...(show ? { show } : {}),
            // 'auto' is the default and is not written; only the authored
            // black is — the same absent-means-absent rule as `show`.
            ...(output.slate === 'off' ? { slate: 'off' } : {})
        },
        background: ensureString(source.background, defaultMappingState.background),
        // Order is the paint order — later surfaces are drawn over earlier
        // ones — so it is preserved exactly. Ids are deduped because two
        // surfaces sharing one id would make every edit ambiguous.
        surfaces: surfaces
            .map(normalizeMappingSurface)
            .filter((surface) => {
                if (!surface.id || seen.has(surface.id)) return false
                seen.add(surface.id)
                return true
            }),
        cues: (Array.isArray(source.cues) ? source.cues : [])
            .map(normalizeMappingCue)
            .filter((cue) => {
                if (!cue.id || seenCues.has(cue.id)) return false
                seenCues.add(cue.id)
                return true
            }),
        reference: normalizeMappingReference(source.reference),
        grid: Math.max(0, Math.min(200, Math.round(ensureNumber(source.grid, defaultMappingState.grid)))),
        fade: Math.max(0, Math.min(30, ensureNumber(source.fade, defaultMappingState.fade))),
        // The cue list goes from its last cue back to cue 1 while this is on — the
        // desk's cue runner plays it (serverXR/src/lighting/cuerun.js). Written only
        // when on: absent means absent, so every older document is byte-identical.
        ...(source.loop === true ? { loop: true } : {}),
        // The show's clock (RIG_BUILD.md §16, hosted playback): the moment, in ms since
        // 1970 UTC, the cue list started. With no desk, every viewer computes the cue on
        // screen from it — t = (now - showEpoch) mod the loop's length — so viewers
        // anywhere see the same moment. Written only when set, like `loop`.
        ...(typeof source.showEpoch === 'number' && Number.isFinite(source.showEpoch) && source.showEpoch > 0
            ? { showEpoch: Math.round(source.showEpoch) }
            : {}),
        // Who plays the show where a desk also answers (RIG_BUILD.md §15.8): 'clock' — the
        // document's own clock, even on a local install whose desk holds another project's
        // show (a comparison version the desk does not carry). Absent = the desk first (§16).
        ...(source.showSource === 'clock' ? { showSource: 'clock' } : {}),
    // The light pool's switch and knobs (src/rigbuild/lightPool.js); absent = off, the defaults.
    ...(normalizeLightPool(source.lightPool) ? { lightPool: normalizeLightPool(source.lightPool) } : {})
    }
}

export const normalizeProjectMeta = (meta = {}) => {
    const source = meta && typeof meta === 'object' ? meta : {}
    const now = Date.now()
    return {
        id: ensureString(source.id, ''),
        spaceId: ensureString(source.spaceId, 'main'),
        title: ensureString(source.title, 'Untitled Project'),
        createdAt: ensureNumber(source.createdAt, now),
        updatedAt: ensureNumber(source.updatedAt, now),
        source: ensureString(source.source, 'project')
    }
}

// --- The operator-family merge (2026-09-01) ---
//
// Eight math types and two logic types became two operators with an operation
// menu. Documents made before that hold `math.add` nodes with real wires, and
// a saved project is somebody's work — so this is a migration, not a shim:
// the old type id is normalized FORWARD here, at the one funnel every load,
// every op and every server replay passes through, and the old node comes out
// the other side as the merged operator with its operation preset and its
// wires attached to the same values.
//
// Nothing anywhere else may know the old ids. When this map is finally
// deleted, the documents will already have been rewritten by their next save.
const LEGACY_OPERATOR_TYPES = {
    'math.add':      { typeId: 'math.op',     operation: 'add'      },
    'math.subtract': { typeId: 'math.op',     operation: 'subtract' },
    'math.multiply': { typeId: 'math.op',     operation: 'multiply' },
    'math.divide':   { typeId: 'math.op',     operation: 'divide'   },
    'math.mod':      { typeId: 'math.op',     operation: 'modulo'   },
    'math.pow':      { typeId: 'math.op',     operation: 'power'    },
    'math.sin':      { typeId: 'math.op',     operation: 'sin'      },
    'math.abs':      { typeId: 'math.op',     operation: 'absolute' },
    'logic.gate':    { typeId: 'logic.route', operation: 'gate'     },
    'logic.switch':  { typeId: 'logic.route', operation: 'switch'   },
}

// Two of the ten named their ports differently from the operator they joined:
// Sin and Absolute took `in`, Gate took `value`/`open`. Keyed by the NEW type
// because that is all a later reader has — and neither merged type declares a
// port called `in`, `value` or `open`, so the rename can never eat a live one.
const LEGACY_OPERATOR_PORTS = {
    'math.op':     { in: 'a' },
    'logic.route': { value: 'a', open: 'pick' },
}

export const migrateLegacyNodeTypeId = (typeId) => LEGACY_OPERATOR_TYPES[typeId]?.typeId || typeId

const migrateLegacyPortId = (typeId, portId) => LEGACY_OPERATOR_PORTS[typeId]?.[portId] || portId

const mergeLegacyValues = (source = {}) => {
    const values = source.values && typeof source.values === 'object' ? cloneValue(source.values) : {}
    if (source.params && typeof source.params === 'object') {
        for (const [key, value] of Object.entries(source.params)) {
            if (values[key] === undefined) values[key] = cloneValue(value)
        }
    }
    if (source.spatial?.position && values.position === undefined) values.position = cloneValue(source.spatial.position)
    if (source.spatial?.rotation && values.rotation === undefined) values.rotation = cloneValue(source.spatial.rotation)
    if (source.spatial?.scale && values.scale === undefined) values.scale = cloneValue(source.spatial.scale)
    if (source.frame?.width !== undefined && values.width === undefined) values.width = source.frame.width
    if (source.frame?.height !== undefined && values.height === undefined) values.height = source.frame.height
    return values
}

export const normalizeProjectNode = (node = {}) => {
    const source = node && typeof node === 'object' ? node : {}
    const declaredTypeId = ensureString(source.typeId, ensureString(source.definitionId, ''))
    if (!declaredTypeId) return null
    if (LEGACY_ROOT_TYPE_IDS.has(declaredTypeId)) return null
    if (LEGACY_ROOT_NODE_IDS.has(source.id)) return null

    const merged = LEGACY_OPERATOR_TYPES[declaredTypeId]
    const typeId = merged ? merged.typeId : declaredTypeId

    const values = mergeLegacyValues(source)
    if (merged) {
        // The old type IS the operation, so it wins over whatever the node
        // happened to carry — nothing could have written `operation` on a
        // math.add.
        values.operation = merged.operation
    }
    const portRenames = LEGACY_OPERATOR_PORTS[typeId]
    if (portRenames) {
        for (const [from, to] of Object.entries(portRenames)) {
            if (values[from] === undefined) continue
            if (values[to] === undefined) values[to] = values[from]
            delete values[from]
        }
    }
    const graphX = Number.isFinite(Number(source.graphX))
        ? Number(source.graphX)
        : Number.isFinite(Number(source.params?.canvasPosition?.x))
            ? Number(source.params.canvasPosition.x)
            : 0
    const graphY = Number.isFinite(Number(source.graphY))
        ? Number(source.graphY)
        : Number.isFinite(Number(source.params?.canvasPosition?.y))
            ? Number(source.params.canvasPosition.y)
            : 0
    const assetRef = ensureString(
        source.assetRef,
        Array.isArray(source.assetBindings) && source.assetBindings[0]?.assetId
            ? source.assetBindings[0].assetId
            : ''
    ) || null

    return {
        id: ensureString(source.id, generateId('node')),
        typeId,
        label: ensureString(source.label, typeId),
        values,
        graphX,
        graphY,
        runtimeId: source.runtimeId ?? null,
        assetRef,
        parentId: ensureString(source.parentId, '') || null,
        createdBy: normalizeAuthor(source.createdBy)
    }
}

export const normalizeProjectEdge = (edge = {}) => {
    const source = edge && typeof edge === 'object' ? edge : {}
    const fromNodeId = ensureString(source.fromNodeId, ensureString(source.sourceId, ''))
    const toNodeId = ensureString(source.toNodeId, ensureString(source.targetId, ''))
    if (!fromNodeId || !toNodeId) return null
    const fromPort = ensureString(source.fromPort, 'out')
    const toPort = ensureString(source.toPort, ensureString(source.label, 'in'))
    return {
        id: ensureString(source.id, generateId('edge')),
        fromNodeId,
        fromPort,
        toNodeId,
        toPort
    }
}

const normalizeTemplate = (template = {}) => {
    const source = template && typeof template === 'object' ? template : {}
    return {
        id: ensureString(source.id, generateId('template')),
        label: ensureString(source.label, 'Untitled Template'),
        typeId: ensureString(source.typeId, ensureString(source.definitionId, '')),
        values: source.values && typeof source.values === 'object' ? cloneValue(source.values) : {}
    }
}

export const normalizeWorkspaceState = (workspace = {}) => {
    const source = workspace && typeof workspace === 'object' ? workspace : {}
    const liveMap = source.liveWorldNodeIdByScope
    const activeMap = source.activeNodeIdByTypeScope
    const next = {
        ...cloneValue(defaultWorkspaceState),
        ...cloneValue(source),
        selectedNodeId: ensureString(source.selectedNodeId, '') || null,
        liveWorldNodeIdByScope: (liveMap && typeof liveMap === 'object' && !Array.isArray(liveMap)) ? cloneValue(liveMap) : {},
        activeNodeIdByTypeScope: (activeMap && typeof activeMap === 'object' && !Array.isArray(activeMap)) ? cloneValue(activeMap) : {}
    }
    // The World/View/Graph surface axis is retired (2026-08-20). Old documents
    // still carry the key; shedding it here means it disappears on next save
    // instead of riding along forever.
    delete next.activeSurface
    return next
}

const normalizeNodesList = (list = []) => {
    const out = []
    for (const raw of Array.isArray(list) ? list : []) {
        const normalized = normalizeProjectNode(raw)
        if (!normalized) continue
        out.push(normalized)
    }
    return out
}

// A wire landing on a node whose type was merged is re-aimed at the port that
// now carries the same value — Sin's `in` is Math's `a`, Gate's `open` is
// Route's `pick`. The wire is not touched in any other way: same two nodes,
// same direction, same id, same value arriving at the far end.
const nodeTypeIds = (nodesById) => new Map([...nodesById].map(([id, node]) => [id, node.typeId]))

export const migrateEdgeToPort = (edge, typeIdByNodeId) => {
    if (!edge) return edge
    const typeId = typeIdByNodeId?.get?.(edge.toNodeId)
    const toPort = migrateLegacyPortId(typeId, edge.toPort)
    return toPort === edge.toPort ? edge : { ...edge, toPort }
}

const normalizeEdgesList = (list = [], typeIdByNodeId = new Map()) => {
    const out = []
    for (const raw of Array.isArray(list) ? list : []) {
        const normalized = normalizeProjectEdge(raw)
        if (!normalized) continue
        if (!typeIdByNodeId.has(normalized.fromNodeId) || !typeIdByNodeId.has(normalized.toNodeId)) continue
        out.push(migrateEdgeToPort(normalized, typeIdByNodeId))
    }
    return out
}

export const normalizeProjectDocument = (document = {}) => {
    const source = document && typeof document === 'object' ? document : {}
    const worldState = normalizeWorldState(source.worldState)
    const workspaceState = normalizeWorkspaceState(source.workspaceState)
    const nodes = normalizeNodesList(source.nodes)
    const typeIdByNodeId = new Map(nodes.map((node) => [node.id, node.typeId]))
    const nodeIds = typeIdByNodeId
    const edges = normalizeEdgesList(source.edges, typeIdByNodeId)

    return {
        version: PROJECT_DOCUMENT_VERSION,
        projectMeta: normalizeProjectMeta(source.projectMeta),
        nodes,
        edges,
        templates: Array.isArray(source.templates) ? source.templates.map(normalizeTemplate) : [],
        workspaceState: {
            ...workspaceState,
            selectedNodeId: nodeIds.has(workspaceState.selectedNodeId) ? workspaceState.selectedNodeId : null
        },
        entities: Array.isArray(source.entities) ? source.entities.map(normalizeEntity) : [],
        worldState,
        renderSettings: normalizeRenderSettings(source.renderSettings),
        xrState: normalizeXrState(source.xrState),
        presentationState: normalizePresentationState(source.presentationState, worldState),
        publishState: normalizePublishState(source.publishState),
        showState: normalizeShowState(source.showState),
        performState: normalizePerformState(source.performState),
        mappingState: normalizeMappingState(source.mappingState),
        windowLayout: normalizeWindowLayout(source.windowLayout),
        assets: Array.isArray(source.assets) ? source.assets.map(normalizeAsset) : []
    }
}

export const applyProjectOps = (document, ops = []) => {
    let nextDocument = normalizeProjectDocument(document)
    let entities = new Map(nextDocument.entities.map((entity) => [entity.id, entity]))
    let assets = new Map(nextDocument.assets.map((asset) => [asset.id, asset]))
    let nodes = new Map(nextDocument.nodes.map((node) => [node.id, node]))
    let edges = new Map(nextDocument.edges.map((edge) => [edge.id, edge]))

    ops.forEach((op) => {
        const payload = op?.payload || {}
        switch (op?.type) {
            case 'createEntity': {
                if (!payload.entity) break
                const entity = normalizeEntity(payload.entity)
                entities.set(entity.id, entity)
                break
            }
            case 'updateEntity': {
                const entityId = ensureString(payload.entityId)
                if (!entityId || !entities.has(entityId)) break
                // Pin the id: a patch carrying `id` would otherwise store an
                // entity whose id differs from its map key — serialized out
                // as a duplicate/orphan id and silently lost on next apply.
                entities.set(entityId, normalizeEntity({ ...mergePatch(entities.get(entityId), payload.patch || {}), id: entityId }))
                break
            }
            case 'updateComponent': {
                const entityId = ensureString(payload.entityId)
                const component = ensureString(payload.component)
                if (!entityId || !component || !entities.has(entityId)) break
                const entity = entities.get(entityId)
                entities.set(entityId, normalizeEntity({
                    ...entity,
                    components: {
                        ...entity.components,
                        [component]: mergePatch(entity.components?.[component], payload.patch || {})
                    }
                }))
                break
            }
            case 'deleteEntity': {
                const entityId = ensureString(payload.entityId)
                if (!entityId) break
                const toDelete = new Set()
                const collect = (id) => {
                    // parentId is patchable to anything, so cycles can exist —
                    // without this guard a cycle recurses to RangeError and the
                    // involved entities become permanently undeletable.
                    if (toDelete.has(id)) return
                    toDelete.add(id)
                    for (const [, child] of entities) {
                        if (child.parentId === id) collect(child.id)
                    }
                }
                collect(entityId)
                for (const id of toDelete) entities.delete(id)
                break
            }
            case 'createNode': {
                if (!payload.node) break
                const node = normalizeProjectNode(payload.node)
                if (!node) break
                nodes.set(node.id, node)
                break
            }
            case 'updateNode': {
                const nodeId = ensureString(payload.nodeId)
                if (!nodeId || !nodes.has(nodeId)) break
                const existing = nodes.get(nodeId)
                const patch = payload.patch || {}
                const nextValues = patch.values && typeof patch.values === 'object'
                    ? { ...existing.values, ...cloneValue(patch.values) }
                    : existing.values
                const merged = {
                    ...existing,
                    ...(patch.label !== undefined ? { label: ensureString(patch.label, existing.label) } : {}),
                    ...(patch.graphX !== undefined ? { graphX: ensureNumber(patch.graphX, existing.graphX) } : {}),
                    ...(patch.graphY !== undefined ? { graphY: ensureNumber(patch.graphY, existing.graphY) } : {}),
                    ...(patch.runtimeId !== undefined ? { runtimeId: patch.runtimeId } : {}),
                    ...(patch.assetRef !== undefined ? { assetRef: patch.assetRef || null } : {}),
                    values: nextValues
                }
                // Every other update op (updateEntity/updateComponent) routes
                // its merged result back through its normalizer before
                // storing; this one didn't, so an updateNode op's `values`
                // patch landed completely unchecked — no bounding, no type
                // coercion, unlike every other write path. normalizeProjectNode
                // is a no-op on an already-well-formed node (same function
                // createNode already runs payload.node through), so this only
                // adds the missing guard, it doesn't change normal behavior.
                const normalized = normalizeProjectNode(merged)
                if (normalized) nodes.set(nodeId, normalized)
                break
            }
            case 'reparentNode': {
                const nodeId = ensureString(payload.nodeId)
                if (!nodeId || !nodes.has(nodeId)) break
                const nextParentId = payload.parentId ? ensureString(payload.parentId) : null
                // The destination must exist. A parentId naming nothing puts the
                // node in no scope's child list, reachable from no Enter and
                // visible on no canvas — silent loss, not an error.
                if (nextParentId && !nodes.has(nextParentId)) break
                // …and the node must not become its own ancestor. deleteNode's
                // collect() guards against cycles it FINDS; this stops one being
                // made. Without it the cycle is unreachable, undeletable and
                // recurses on every traversal.
                let cursor = nextParentId
                let cycles = false
                const seen = new Set()
                while (cursor) {
                    if (cursor === nodeId) { cycles = true; break }
                    if (seen.has(cursor)) break
                    seen.add(cursor)
                    cursor = nodes.get(cursor)?.parentId || null
                }
                if (cycles) break
                // ONE op, applied whole or not at all. As four loose ops the
                // reducer would refuse the parentId while still applying the
                // coordinates — and useProjectDocumentSync resubmits a 409'd
                // batch verbatim, so a lost race left the node replanted at a
                // coordinate meaningless in its scope, with nothing said.
                const existing = nodes.get(nodeId)
                nodes.set(nodeId, normalizeProjectNode({
                    ...existing,
                    parentId: nextParentId,
                    ...(payload.graphX !== undefined ? { graphX: ensureNumber(payload.graphX, existing.graphX) } : {}),
                    ...(payload.graphY !== undefined ? { graphY: ensureNumber(payload.graphY, existing.graphY) } : {})
                }))
                break
            }
            case 'deleteNode': {
                const nodeId = ensureString(payload.nodeId)
                if (!nodeId) break
                // Collect the node and all descendants
                const toDelete = new Set()
                const collect = (id) => {
                    // parentId is patchable to anything, so cycles can exist —
                    // without this guard a cycle recurses to RangeError and the
                    // involved nodes become permanently undeletable.
                    if (toDelete.has(id)) return
                    toDelete.add(id)
                    for (const [, child] of nodes) {
                        if (child.parentId === id) collect(child.id)
                    }
                }
                collect(nodeId)
                // A doorway node puts a socket on its CONTAINER's outer face,
                // and the wire to that socket names the container, not the door
                // — so deleting the door leaves an edge whose endpoints both
                // still exist. Nothing else would ever remove it: createEdge
                // validates endpoint nodes only, and normalizeEdgesList drops
                // edges by missing node id, never by missing port. It would be a
                // permanent orphan, parked at the corner of a card by
                // inputPortCenter's idx<0 branch, that no reload or gesture
                // could clear. Swept here, where the door's id is still known.
                const deletedDoorwaySockets = new Set()
                for (const id of toDelete) {
                    const doomed = nodes.get(id)
                    if (doomed && (doomed.typeId === 'port.in' || doomed.typeId === 'port.out') && doomed.parentId) {
                        deletedDoorwaySockets.add(`${doomed.parentId}:${doomed.id}`)
                    }
                }
                for (const id of toDelete) nodes.delete(id)
                for (const [edgeId, edge] of edges) {
                    if (toDelete.has(edge.fromNodeId) || toDelete.has(edge.toNodeId)) {
                        edges.delete(edgeId)
                    } else if (deletedDoorwaySockets.has(`${edge.toNodeId}:${edge.toPort}`)
                        || deletedDoorwaySockets.has(`${edge.fromNodeId}:${edge.fromPort}`)) {
                        edges.delete(edgeId)
                    }
                }
                if (toDelete.has(nextDocument.workspaceState.selectedNodeId)) {
                    nextDocument.workspaceState = normalizeWorkspaceState({
                        ...nextDocument.workspaceState,
                        selectedNodeId: null
                    })
                }
                break
            }
            case 'createEdge': {
                if (!payload.edge) break
                const edge = normalizeProjectEdge(payload.edge)
                if (!edge) break
                if (!nodes.has(edge.fromNodeId) || !nodes.has(edge.toNodeId)) break
                // A stored op log replayed from the beginning carries wires
                // aimed at ports the merged operator no longer declares. The
                // same re-aim the document load does, applied to the op.
                edges.set(edge.id, migrateEdgeToPort(edge, nodeTypeIds(nodes)))
                break
            }
            case 'updateEdge': {
                const edgeId = ensureString(payload.edgeId)
                if (!edgeId || !edges.has(edgeId)) break
                const merged = normalizeProjectEdge({ ...mergePatch(edges.get(edgeId), payload.patch || {}), id: edgeId })
                if (!merged) break
                edges.set(edgeId, migrateEdgeToPort(merged, nodeTypeIds(nodes)))
                break
            }
            case 'deleteEdge': {
                const edgeId = ensureString(payload.edgeId)
                if (edgeId) edges.delete(edgeId)
                break
            }
            case 'setWorldState': {
                nextDocument.worldState = normalizeWorldState(mergePatch(nextDocument.worldState, payload.patch || {}))
                break
            }
            case 'setRenderSettings': {
                nextDocument.renderSettings = normalizeRenderSettings(mergePatch(nextDocument.renderSettings, payload.patch || {}))
                break
            }
            case 'setXrState': {
                nextDocument.xrState = normalizeXrState(mergePatch(nextDocument.xrState, payload.patch || {}))
                break
            }
            case 'setPresentationState': {
                nextDocument.presentationState = normalizePresentationState(
                    mergePatch(nextDocument.presentationState, payload.patch || {}),
                    nextDocument.worldState
                )
                break
            }
            case 'setPublishState': {
                nextDocument.publishState = normalizePublishState(mergePatch(nextDocument.publishState, payload.patch || {}))
                break
            }
            case 'setShowState': {
                nextDocument.showState = normalizeShowState(mergePatch(nextDocument.showState, payload.patch || {}))
                break
            }
            // The show's Perform presets, one at a time: two people giving a
            // preset to the show at once must both land, which a whole-list
            // replace would not allow.
            case 'upsertPerformPreset': {
                const preset = normalizePerformPreset(payload.preset)
                if (!preset) break
                const presets = nextDocument.performState.presets.filter((existing) => existing.id !== preset.id)
                const index = nextDocument.performState.presets.findIndex((existing) => existing.id === preset.id)
                // A new one goes at `index` when given (undo puts a deleted
                // preset back where it was), else at the end.
                const at = Number.isInteger(payload.index) && payload.index >= 0 ? Math.min(payload.index, presets.length) : presets.length
                presets.splice(index === -1 ? at : index, 0, preset)
                nextDocument.performState = normalizePerformState({ presets })
                break
            }
            case 'deletePerformPreset': {
                const presetId = ensureString(payload.presetId)
                if (!presetId) break
                nextDocument.performState = normalizePerformState({
                    presets: nextDocument.performState.presets.filter((existing) => existing.id !== presetId)
                })
                break
            }
            // The mapper's four ops. Surfaces are a LIST, not a map, because the
            // order is the paint order — what overlaps what on the wall — and
            // a map has no order to lose.
            case 'setMappingState': {
                const patch = payload.patch || {}
                nextDocument.mappingState = normalizeMappingState({
                    ...nextDocument.mappingState,
                    ...patch,
                    // A doc-level patch never rewrites the surfaces or the
                    // cues wholesale; that is what the surface and cue ops are
                    // for. Without this pin, a stale editor flushing an
                    // output-resolution change would carry its whole surface
                    // list along and clobber a concurrent corner drag.
                    surfaces: nextDocument.mappingState.surfaces,
                    cues: nextDocument.mappingState.cues
                })
                break
            }
            case 'createMappingSurface': {
                const surface = normalizeMappingSurface(payload.surface || {})
                if (!surface.id) break
                if (nextDocument.mappingState.surfaces.some((existing) => existing.id === surface.id)) break
                nextDocument.mappingState = normalizeMappingState({
                    ...nextDocument.mappingState,
                    surfaces: [...nextDocument.mappingState.surfaces, surface]
                })
                break
            }
            case 'setMappingSurface': {
                const surfaceId = ensureString(payload.surfaceId)
                if (!surfaceId) break
                const index = nextDocument.mappingState.surfaces.findIndex((surface) => surface.id === surfaceId)
                if (index === -1) break
                const surfaces = [...nextDocument.mappingState.surfaces]
                surfaces[index] = normalizeMappingSurface({
                    ...mergePatch(surfaces[index], payload.patch || {}),
                    id: surfaceId
                })
                nextDocument.mappingState = normalizeMappingState({ ...nextDocument.mappingState, surfaces })
                break
            }
            case 'reorderMappingSurfaces': {
                const order = Array.isArray(payload.surfaceIds) ? payload.surfaceIds.map((id) => ensureString(id)) : []
                if (!order.length) break
                const byId = new Map(nextDocument.mappingState.surfaces.map((surface) => [surface.id, surface]))
                const reordered = order.map((id) => byId.get(id)).filter(Boolean)
                // Any surface the caller did not name keeps its place at the
                // back rather than vanishing — a reorder must never be able to
                // delete.
                const named = new Set(reordered.map((surface) => surface.id))
                const rest = nextDocument.mappingState.surfaces.filter((surface) => !named.has(surface.id))
                nextDocument.mappingState = normalizeMappingState({
                    ...nextDocument.mappingState,
                    surfaces: [...rest, ...reordered]
                })
                break
            }
            case 'createMappingCue': {
                const cue = normalizeMappingCue(payload.cue || {})
                if (!cue.id) break
                if (nextDocument.mappingState.cues.some((existing) => existing.id === cue.id)) break
                nextDocument.mappingState = normalizeMappingState({
                    ...nextDocument.mappingState,
                    cues: [...nextDocument.mappingState.cues, cue]
                })
                break
            }
            case 'setMappingCue': {
                const cueId = ensureString(payload.cueId)
                if (!cueId) break
                const index = nextDocument.mappingState.cues.findIndex((cue) => cue.id === cueId)
                if (index === -1) break
                const patch = payload.patch || {}
                const cues = [...nextDocument.mappingState.cues]
                // `surfaces` REPLACES rather than merges. A cue's surface map
                // is authored whole — dropping a surface out of a cue is a
                // real edit — and mergePatch would only ever add to it, so a
                // removal would be silently impossible.
                const merged = mergePatch(cues[index], { ...patch, surfaces: undefined })
                delete merged.surfaces
                cues[index] = normalizeMappingCue({
                    ...merged,
                    surfaces: patch.surfaces !== undefined ? patch.surfaces : cues[index].surfaces,
                    id: cueId
                })
                nextDocument.mappingState = normalizeMappingState({ ...nextDocument.mappingState, cues })
                break
            }
            case 'deleteMappingCue': {
                const cueId = ensureString(payload.cueId)
                if (!cueId) break
                nextDocument.mappingState = normalizeMappingState({
                    ...nextDocument.mappingState,
                    cues: nextDocument.mappingState.cues.filter((cue) => cue.id !== cueId)
                })
                break
            }
            case 'reorderMappingCues': {
                const order = Array.isArray(payload.cueIds) ? payload.cueIds.map((id) => ensureString(id)) : []
                if (!order.length) break
                const byId = new Map(nextDocument.mappingState.cues.map((cue) => [cue.id, cue]))
                const reordered = order.map((id) => byId.get(id)).filter(Boolean)
                const named = new Set(reordered.map((cue) => cue.id))
                const rest = nextDocument.mappingState.cues.filter((cue) => !named.has(cue.id))
                nextDocument.mappingState = normalizeMappingState({
                    ...nextDocument.mappingState,
                    cues: [...reordered, ...rest]
                })
                break
            }
            case 'deleteMappingSurface': {
                const surfaceId = ensureString(payload.surfaceId)
                if (!surfaceId) break
                nextDocument.mappingState = normalizeMappingState({
                    ...nextDocument.mappingState,
                    surfaces: nextDocument.mappingState.surfaces.filter((surface) => surface.id !== surfaceId),
                    // Every cue forgets it too. A cue holding a line about a
                    // surface that no longer exists is invisible rubbish that
                    // comes back to life the moment an id is reused.
                    cues: nextDocument.mappingState.cues.map((cue) => {
                        if (!cue.surfaces[surfaceId]) return cue
                        const surfaces = { ...cue.surfaces }
                        delete surfaces[surfaceId]
                        return { ...cue, surfaces }
                    })
                })
                break
            }
        case 'setWindowState': {
                const windowId = ensureString(payload.windowId)
                if (!windowId || !nextDocument.windowLayout.windows[windowId]) break
                const windows = {
                    ...nextDocument.windowLayout.windows,
                    [windowId]: normalizeWindowState(windowId, mergePatch(nextDocument.windowLayout.windows[windowId], payload.patch || {}), defaultWindowLayout.windows[windowId])
                }
                nextDocument.windowLayout = normalizeWindowLayout({
                    ...nextDocument.windowLayout,
                    windows,
                    activeWindowId: payload.focus ? windowId : nextDocument.windowLayout.activeWindowId
                })
                break
            }
            case 'setWorkspaceState': {
                nextDocument.workspaceState = normalizeWorkspaceState(mergePatch(nextDocument.workspaceState, payload.patch || {}))
                break
            }
            case 'setProjectMeta': {
                nextDocument.projectMeta = normalizeProjectMeta(mergePatch(nextDocument.projectMeta, payload.patch || {}))
                break
            }
            case 'upsertAsset': {
                if (!payload.asset) break
                const asset = normalizeAsset(payload.asset)
                assets.set(asset.id, asset)
                break
            }
            case 'deleteAsset': {
                const assetId = ensureString(payload.assetId)
                if (assetId) assets.delete(assetId)
                break
            }
            case 'replaceDocument': {
                if (payload.document && typeof payload.document === 'object') {
                    nextDocument = normalizeProjectDocument(payload.document)
                    entities = new Map(nextDocument.entities.map((entity) => [entity.id, entity]))
                    assets = new Map(nextDocument.assets.map((asset) => [asset.id, asset]))
                    nodes = new Map(nextDocument.nodes.map((node) => [node.id, node]))
                    edges = new Map(nextDocument.edges.map((edge) => [edge.id, edge]))
                }
                break
            }
            default:
                break
        }
    })

    nextDocument.entities = Array.from(entities.values())
    nextDocument.assets = Array.from(assets.values())
    nextDocument.nodes = Array.from(nodes.values())
    nextDocument.edges = Array.from(edges.values())
    nextDocument.projectMeta.updatedAt = Date.now()
    return normalizeProjectDocument(nextDocument)
}

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

// mergePatch never removes keys, so the inverse restores values: a key the
// patch introduced comes back as null and normalization supplies defaults.
const invertMergePatch = (target, patch) => {
    if (!isPlainObject(patch)) return cloneValue(target)
    const base = isPlainObject(target) ? target : {}
    const inverse = {}
    Object.entries(patch).forEach(([key, value]) => {
        if (isPlainObject(value) && isPlainObject(base[key])) {
            inverse[key] = invertMergePatch(base[key], value)
        } else {
            inverse[key] = key in base ? cloneValue(base[key]) : null
        }
    })
    return inverse
}

const hasPatchKeys = (patch) => isPlainObject(patch) && Object.keys(patch).length > 0

// Inverse of one op against the (normalized) document it is about to mutate.
// Guards mirror applyProjectOps: ops that would no-op there invert to [].
// Creates whose payload lacks an id invert to [] — apply would generate a
// random id the inverse could never reference.
const invertSingleOp = (document, op) => {
    const payload = op?.payload || {}
    const entities = new Map(document.entities.map((entity) => [entity.id, entity]))
    const assets = new Map(document.assets.map((asset) => [asset.id, asset]))
    const nodes = new Map(document.nodes.map((node) => [node.id, node]))
    const edges = new Map(document.edges.map((edge) => [edge.id, edge]))
    const patchInverse = (type, target, extra = {}) => {
        if (!hasPatchKeys(payload.patch)) return []
        return [{ type, payload: { ...extra, patch: invertMergePatch(target, payload.patch) } }]
    }
    switch (op?.type) {
        case 'createEntity': {
            if (!payload.entity || !ensureString(payload.entity.id)) break
            const entityId = normalizeEntity(payload.entity).id
            const prev = entities.get(entityId)
            if (prev) return [{ type: 'createEntity', payload: { entity: cloneValue(prev) } }]
            return [{ type: 'deleteEntity', payload: { entityId } }]
        }
        case 'updateEntity': {
            const entityId = ensureString(payload.entityId)
            if (!entityId || !entities.has(entityId) || !hasPatchKeys(payload.patch)) break
            return [{ type: 'updateEntity', payload: { entityId, patch: invertMergePatch(entities.get(entityId), payload.patch) } }]
        }
        case 'updateComponent': {
            const entityId = ensureString(payload.entityId)
            const component = ensureString(payload.component)
            if (!entityId || !component || !entities.has(entityId) || !hasPatchKeys(payload.patch)) break
            const target = entities.get(entityId).components?.[component]
            return [{
                type: 'updateComponent',
                payload: { entityId, component, patch: invertMergePatch(isPlainObject(target) ? target : {}, payload.patch) }
            }]
        }
        case 'deleteEntity': {
            const entityId = ensureString(payload.entityId)
            if (!entityId) break
            const restored = []
            const seen = new Set()
            const collect = (id) => {
                if (seen.has(id)) return
                seen.add(id)
                if (entities.has(id)) restored.push(entities.get(id))
                for (const [, child] of entities) {
                    if (child.parentId === id) collect(child.id)
                }
            }
            collect(entityId)
            return restored.map((entity) => ({ type: 'createEntity', payload: { entity: cloneValue(entity) } }))
        }
        case 'createNode': {
            if (!payload.node || !ensureString(payload.node.id)) break
            const node = normalizeProjectNode(payload.node)
            if (!node) break
            // Mirrors createEntity/createEdge: forward apply overwrites a
            // colliding id (see applyProjectOps) rather than no-op'ing, so
            // the inverse must restore what was hijacked, not just delete.
            const prev = nodes.get(node.id)
            if (prev) return [{ type: 'createNode', payload: { node: cloneValue(prev) } }]
            return [{ type: 'deleteNode', payload: { nodeId: node.id } }]
        }
        case 'updateNode': {
            const nodeId = ensureString(payload.nodeId)
            if (!nodeId || !nodes.has(nodeId)) break
            const existing = nodes.get(nodeId)
            const patch = payload.patch || {}
            const inversePatch = {
                ...(patch.label !== undefined ? { label: existing.label } : {}),
                ...(patch.graphX !== undefined ? { graphX: existing.graphX } : {}),
                ...(patch.graphY !== undefined ? { graphY: existing.graphY } : {}),
                ...(patch.runtimeId !== undefined ? { runtimeId: existing.runtimeId ?? null } : {}),
                ...(patch.assetRef !== undefined ? { assetRef: existing.assetRef ?? null } : {}),
                ...(isPlainObject(patch.values) ? {
                    values: Object.fromEntries(Object.keys(patch.values).map((key) => [
                        key,
                        key in (existing.values || {}) ? cloneValue(existing.values[key]) : null
                    ]))
                } : {})
            }
            if (!Object.keys(inversePatch).length) break
            return [{ type: 'updateNode', payload: { nodeId, patch: inversePatch } }]
        }
        case 'reparentNode': {
            const nodeId = ensureString(payload.nodeId)
            const existing = nodeId ? nodes.get(nodeId) : null
            if (!existing) break
            // Puts the node back in the scope it came FROM, and back where it
            // sat there. Without the coordinates the undo returns it to the
            // right room at the drop point's coordinates, which mean nothing in
            // that room.
            return [{
                type: 'reparentNode',
                payload: {
                    nodeId,
                    parentId: existing.parentId || null,
                    graphX: existing.graphX,
                    graphY: existing.graphY
                }
            }]
        }
        case 'deleteNode': {
            const nodeId = ensureString(payload.nodeId)
            if (!nodeId) break
            const toDelete = new Set()
            const collect = (id) => {
                if (toDelete.has(id)) return
                toDelete.add(id)
                for (const [, child] of nodes) {
                    if (child.parentId === id) collect(child.id)
                }
            }
            collect(nodeId)
            const restoredNodes = Array.from(toDelete).filter((id) => nodes.has(id)).map((id) => nodes.get(id))
            // A doorway's exterior wire names the CONTAINER and the door's id,
            // and the container is not in toDelete — so the delete sweep
            // removes it while this filter alone would never restore it, and
            // undo would silently drop a wire the user still had. Found by
            // reading the inverse rather than by a failing test; guarded by one
            // now.
            const doorwaySockets = new Set(
                Array.from(toDelete)
                    .map((id) => nodes.get(id))
                    .filter((node) => node && (node.typeId === 'port.in' || node.typeId === 'port.out') && node.parentId)
                    .map((node) => `${node.parentId}:${node.id}`)
            )
            const restoredEdges = Array.from(edges.values())
                .filter((edge) => toDelete.has(edge.fromNodeId)
                    || toDelete.has(edge.toNodeId)
                    || doorwaySockets.has(`${edge.toNodeId}:${edge.toPort}`)
                    || doorwaySockets.has(`${edge.fromNodeId}:${edge.fromPort}`))
            if (!restoredNodes.length && !restoredEdges.length) break
            const inverse = [
                ...restoredNodes.map((node) => ({ type: 'createNode', payload: { node: cloneValue(node) } })),
                ...restoredEdges.map((edge) => ({ type: 'createEdge', payload: { edge: cloneValue(edge) } }))
            ]
            if (toDelete.has(document.workspaceState?.selectedNodeId)) {
                inverse.push({ type: 'setWorkspaceState', payload: { patch: { selectedNodeId: document.workspaceState.selectedNodeId } } })
            }
            return inverse
        }
        case 'createEdge': {
            if (!payload.edge || !ensureString(payload.edge.id)) break
            const edge = normalizeProjectEdge(payload.edge)
            if (!edge || !nodes.has(edge.fromNodeId) || !nodes.has(edge.toNodeId)) break
            const prev = edges.get(edge.id)
            if (prev) return [{ type: 'createEdge', payload: { edge: cloneValue(prev) } }]
            return [{ type: 'deleteEdge', payload: { edgeId: edge.id } }]
        }
        case 'updateEdge': {
            const edgeId = ensureString(payload.edgeId)
            if (!edgeId || !edges.has(edgeId) || !hasPatchKeys(payload.patch)) break
            return [{ type: 'updateEdge', payload: { edgeId, patch: invertMergePatch(edges.get(edgeId), payload.patch) } }]
        }
        case 'deleteEdge': {
            const edgeId = ensureString(payload.edgeId)
            if (!edgeId || !edges.has(edgeId)) break
            return [{ type: 'createEdge', payload: { edge: cloneValue(edges.get(edgeId)) } }]
        }
        case 'setWorldState': return patchInverse('setWorldState', document.worldState)
        case 'setRenderSettings': return patchInverse('setRenderSettings', document.renderSettings)
        case 'setXrState': return patchInverse('setXrState', document.xrState)
        case 'setPresentationState': return patchInverse('setPresentationState', document.presentationState)
        case 'setPublishState': return patchInverse('setPublishState', document.publishState)
        case 'setShowState': return patchInverse('setShowState', document.showState)
        case 'upsertPerformPreset': {
            const preset = normalizePerformPreset(payload.preset)
            if (!preset) break
            const presets = document.performState?.presets || []
            const index = presets.findIndex((existing) => existing.id === preset.id)
            if (index === -1) return [{ type: 'deletePerformPreset', payload: { presetId: preset.id } }]
            return [{ type: 'upsertPerformPreset', payload: { preset: cloneValue(presets[index]) } }]
        }
        case 'deletePerformPreset': {
            const presetId = ensureString(payload.presetId)
            const presets = document.performState?.presets || []
            const index = presets.findIndex((existing) => existing.id === presetId)
            if (index === -1) break
            // Back where it was in the list, not at the end: the menu reads in order.
            return [{ type: 'upsertPerformPreset', payload: { preset: cloneValue(presets[index]), index } }]
        }
        case 'setMappingState': return patchInverse('setMappingState', document.mappingState)
        case 'reorderMappingSurfaces': {
            const surfaces = document.mappingState?.surfaces || []
            if (!Array.isArray(payload.surfaceIds) || !payload.surfaceIds.length || !surfaces.length) break
            return [{ type: 'reorderMappingSurfaces', payload: { surfaceIds: surfaces.map((surface) => surface.id) } }]
        }
        case 'createMappingSurface': {
            const surfaceId = ensureString(payload.surface?.id)
            if (!surfaceId) break
            const prev = (document.mappingState?.surfaces || []).find((surface) => surface.id === surfaceId)
            // Re-creating an id that already existed is a no-op in apply, so
            // its inverse must be a no-op too — not a delete of somebody
            // else's surface.
            if (prev) return []
            return [{ type: 'deleteMappingSurface', payload: { surfaceId } }]
        }
        case 'createMappingCue': {
            const cueId = ensureString(payload.cue?.id)
            if (!cueId) break
            if ((document.mappingState?.cues || []).some((cue) => cue.id === cueId)) return []
            return [{ type: 'deleteMappingCue', payload: { cueId } }]
        }
        case 'setMappingCue': {
            const cueId = ensureString(payload.cueId)
            const prev = (document.mappingState?.cues || []).find((cue) => cue.id === cueId)
            if (!cueId || !prev || !hasPatchKeys(payload.patch)) break
            const inverse = patchInverse('setMappingCue', prev, { cueId })
            // patchInverse cannot describe the whole-map replace above, so the
            // previous surface map is restored explicitly.
            if (payload.patch.surfaces !== undefined) {
                const entry = inverse[0] || { type: 'setMappingCue', payload: { cueId, patch: {} } }
                entry.payload.patch = { ...entry.payload.patch, surfaces: cloneValue(prev.surfaces) }
                return [entry]
            }
            return inverse
        }
        case 'deleteMappingCue': {
            const cueId = ensureString(payload.cueId)
            const cues = document.mappingState?.cues || []
            const index = cues.findIndex((cue) => cue.id === cueId)
            if (index === -1) break
            const restore = [{ type: 'createMappingCue', payload: { cue: cloneValue(cues[index]) } }]
            if (index < cues.length - 1) {
                restore.push({ type: 'reorderMappingCues', payload: { cueIds: cues.map((cue) => cue.id) } })
            }
            return restore
        }
        case 'reorderMappingCues': {
            const cues = document.mappingState?.cues || []
            if (!Array.isArray(payload.cueIds) || !payload.cueIds.length || !cues.length) break
            return [{ type: 'reorderMappingCues', payload: { cueIds: cues.map((cue) => cue.id) } }]
        }
        case 'setMappingSurface': {
            const surfaceId = ensureString(payload.surfaceId)
            const prev = (document.mappingState?.surfaces || []).find((surface) => surface.id === surfaceId)
            if (!surfaceId || !prev || !hasPatchKeys(payload.patch)) break
            return patchInverse('setMappingSurface', prev, { surfaceId })
        }
        case 'deleteMappingSurface': {
            const surfaceId = ensureString(payload.surfaceId)
            const surfaces = document.mappingState?.surfaces || []
            const index = surfaces.findIndex((surface) => surface.id === surfaceId)
            if (index === -1) break
            // Undo has to restore the paint ORDER as well as the surface: a
            // deleted middle layer that came back on top would silently cover
            // its neighbours on the wall.
            const restore = [{ type: 'createMappingSurface', payload: { surface: cloneValue(surfaces[index]) } }]
            if (index < surfaces.length - 1) {
                restore.push({ type: 'reorderMappingSurfaces', payload: { surfaceIds: surfaces.map((surface) => surface.id) } })
            }
            return restore
        }
        case 'setWindowState': {
            const windowId = ensureString(payload.windowId)
            const windows = document.windowLayout?.windows || {}
            if (!windowId || !windows[windowId]) break
            const inverse = patchInverse('setWindowState', windows[windowId], { windowId })
            const prevActive = document.windowLayout.activeWindowId
            if (payload.focus && prevActive && prevActive !== windowId && windows[prevActive]) {
                inverse.push({ type: 'setWindowState', payload: { windowId: prevActive, patch: {}, focus: true } })
            }
            return inverse
        }
        case 'setWorkspaceState': return patchInverse('setWorkspaceState', document.workspaceState)
        case 'setProjectMeta': return patchInverse('setProjectMeta', document.projectMeta)
        case 'upsertAsset': {
            if (!payload.asset || !ensureString(payload.asset.id)) break
            const assetId = normalizeAsset(payload.asset).id
            const prev = assets.get(assetId)
            if (prev) return [{ type: 'upsertAsset', payload: { asset: cloneValue(prev) } }]
            return [{ type: 'deleteAsset', payload: { assetId } }]
        }
        case 'deleteAsset': {
            const assetId = ensureString(payload.assetId)
            if (!assetId || !assets.has(assetId)) break
            return [{ type: 'upsertAsset', payload: { asset: cloneValue(assets.get(assetId)) } }]
        }
        case 'replaceDocument': {
            if (!payload.document || typeof payload.document !== 'object') break
            return [{ type: 'replaceDocument', payload: { document: cloneValue(document) } }]
        }
        default:
            break
    }
    return []
}

// Inverse of an op batch against the document it was applied to. Per-op
// inverse groups keep their internal order (nodes before their edges) while
// the groups themselves reverse, so applying the result after the forward
// batch restores the document (modulo projectMeta.updatedAt and keys the
// batch introduced, which come back as null).
export const invertProjectOps = (document, ops = []) => {
    let sim = normalizeProjectDocument(document)
    const groups = []
    ops.forEach((op) => {
        const inverse = invertSingleOp(sim, op)
        if (inverse.length) groups.push(inverse)
        sim = applyProjectOps(sim, [op])
    })
    return groups.reverse().flat()
}
