// Laser Trace: geometry in, laser paths (frame v2) out — see laserTrace.js. The frame and the status come
// from one trace per evaluation: a node asked for both ports with the same inputs traces once.
import { traceGeometry } from './laserTrace.js'

const last = new Map()
const LAST_MAX = 256

const traceFor = (node, { input, asNumber, asVec3 }) => {
    const geometry = input('geometry')
    const options = {
        mode: input('mode'),
        view: input('view'),
        size: asNumber(input('size'), 0),
        position: asVec3(input('position'), [0, 0, 6]),
        aim: asVec3(input('aim'), [0, 0, 0]),
        angle: asNumber(input('angle'), 30),
        colour: input('colour'),
        level: asNumber(input('level'), 1),
    }
    const key = JSON.stringify([geometry, options])
    const hit = last.get(node.id)
    if (hit && hit.key === key) return hit.result
    let result
    if (!geometry || typeof geometry !== 'object') {
        result = { frame: undefined, status: 'No shape wired in' }
    } else {
        const { frame, stats } = traceGeometry(geometry, options)
        result = { frame, status: `${stats.paths} paths, ${stats.points} points, ${stats.ms.toFixed(2)} ms` }
    }
    if (last.size >= LAST_MAX) last.clear()
    last.set(node.id, { key, result })
    return result
}

export const computeOutput = (node, portId, helpers) => {
    if (portId === 'frame') return traceFor(node, helpers).frame
    if (portId === 'status') return traceFor(node, helpers).status
    return undefined
}
