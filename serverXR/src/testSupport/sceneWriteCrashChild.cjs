// A scene write that is killed (SIGKILL — no cleanup, no finally, no exit
// hooks) at one named step. Run by sceneWrite.test.js as a child process, so
// the crash is a real one: a dead process, a SQLite file with whatever the
// kill left in its write-ahead log, and whatever files were on disk.
//
//   node sceneWriteCrashChild.cjs <dataDir> <step>
//
// <step>: afterStage | insideCommit | afterCommit | afterRename
// The space `room` must already exist at version 1 with object `one`.

const path = require('node:path')
const { initDb, getDb } = require('../db')
const { createSpaceStore } = require('../spaceStore')
const { createSceneWriter } = require('../sceneWrite')

const [dataDir, crashAt] = process.argv.slice(2)
const die = () => process.kill(process.pid, 'SIGKILL')

initDb(path.join(dataDir, 'di.db'))
const store = createSpaceStore({ spacesDir: path.join(dataDir, 'spaces'), blankScene: { objects: [] } })

// insideCommit: the version check, op insert and version bump have all run,
// and the process dies before COMMIT. The compat layer runs a nested
// transaction inline, so this is the real transaction, killed half done.
const commitSceneOps = crashAt === 'insideCommit'
  ? (args) => getDb().transaction(() => { store.commitSceneOps(args); die() }, { immediate: true })()
  : store.commitSceneOps

const writer = createSceneWriter({
  getSpacePaths: store.getSpacePaths,
  commitSceneOps,
  readSceneVersion: store.readSceneVersion,
  log: { info() {}, warn() {}, error() {} },
  hooks: { [crashAt]: die }
})

const op = { opId: 'two', type: 'addObject', payload: { object: { id: 'two', type: 'box' } }, version: 2, timestamp: Date.now() }
writer.withSceneWriteLock('room', () => writer.commitSceneWrite({
  spaceId: 'room',
  baseVersion: 1,
  ops: [op],
  scene: { objects: [{ id: 'one', type: 'box' }, { id: 'two', type: 'box' }] }
})).then(() => {
  // The step never came: say so, so the test cannot pass on a write that
  // simply finished.
  process.stdout.write(`finished without reaching ${crashAt}\n`)
  process.exit(3)
})
