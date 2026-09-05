// Manual CJS mirror of src/shared/projectSchema.js — required because that
// file transitively imports the browser-only node registry, which CJS
// server tests can't load. Keep this in lockstep by hand; drift is caught
// by serverXR/src/schemaSync.test.js (`npm run test:schema-sync`), which
// runs the same normalization inputs through both files.
// Server-side consumers (serverXR) load this via loadSharedModule('projectSchema.cjs').
// This file intentionally does NOT import the client-only node registry,
// so it accepts any typeId without validation — same as the ESM original.

const PROJECT_DOCUMENT_VERSION = 4

const ENTITY_TYPES = new Set([
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
])

const WINDOW_IDS = ['viewport', 'assets', 'inspector', 'outliner', 'activity', 'project']

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

const cloneValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneValue(nested)]))
  }
  return value
}

const ensureVector = (value, fallback = [0, 0, 0]) => {
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

const generateId = (prefix = 'id') => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

const defaultWindowLayout = {
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

const defaultWorldState = {
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
  // See shared/placement.cjs; switching it off leaves every photo where it is.
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

const defaultRenderSettings = {
  shadows: true,
  antialias: true,
  toneMapping: 'ACESFilmic',
  toneMappingExposure: 1,
  dprMin: 1,
  dprMax: 2
}

const defaultXrState = {
  mode: 'none',
  debugVisible: false,
  vrSupported: false,
  arSupported: false
}

const defaultPresentationFixedCamera = {
  projection: 'perspective',
  position: [0, 2.4, 6.5],
  target: [0, 0.75, 0],
  fov: 50,
  zoom: 1,
  near: 0.1,
  far: 200,
  locked: false
}

const defaultPresentationState = {
  mode: 'scene',
  fixedCamera: defaultPresentationFixedCamera,
  codeHtml: '',
  codeSourceType: 'html',
  codeUrl: '',
  codeFiles: [],
  entryView: 'scene',
  deviceAccess: false
}

const defaultPublishState = {
  shareEnabled: false,
  xrDefaultMode: 'none',
  lastExportAt: 0
}

const defaultShowState = {
  // Wall-clock ms stamped once, the first time a Time node exists in the
  // document. Every window (editor, second tab, /out) derives the same
  // elapsed value from it, so one show has ONE clock. 0 = not stamped yet;
  // the clock falls back to each window's own monotonic time.
  clockEpoch: 0
}

const defaultMappingSurface = {
  id: '',
  name: '',
  enabled: true,
  // Corners in the OUTPUT frame's normalised space, clockwise from top-left.
  // Normalised so a mapping aligned on a laptop still lands on the wall when
  // the projector runs at a different resolution.
  corners: [[0.1, 0.1], [0.5, 0.1], [0.5, 0.5], [0.1, 0.5]],
  // Polygon mask in the surface's OWN normalised space. Empty = the whole
  // rectangle.
  mask: [],
  source: { kind: 'test', ref: 'grid' },
  resolution: [1280, 720],
  opacity: 1,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blend: 'normal'
}

const defaultMappingCue = {
  id: '',
  name: '',
  key: '',
  fade: 0.6,
  hold: 0,
  // OPTIONAL: id of a lighting-desk scene (/light) recalled when the cue
  // fires. Absent unless set, so older documents round-trip unchanged.
  lightScene: '',
  lightLook: '',
  // Per-surface state keyed by surface id. GEOMETRY IS DELIBERATELY NOT IN A
  // CUE: corners and masks are the wall, cues are the show.
  surfaces: {}
}

const defaultMappingReference = {
  url: '',
  opacity: 0.5,
  visible: false
}

const defaultMappingState = {
  output: { width: 1920, height: 1080 },
  background: '#000000',
  surfaces: [],
  cues: [],
  reference: defaultMappingReference,
  grid: 0,
  // Seconds a surface takes to reach a new opacity. 0 while somebody is
  // editing; a cue writes its own fade here in the same op batch that changes
  // the surfaces, and CSS transitions read the AFTER style, so the browser
  // animates with the duration the cue just asked for.
  fade: 0
}

const defaultWorkspaceState = {
  selectedNodeId: null,
  // Which universe.world node is the "live"/output one for a given scope — a flat
  // map keyed by scopeId (root scope key is '') so it works uniformly without a
  // container node to hold a values field. At most one live world per scope.
  liveWorldNodeIdByScope: {},
  // Generalizes liveWorldNodeIdByScope to any scope-repeatable type where
  // exactly one "active" result is wanted (world.light/world.background/
  // world.grid) — a hierarchy-as-connection picker, not a schema-level
  // restriction. Keyed by `${typeId}::${scopeId}` (root scope key is '').
  activeNodeIdByTypeScope: {}
}

const defaultProjectDocument = {
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
  mappingState: defaultMappingState,
  windowLayout: defaultWindowLayout,
  assets: []
}

const buildDefaultComponentsForType = (type = 'box') => {
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
const buildCreationComponentsForType = (type = 'box') => {
  const base = buildDefaultComponentsForType(type)
  if (type === 'video') {
    // A video added to a space is expected to bring its sound with it,
    // placed in the room rather than playing flat at a constant volume.
    base.media = { ...base.media, spatial: true, muted: false }
  }
  return base
}

const normalizeAsset = (asset = {}) => ({
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

const normalizeWindowLayout = (layout = {}) => {
  const source = layout && typeof layout === 'object' ? layout : {}
  const windows = {}
  WINDOW_IDS.forEach((windowId) => {
    windows[windowId] = normalizeWindowState(windowId, source.windows?.[windowId], defaultWindowLayout.windows[windowId])
  })
  const requestedActive = ensureString(source.activeWindowId, defaultWindowLayout.activeWindowId)
  return {
    activeWindowId: windows[requestedActive] ? requestedActive : defaultWindowLayout.activeWindowId,
    windows
  }
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
const normalizeAuthor = (author) => {
  if (!author || typeof author !== 'object') return null
  const subject = ensureString(author.subject, '')
  if (!subject) return null
  return { subject, label: ensureString(author.label, '') }
}

const normalizeEntity = (entity = {}) => {
  const rawType = ensureString(entity.type, 'box')
  const type = ENTITY_TYPES.has(rawType) ? rawType : 'box'
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
      href: ensureString(sourceComponents.link?.href, defaultComponents.link?.href || '')
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

const { normalizePlacement } = require('./placement.cjs')

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
    // authored object opens the distance for VAST scenes — the walker's camera
    // far plane follows it (LiveProjectScene) — and can recolour or switch it
    // off. Colour matters because fog was previously locked to the background,
    // which is an invisible fog on a light ground: a white room just ended.
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

const RENDER_TONE_MAPPINGS = new Set(['ACESFilmic', 'none'])

const normalizeRenderSettings = (settings = {}) => {
  const source = settings && typeof settings === 'object' ? settings : {}
  return {
    ...cloneValue(defaultRenderSettings),
    ...cloneValue(source),
    shadows: ensureBoolean(source.shadows, defaultRenderSettings.shadows),
    antialias: ensureBoolean(source.antialias, defaultRenderSettings.antialias),
    toneMapping: RENDER_TONE_MAPPINGS.has(source.toneMapping) ? source.toneMapping : defaultRenderSettings.toneMapping,
    toneMappingExposure: Math.max(0, ensureNumber(source.toneMappingExposure, defaultRenderSettings.toneMappingExposure)),
    dprMin: Math.max(0.5, ensureNumber(source.dprMin, defaultRenderSettings.dprMin)),
    dprMax: Math.max(0.5, ensureNumber(source.dprMax, defaultRenderSettings.dprMax))
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

const normalizePresentationState = (presentation = {}, worldState = defaultWorldState) => {
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

const normalizePublishState = (publish = {}) => {
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

const normalizeShowState = (show = {}) => {
  const source = show && typeof show === 'object' ? show : {}
  return {
    clockEpoch: Math.max(0, ensureNumber(source.clockEpoch, defaultShowState.clockEpoch))
  }
}

const MAPPING_SOURCE_KINDS = ['project', 'url', 'video', 'image', 'colour', 'test', 'camera']
const MAPPING_BLEND_MODES = ['normal', 'screen', 'multiply', 'lighten', 'add']

const normalizePoint = (point, fallback = [0, 0]) => {
  if (!Array.isArray(point)) return [...fallback]
  return [ensureNumber(point[0], fallback[0]), ensureNumber(point[1], fallback[1])]
}

const normalizeCorners = (corners) => {
  const source = Array.isArray(corners) ? corners : []
  return defaultMappingSurface.corners.map((fallback, index) => normalizePoint(source[index], fallback))
}

// A mask of one or two points is one being DRAWN — the operator has clicked
// the first corners of a shape and not closed it yet — so the points are kept.
// Nothing is clipped until there are three (maskToClipPath), which is what
// "fewer than three cannot enclose anything" actually means.
const normalizeMask = (mask) => {
  if (!Array.isArray(mask)) return []
  return mask.map((point) => normalizePoint(point))
}

const normalizeMappingSurface = (surface = {}) => {
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
    blend: MAPPING_BLEND_MODES.includes(blend) ? blend : defaultMappingSurface.blend
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

const normalizeMappingCue = (cue = {}) => {
  const source = cue && typeof cue === 'object' ? cue : {}
  const rawSurfaces = source.surfaces && typeof source.surfaces === 'object' ? source.surfaces : {}
  const surfaces = {}
  Object.entries(rawSurfaces).forEach(([surfaceId, state]) => {
    const id = ensureString(surfaceId)
    if (!id) return
    const patch = normalizeCueSurface(state)
    if (Object.keys(patch).length) surfaces[id] = patch
  })
  const key = ensureString(source.key, '')
  const lightScene = ensureString(source.lightScene, '')
  // A look and a scene are both ids, and nothing about an id says which it is, so the
  // cue keeps them apart. A look wins when both are set: the desk is built on looks now,
  // and a cue that has been re-pointed at one has said what it means.
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

const normalizeMappingReference = (reference = {}) => {
  const source = reference && typeof reference === 'object' ? reference : {}
  return {
    url: ensureString(source.url, ''),
    opacity: Math.min(1, Math.max(0, ensureNumber(source.opacity, defaultMappingReference.opacity))),
    visible: ensureBoolean(source.visible, defaultMappingReference.visible)
  }
}

const normalizeMappingState = (mapping = {}) => {
  const source = mapping && typeof mapping === 'object' ? mapping : {}
  const output = source.output && typeof source.output === 'object' ? source.output : {}
  const surfaces = Array.isArray(source.surfaces) ? source.surfaces : []
  const seen = new Set()
  const seenCues = new Set()
  return {
    output: {
      width: Math.max(1, ensureNumber(output.width, defaultMappingState.output.width)),
      height: Math.max(1, ensureNumber(output.height, defaultMappingState.output.height))
    },
    background: ensureString(source.background, defaultMappingState.background),
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
    fade: Math.max(0, Math.min(30, ensureNumber(source.fade, defaultMappingState.fade)))
  }
}

const normalizeProjectMeta = (meta = {}) => {
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
// Hand-mirrored from src/shared/projectSchema.js. Eight math types and two
// logic types became two operators with an operation menu; documents made
// before that hold `math.add` nodes with real wires, and a saved project is
// somebody's work. The server rebuilds every document through this file, so
// if only the ESM side knew the migration the server would keep resurrecting
// the retired type ids on the next sync. serverXR/src/schemaSync.test.js
// holds the two together with a fixture.
const LEGACY_OPERATOR_TYPES = {
  'math.add': { typeId: 'math.op', operation: 'add' },
  'math.subtract': { typeId: 'math.op', operation: 'subtract' },
  'math.multiply': { typeId: 'math.op', operation: 'multiply' },
  'math.divide': { typeId: 'math.op', operation: 'divide' },
  'math.mod': { typeId: 'math.op', operation: 'modulo' },
  'math.pow': { typeId: 'math.op', operation: 'power' },
  'math.sin': { typeId: 'math.op', operation: 'sin' },
  'math.abs': { typeId: 'math.op', operation: 'absolute' },
  'logic.gate': { typeId: 'logic.route', operation: 'gate' },
  'logic.switch': { typeId: 'logic.route', operation: 'switch' }
}

// Keyed by the NEW type: Sin/Absolute took `in`, Gate took `value`/`open`,
// and neither merged type declares a port by any of those names.
const LEGACY_OPERATOR_PORTS = {
  'math.op': { in: 'a' },
  'logic.route': { value: 'a', open: 'pick' }
}

const migrateLegacyNodeTypeId = (typeId) => LEGACY_OPERATOR_TYPES[typeId]?.typeId || typeId

const migrateLegacyPortId = (typeId, portId) => LEGACY_OPERATOR_PORTS[typeId]?.[portId] || portId

const nodeTypeIds = (nodesById) => new Map([...nodesById].map(([id, node]) => [id, node.typeId]))

const migrateEdgeToPort = (edge, typeIdByNodeId) => {
  if (!edge) return edge
  const typeId = typeIdByNodeId?.get?.(edge.toNodeId)
  const toPort = migrateLegacyPortId(typeId, edge.toPort)
  return toPort === edge.toPort ? edge : { ...edge, toPort }
}

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

const normalizeProjectNode = (node = {}) => {
  const source = node && typeof node === 'object' ? node : {}
  const declaredTypeId = ensureString(source.typeId, ensureString(source.definitionId, ''))
  if (!declaredTypeId) return null
  if (LEGACY_ROOT_TYPE_IDS.has(declaredTypeId)) return null
  if (LEGACY_ROOT_NODE_IDS.has(source.id)) return null

  const merged = LEGACY_OPERATOR_TYPES[declaredTypeId]
  const typeId = merged ? merged.typeId : declaredTypeId

  const values = mergeLegacyValues(source)
  if (merged) values.operation = merged.operation
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

const normalizeProjectEdge = (edge = {}) => {
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

const normalizeWorkspaceState = (workspace = {}) => {
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
  // instead of riding along forever. Mirrors src/shared/projectSchema.js.
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

const normalizeProjectDocument = (document = {}) => {
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
    mappingState: normalizeMappingState(source.mappingState),
    windowLayout: normalizeWindowLayout(source.windowLayout),
    assets: Array.isArray(source.assets) ? source.assets.map(normalizeAsset) : []
  }
}

const mergePatch = (target, patch) => {
  if (Array.isArray(patch)) {
    return cloneValue(patch)
  }
  if (!patch || typeof patch !== 'object') {
    return patch
  }
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

const applyProjectOps = (document, ops = []) => {
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
        // Pin the id: a patch carrying `id` would otherwise store an entity
        // whose id differs from its map key — serialized out as a
        // duplicate/orphan id and silently lost on next apply.
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
          // parentId is patchable to anything, so cycles can exist — without
          // this guard a cycle recurses to RangeError and the involved
          // entities become permanently undeletable.
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
        // Every other update op (updateEntity/updateComponent) routes its
        // merged result back through its normalizer before storing; this one
        // didn't, so an updateNode op's `values` patch landed completely
        // unchecked. normalizeProjectNode is a no-op on an already-well-formed
        // node, so this only adds the missing guard.
        const normalized = normalizeProjectNode(merged)
        if (normalized) nodes.set(nodeId, normalized)
        break
      }
      case 'reparentNode': {
        const nodeId = ensureString(payload.nodeId)
        if (!nodeId || !nodes.has(nodeId)) break
        const nextParentId = payload.parentId ? ensureString(payload.parentId) : null
        // The destination must exist. A parentId naming nothing puts the node in
        // no scope's child list, reachable from no Enter and visible on no
        // canvas — silent loss, not an error.
        if (nextParentId && !nodes.has(nextParentId)) break
        // …and the node must not become its own ancestor. deleteNode's collect()
        // guards against cycles it FINDS; this stops one being made.
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
        // ONE op, applied whole or not at all — mirror of
        // src/shared/projectSchema.js. As four loose ops the reducer would
        // refuse the parentId while still applying the coordinates, and a 409'd
        // batch is resubmitted verbatim.
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
        const toDelete = new Set()
        const collect = (id) => {
          // parentId is patchable to anything, so cycles can exist — without
          // this guard a cycle recurses to RangeError and the involved nodes
          // become permanently undeletable.
          if (toDelete.has(id)) return
          toDelete.add(id)
          for (const [, child] of nodes) {
            if (child.parentId === id) collect(child.id)
          }
        }
        collect(nodeId)
        // A doorway node puts a socket on its CONTAINER's outer face, and the
        // wire to that socket names the container, not the door — so deleting
        // the door leaves an edge whose endpoints both still exist. Nothing
        // else would ever remove it: createEdge validates endpoint nodes only,
        // and normalizeEdgesList drops edges by missing node id, never by
        // missing port. Swept here, where the door's id is still known.
        // Mirror of src/shared/projectSchema.js — if only the client copy had
        // this, the wire would vanish locally and be resurrected by the
        // server's replay on the next sync.
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
        // A stored op log replayed from the beginning carries wires aimed at
        // ports the merged operator no longer declares.
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
      case 'setMappingState': {
        const patch = payload.patch || {}
        nextDocument.mappingState = normalizeMappingState({
          ...nextDocument.mappingState,
          ...patch,
          // A doc-level patch never rewrites the surfaces or the cues
          // wholesale; that is what the surface and cue ops are for.
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
        // `surfaces` REPLACES rather than merges — a removal would otherwise
        // be silently impossible.
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
          // Every cue forgets it too.
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
          [windowId]: normalizeWindowState(
            windowId,
            mergePatch(nextDocument.windowLayout.windows[windowId], payload.patch || {}),
            defaultWindowLayout.windows[windowId]
          )
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
// Guards mirror this runtime's applyProjectOps: ops that would no-op there
// invert to []. Creates whose payload lacks an id invert to [] — apply would
// generate a random id the inverse could never reference.
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
      // Puts the node back in the scope it came FROM, and back where it sat
      // there. Mirror of src/shared/projectSchema.js.
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
      // A doorway's exterior wire names the CONTAINER and the door's id, and
      // the container is not in toDelete — so the delete sweep removes it while
      // this filter alone would never restore it, and undo would silently drop
      // a wire the user still had. Mirror of src/shared/projectSchema.js.
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
const invertProjectOps = (document, ops = []) => {
  let sim = normalizeProjectDocument(document)
  const groups = []
  ops.forEach((op) => {
    const inverse = invertSingleOp(sim, op)
    if (inverse.length) groups.push(inverse)
    sim = applyProjectOps(sim, [op])
  })
  return groups.reverse().flat()
}

module.exports = {
  PROJECT_DOCUMENT_VERSION,
  ENTITY_TYPES: Array.from(ENTITY_TYPES),
  WINDOW_IDS,
  defaultProjectDocument,
  defaultPresentationState,
  defaultPresentationFixedCamera,
  defaultPublishState,
  defaultWorldState,
  defaultRenderSettings,
  defaultXrState,
  defaultWindowLayout,
  defaultWorkspaceState,
  defaultMappingState,
  defaultMappingSurface,
  defaultMappingCue,
  defaultMappingReference,
  buildDefaultComponentsForType,
  buildCreationComponentsForType,
  cloneValue,
  ensureVector,
  generateId,
  mergePatch,
  normalizeAsset,
  normalizeAuthor,
  normalizeEntity,
  normalizePresentationState,
  normalizePublishState,
  normalizeProjectDocument,
  normalizeProjectNode,
  normalizeProjectEdge,
  normalizeProjectMeta,
  migrateLegacyNodeTypeId,
  migrateEdgeToPort,
  normalizeMappingState,
  normalizeMappingSurface,
  normalizeMappingCue,
  normalizeMappingReference,
  normalizeWindowLayout,
  normalizeWorkspaceState,
  applyProjectOps,
  invertProjectOps
}
