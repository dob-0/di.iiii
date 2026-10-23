'use strict'

// The server's twin of src/project/layers.js — WHAT INSIDE WHAT.
//
// The server lists a space's projects and says what each one holds, so it runs
// the same rule. It cannot load the browser's node registry, so the two lists
// of node kinds below are written out by hand; src/project/layers.test.js
// checks them against the registry and runs the same fixture projects through
// both files. Change one file, change the other.
//
// Only the counts are used here (the project list's card line). Which layers
// are OPEN is decided in the browser, once the project has loaded; nothing
// here stores a count or a kind (serverXR/src/routes/projectRoutes.js).

// The 18 node kinds that stand in the room (render: 'spatial-3d').
const STANDING_NODE_KINDS = new Set([
  'geom.circle', 'geom.cone', 'geom.constructor', 'geom.cube', 'geom.cylinder',
  'geom.geo', 'geom.line', 'geom.model', 'geom.plane', 'geom.points', 'geom.sphere', 'geom.torus',
  'light.point', 'media.audio', 'media.video', 'universe.desk.3d', 'world.camera',
  'world.light'
])

// Windows: furniture, neither a thing nor a connection.
const WINDOW_NODE_KINDS = new Set([
  'agent', 'agent.keeper', 'stream.monitor', 'view.desk', 'view.director',
  'view.inspector', 'view.library', 'view.outliner', 'view.publish',
  'view.timeline', 'work.agent', 'work.status'
])

const LAMP_OBJECT_TYPES = new Set(['pointLight', 'spotLight', 'directionalLight', 'ambientLight'])
const PICTURE_OUT = 'top.out'

const list = (value) => (Array.isArray(value) ? value : [])
const text = (value) => (typeof value === 'string' ? value.trim() : '')

const joinedToFixture = (entity) => {
  const index = Number(entity && entity.components && entity.components.fixture && entity.components.fixture.index)
  return Number.isInteger(index) && index > 0
}

// Bytes of a string as UTF-8, counted by hand so this file and its browser twin
// give the same number for the same page (a lone surrogate counts 3, as in
// Buffer.byteLength and TextEncoder).
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
  const size = Number(asset && asset.size)
  return Number.isFinite(size) && size > 0 ? size : 0
}

const mediaAssetId = (entity) =>
  text(entity && entity.components && entity.components.media && entity.components.media.assetId)

// A stage fixture: the rig builder's lamp (src/rigbuild/autoPatch.js isLamp, a
// typed components.fixture) or a light joined to a fixture of the lighting desk.
// Measured on 13 real MOXIR documents of 10-09 and 10-13: 1374 of 1374 spots
// carry a typed fixture, only 96 carry an index.
const typedFixture = (entity) => {
  const type = entity && entity.components && entity.components.fixture && entity.components.fixture.type
  return typeof type === 'string' && type !== ''
}
const stageLamp = (entity) => joinedToFixture(entity) || typedFixture(entity)

const countProjectLayers = (document) => {
  const doc = document || {}
  const entities = list(doc.entities)
  const nodes = list(doc.nodes)
  const edges = list(doc.edges)
  const mapping = doc.mappingState || {}
  const cues = list(mapping.cues)
  const publish = doc.publishState || {}
  const presentation = doc.presentationState || {}
  const lampObjects = entities.filter((entity) => LAMP_OBJECT_TYPES.has(entity && entity.type))
  const typeOf = (node) => node && node.typeId
  const standingNodes = nodes.filter((node) => STANDING_NODE_KINDS.has(typeOf(node))).length
  // Files (document.assets). The file a picture or a video shows is counted
  // with that picture or video, not once more as a file; the size is all of them.
  const images = entities.filter((entity) => entity && entity.type === 'image')
  const videos = entities.filter((entity) => entity && entity.type === 'video')
  const shown = new Set([...images, ...videos].map(mediaAssetId).filter(Boolean))
  const held = new Map()
  list(doc.assets).forEach((asset, index) => {
    const key = text(asset && asset.id) || `#${index}`
    if (!held.has(key)) held.set(key, assetSize(asset))
  })
  const page = presentation.mode === 'code'
    || Boolean(text(presentation.codeHtml) || text(presentation.codeUrl) || list(presentation.codeFiles).length)
  return {
    objects: entities.length,
    standingNodes,
    things: entities.length + standingNodes,
    lamps: lampObjects.length,
    joinedLamps: lampObjects.filter(joinedToFixture).length,
    stageLamps: lampObjects.filter(stageLamp).length,
    nodes: nodes.filter((node) => !STANDING_NODE_KINDS.has(typeOf(node)) && !WINDOW_NODE_KINDS.has(typeOf(node))).length,
    wires: edges.length,
    surfaces: list(mapping.surfaces).length,
    pictureOuts: nodes.filter((node) => typeOf(node) === PICTURE_OUT).length,
    cues: cues.length,
    lightCues: cues.filter((cue) => text(cue && cue.lightScene) || text(cue && cue.lightLook)).length,
    images: images.length,
    videos: videos.length,
    files: [...held.keys()].filter((key) => !shown.has(key)).length,
    fileBytes: [...held.values()].reduce((sum, size) => sum + size, 0),
    templates: list(doc.templates).length,
    shared: Boolean(publish.shareEnabled),
    exported: Number(publish.lastExportAt) > 0,
    page,
    pageBytes: page ? pageSize(presentation) : 0
  }
}

module.exports = {
  STANDING_NODE_KINDS,
  WINDOW_NODE_KINDS,
  LAMP_OBJECT_TYPES,
  countProjectLayers
}
