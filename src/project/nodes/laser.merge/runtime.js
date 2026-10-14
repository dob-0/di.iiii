// Laser Merge: two laser values in (v2 paths or legacy frames), one path set out — TD Merge semantics.
// 'kept' order only if both inputs are kept. Chain for more, as Merge and Math do. Nothing wired: nothing.
import { mergeLaserPaths } from '../../../shared/laserFrame.js'

export const computeOutput = (node, portId, { input }) => {
    if (portId !== 'frame') return undefined
    return mergeLaserPaths([input('a'), input('b')])
}
