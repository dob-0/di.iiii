// Laser File: an ILDA or SVG file's bytes in, laser paths (frame v2) out — see laserFile.js. The bytes are
// not in node.values (src is an assetId, the Model/Video/Sound convention): the editor's LaserFileFeed
// fetches the asset and publishes its bytes on the live side channel as `${node.id}:bytes`. One read per
// evaluation serves the three ports.
import { isIldaBytes } from './ildaFile.js'
import { readLaserFile } from './laserFile.js'

const last = new Map()
const LAST_MAX = 256

const readFor = (node, { input, asNumber, context }) => {
    const src = input('src')
    const bytes = context?.liveOutputs?.get(`${node.id}:bytes`)
    const fps = asNumber(input('fps'), 0)
    const index = Math.floor(asNumber(input('frame'), 0)) + (fps > 0 ? Math.floor((asNumber(context?.now, 0) / 1000) * fps) : 0)
    const colour = input('colour')
    const options = {
        index,
        size: asNumber(input('size'), 1),
        height: asNumber(input('height'), 0),
        colour: typeof colour === 'string' && colour ? colour : null,
        level: asNumber(input('level'), 1),
        tolerance: asNumber(input('tolerance'), 0.002),
    }
    // Only an ILDA file has frames to step through: an SVG's key leaves the index out, so Speed > 0 does
    // not flatten the same drawing again at every frame step.
    const key = JSON.stringify([src, bytes && isIldaBytes(bytes) ? options : { ...options, index: 0 }])
    const hit = last.get(node.id)
    if (hit && hit.key === key && hit.bytes === bytes) return hit.result
    let result
    if (typeof src !== 'string' || !src) result = { frame: undefined, status: 'No file chosen', frames: 0 }
    else if (!bytes) result = { frame: undefined, status: 'Loading the file', frames: 0 }
    else {
        const read = readLaserFile(bytes, options)
        result = read.ok ? { frame: read.frame, status: read.status, frames: read.frames } : { frame: undefined, status: read.status, frames: 0 }
    }
    if (last.size >= LAST_MAX) last.clear()
    last.set(node.id, { key, bytes, result })
    return result
}

export const computeOutput = (node, portId, helpers) => {
    if (portId === 'frame') return readFor(node, helpers).frame
    if (portId === 'status') return readFor(node, helpers).status
    if (portId === 'frames') return readFor(node, helpers).frames
    return undefined
}
