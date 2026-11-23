// The Laser node's geometry moved to shared/laserShapes.cjs (2026-10-29), so the laser desk on the server
// (serverXR/src/laser/laserDesk.js) draws exactly the shapes this node does. src/shared/laserShapes.js is its
// generated browser twin (scripts/laser/laser-frame-twin.mjs); this file keeps the node's old import path.
export * from '../../../shared/laserShapes.js'
