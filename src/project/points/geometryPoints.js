// A geometry wire, turned into a point cloud — the Points node's source.
//
// Walks the descriptor with Laser Trace's walk (walkPieces: the renderer's own
// prune, caps and transform order) and builds each piece's mesh with the same
// BufferGeometry the viewport draws (meshOf: same arguments, same segment
// counts), so a cloud sampled from a wired Cube lies exactly on the cube that
// Cube would stand as. three.js core only, no WebGL: it runs in a unit test.
//
// A Line has no surface, so it gives no points; everything else does, in
// proportion to its area across the whole wire (areaPoints).
import { Vector3 } from 'three'
import { meshOf, walkPieces } from '../nodes/laser.trace/laserTrace.js'
import { areaPoints, seededRandom } from './surfacePoints.js'

/**
 * Every surface triangle a descriptor draws, in the wire's own frame, flat and
 * non-indexed (nine numbers per triangle). An empty or invalid wire gives an
 * empty array.
 */
export const geometryTriangles = (descriptor) => {
    const chunks = []
    let length = 0
    const point = new Vector3()
    for (const { shape, matrix } of walkPieces(descriptor)) {
        if (shape.kind === 'line') continue
        const mesh = meshOf(shape)
        if (!mesh) continue
        const flat = mesh.index ? mesh.toNonIndexed() : mesh
        const source = flat.getAttribute('position')
        const out = new Float32Array(source.count * 3)
        for (let i = 0; i < source.count; i++) {
            point.fromBufferAttribute(source, i).applyMatrix4(matrix)
            out[i * 3] = point.x
            out[i * 3 + 1] = point.y
            out[i * 3 + 2] = point.z
        }
        mesh.dispose()
        if (flat !== mesh) flat.dispose()
        chunks.push(out)
        length += out.length
    }
    const all = new Float32Array(length)
    let offset = 0
    for (const chunk of chunks) {
        all.set(chunk, offset)
        offset += chunk.length
    }
    return all
}

/**
 * `count` points over the surface a descriptor draws, the same points for the
 * same wire and seed on every load.
 */
export const geometryPoints = (descriptor, count, seed = 1) =>
    areaPoints(geometryTriangles(descriptor), null, count, seededRandom(seed))
