// The trial of a changed shared/laserShapes.cjs + laserLook.cjs, on a worker thread (laserLive.js checkSources), so the
// thread that feeds the cubes never waits for it.
'use strict'

const { parentPort, workerData } = require('worker_threads')
const { checkSources } = require('./laserLive')

let result
try {
    result = checkSources(workerData)
} catch (error) {
    result = { ok: false, error: `the trial failed: ${error?.message || error}` }
}
parentPort.postMessage(result)
