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

// The 17 node kinds that stand in the room (render: 'spatial-3d').
const STANDING_NODE_KINDS = new Set([
  'geom.circle', 'geom.cone', 'geom.constructor', 'geom.cube', 'geom.cylinder',
  'geom.geo', 'geom.line', 'geom.model', 'geom.plane', 'geom.sphere', 'geom.torus',
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
  return {
    objects: entities.length,
    standingNodes,
    things: entities.length + standingNodes,
    lamps: lampObjects.length,
    joinedLamps: lampObjects.filter(joinedToFixture).length,
    nodes: nodes.filter((node) => !STANDING_NODE_KINDS.has(typeOf(node)) && !WINDOW_NODE_KINDS.has(typeOf(node))).length,
    wires: edges.length,
    surfaces: list(mapping.surfaces).length,
    pictureOuts: nodes.filter((node) => typeOf(node) === PICTURE_OUT).length,
    cues: cues.length,
    lightCues: cues.filter((cue) => text(cue && cue.lightScene) || text(cue && cue.lightLook)).length,
    shared: Boolean(publish.shareEnabled),
    exported: Number(publish.lastExportAt) > 0,
    page: presentation.mode === 'code'
      || Boolean(text(presentation.codeHtml) || text(presentation.codeUrl) || list(presentation.codeFiles).length)
  }
}

module.exports = {
  STANDING_NODE_KINDS,
  WINDOW_NODE_KINDS,
  LAMP_OBJECT_TYPES,
  countProjectLayers
}
