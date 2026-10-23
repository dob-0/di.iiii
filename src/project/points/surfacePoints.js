// Turning a triangle mesh into a point cloud — arrays in, arrays out, no
// three.js, no canvas, so the claims worth testing need no GPU.
//
// Born inside a work (algoVrithm's scan room, as scanPoints.js) and moved here
// on 2026-10-21 when the Points node needed the same sampler: a work may import
// the platform, never the other way round (src/works/boundary.test.js). Two
// samplers live here. cloudPoints is the work's: a fixed number of points per
// triangle, with a cull for the stretched triangles a photogrammetry scan
// leaves. areaPoints is the node's: exactly Count points, each triangle
// receiving its share by AREA, so a big face and a small one look equally dense.
//
// Points are sampled ON THE TRIANGLES, not taken from the vertices. Two
// reasons. Vertex density is whatever the modeller or scanner happened to
// leave, so a vertex cloud is dense where the mesh dithered and sparse across
// clean walls — sampling by triangle puts points where there is SURFACE.
// And a vertex belongs to many triangles at once, so it has no single answer
// to "which texture do I sample?", while a point on a triangle inherits its
// triangle's material slot for free.
//
// The stretched-triangle cull (cloudPoints only): real surfaces in a scan are
// dense, so a long edge IS the reconstruction guessing across a hole it never
// saw. Dropping a smear just means no points on it, not a hole in a wall.

/**
 * Deterministic pseudo-random numbers (mulberry32). A cloud is part of a
 * scene's look, so it must be the same cloud on every load: change the seed to
 * get a different scatter on purpose, never by accident. Not for security.
 */
export const seededRandom = (seed = 1) => {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) >>> 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// The most points one Points node draws, and the cap on a phone or for a
// visitor who asked the system for less motion. Measured from the works that
// build clouds by hand today: 120,000 particles on a desktop and 60,000 on a
// phone is what the two photograph-morph pieces settled on, and the largest
// scan cloud shipped is 89,999 points, inside both.
export const MAX_POINTS = 120000
export const MAX_POINTS_LIGHT = 60000

/**
 * How many points to draw: the asked Count, whole, at least 0, never past the
 * cap for this device. `light` is true on a phone (coarse pointer) or under
 * prefers-reduced-motion — the caller reads both, this stays pure.
 */
export const pointBudget = (count, { light = false } = {}) => {
    const asked = Number(count)
    if (!Number.isFinite(asked) || asked <= 0) return 0
    return Math.min(light ? MAX_POINTS_LIGHT : MAX_POINTS, Math.floor(asked))
}

/**
 * Scatter exactly `count` points over an indexed triangle mesh, each triangle
 * getting points in proportion to its area (one cumulative-area table, one
 * binary search per point). Degenerate triangles get none. A mesh with no
 * area gives an empty cloud, never NaN positions.
 *
 * @param positions flat xyz vertex array
 * @param index     flat triangle index array, three entries per triangle, or
 *                  null for a non-indexed mesh (every three vertices a triangle)
 * @param count     points wanted (already budgeted by the caller)
 * @param random    seeded generator
 * @returns { positions, count }
 */
export const areaPoints = (positions, index, count, random = seededRandom(1)) => {
    const vertexAt = index ? (i) => index[i] : (i) => i
    const triangleCount = Math.floor((index ? index.length : positions.length / 3) / 3)
    const wanted = Math.max(0, Math.floor(Number(count) || 0))
    const cumulative = new Float64Array(triangleCount)
    let total = 0
    for (let triangle = 0; triangle < triangleCount; triangle++) {
        const a = vertexAt(triangle * 3) * 3
        const b = vertexAt(triangle * 3 + 1) * 3
        const c = vertexAt(triangle * 3 + 2) * 3
        const ux = positions[b] - positions[a]
        const uy = positions[b + 1] - positions[a + 1]
        const uz = positions[b + 2] - positions[a + 2]
        const vx = positions[c] - positions[a]
        const vy = positions[c + 1] - positions[a + 1]
        const vz = positions[c + 2] - positions[a + 2]
        const cx = uy * vz - uz * vy
        const cy = uz * vx - ux * vz
        const cz = ux * vy - uy * vx
        const area = Math.sqrt(cx * cx + cy * cy + cz * cz) / 2
        total += Number.isFinite(area) ? area : 0
        cumulative[triangle] = total
    }
    if (!(total > 0) || wanted === 0) return { positions: new Float32Array(0), count: 0 }

    const out = new Float32Array(wanted * 3)
    for (let point = 0; point < wanted; point++) {
        const target = random() * total
        let low = 0
        let high = triangleCount - 1
        while (low < high) {
            const middle = (low + high) >> 1
            if (cumulative[middle] > target) high = middle
            else low = middle + 1
        }
        const a = vertexAt(low * 3) * 3
        const b = vertexAt(low * 3 + 1) * 3
        const c = vertexAt(low * 3 + 2) * 3
        // Uniform barycentric sampling, folded as in cloudPoints below.
        let r1 = random()
        let r2 = random()
        if (r1 + r2 > 1) {
            r1 = 1 - r1
            r2 = 1 - r2
        }
        const r0 = 1 - r1 - r2
        out[point * 3] = positions[a] * r0 + positions[b] * r1 + positions[c] * r2
        out[point * 3 + 1] = positions[a + 1] * r0 + positions[b + 1] * r1 + positions[c + 1] * r2
        out[point * 3 + 2] = positions[a + 2] * r0 + positions[b + 2] * r1 + positions[c + 2] * r2
    }
    return { positions: out, count: wanted }
}

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
