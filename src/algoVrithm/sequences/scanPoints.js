// Turning the photogrammetry mesh into a point cloud — the pure half of
// ScanRoom, same division of labour as scanShards.js: arrays in, arrays out,
// no three.js, no canvas, so the claims worth testing need no GPU.
//
// Points are sampled ON THE TRIANGLES, not taken from the vertices. Two
// reasons. Vertex density is whatever the scanner happened to leave, so a
// vertex cloud is dense where the reconstruction dithered and sparse across
// clean walls — sampling by triangle puts points where there is SURFACE.
// And a vertex belongs to many triangles at once, so it has no single answer
// to "which texture do I sample?", while a point on a triangle inherits its
// triangle's material slot for free.
//
// The stretched-triangle cull is the same rule as the shard cut and for the
// same reason: real surfaces in this scan are dense, so a long edge IS the
// reconstruction guessing across a hole it never saw. A point cloud makes the
// cull even cheaper to afford — dropping a smear here just means no points on
// it, not a hole in a wall, because there are no walls any more.

/**
 * Sample a point cloud over an indexed, textured triangle mesh.
 *
 * @param positions flat xyz vertex array
 * @param uvs       flat uv vertex array
 * @param index     flat triangle index array, three entries per triangle
 * @param groups    geometry group ranges [{ start, count, materialIndex }] in
 *                  index space, or null for a single-material mesh
 * @param edgeLimit longest believed triangle edge, in model units
 * @param samplesPerTriangle points scattered on each surviving triangle
 * @param random    seeded generator — the cloud is part of the piece's look,
 *                  so it must be the same cloud on every load
 * @returns { positions, uvs, slots, count } — flat arrays over the points,
 *          `slots[i]` naming the material of point i's source triangle
 */
export const cloudPoints = (positions, uvs, index, {
    groups = null,
    edgeLimit = 0.45,
    samplesPerTriangle = 2,
    random = () => 0.5
} = {}) => {
    const limitSq = edgeLimit * edgeLimit
    const triangleCount = Math.floor(index.length / 3)

    const slotOfTriangle = (triangle) => {
        if (!groups) return 0
        const indexPosition = triangle * 3
        for (const group of groups) {
            if (indexPosition >= group.start && indexPosition < group.start + group.count) {
                return group.materialIndex ?? 0
            }
        }
        return 0
    }

    const outPositions = []
    const outUvs = []
    const outSlots = []

    for (let triangle = 0; triangle < triangleCount; triangle++) {
        const i0 = index[triangle * 3]
        const i1 = index[triangle * 3 + 1]
        const i2 = index[triangle * 3 + 2]

        const ax = positions[i0 * 3]
        const ay = positions[i0 * 3 + 1]
        const az = positions[i0 * 3 + 2]
        const bx = positions[i1 * 3]
        const by = positions[i1 * 3 + 1]
        const bz = positions[i1 * 3 + 2]
        const cx = positions[i2 * 3]
        const cy = positions[i2 * 3 + 1]
        const cz = positions[i2 * 3 + 2]

        const ab = (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2
        const bc = (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2
        const ca = (ax - cx) ** 2 + (ay - cy) ** 2 + (az - cz) ** 2
        if (Math.max(ab, bc, ca) > limitSq) continue

        const slot = slotOfTriangle(triangle)

        for (let sample = 0; sample < samplesPerTriangle; sample++) {
            // Uniform barycentric sampling: fold the unit square's far half
            // back across the diagonal, so points cover the triangle evenly
            // instead of crowding its first vertex.
            let r1 = random()
            let r2 = random()
            if (r1 + r2 > 1) {
                r1 = 1 - r1
                r2 = 1 - r2
            }
            const r0 = 1 - r1 - r2

            outPositions.push(
                ax * r0 + bx * r1 + cx * r2,
                ay * r0 + by * r1 + cy * r2,
                az * r0 + bz * r1 + cz * r2
            )
            outUvs.push(
                uvs[i0 * 2] * r0 + uvs[i1 * 2] * r1 + uvs[i2 * 2] * r2,
                uvs[i0 * 2 + 1] * r0 + uvs[i1 * 2 + 1] * r1 + uvs[i2 * 2 + 1] * r2
            )
            outSlots.push(slot)
        }
    }

    return {
        positions: Float32Array.from(outPositions),
        uvs: Float32Array.from(outUvs),
        slots: Uint8Array.from(outSlots),
        count: outSlots.length
    }
}
