// Slicing the photogrammetry scan into shards — the pure half of ScanRoom.
//
// Two jobs, both done per triangle in one pass:
//
//   1. THROW AWAY THE SMEARS. A photogrammetry mesh is honest where the scanner
//      saw well and a taffy-pull where it did not: reconstruction fills the
//      gaps between confident surfaces with enormous stretched triangles, and
//      from the middle of the scan those are what you mostly see — long blurred
//      sheets of texture dragged across the view. Real surfaces in this scan
//      are dense (100k triangles over a 5.8m room), so a long edge IS the
//      artifact: any triangle with an edge over the limit is reconstruction
//      guesswork, not a wall, and is dropped whole.
//
//   2. CUT THE REST INTO SHARDS. Triangles are binned by the sector they
//      occupy around the model's vertical axis and by height band, which cuts
//      the room into wedge-shaped pieces the way an orange is segmented. The
//      cut is by whole triangles, so shard edges are ragged in exactly the way
//      the scan's own holes already are — nothing about a shard boundary looks
//      different from the material it is cut from.
//
// Pure arrays in, plain objects out — no three.js, no React — because the
// claims worth testing (stretched triangles die, every survivor lands in
// exactly one shard, centroids are true) should not need a canvas to assert.

/**
 * Cut an indexed triangle mesh into shards.
 *
 * @param positions flat xyz vertex array (the geometry's position attribute)
 * @param index     flat triangle index array, three entries per triangle
 * @param sectors   how many wedges around the vertical axis
 * @param bands     how many height bands
 * @param edgeLimit longest triangle edge that is still believed, in model units
 * @param centreY   vertical centre of the model
 * @param heightSpan full height of the model, for the band cut
 * @returns array of { indices, centroid, triangles } for every non-empty shard
 */
export const shardScan = (positions, index, {
    sectors = 14,
    bands = 3,
    edgeLimit = 0.45,
    centreY = 0,
    heightSpan = 2.4
} = {}) => {
    const limitSq = edgeLimit * edgeLimit
    const bottom = centreY - heightSpan / 2
    const clusters = new Map()
    const triangleCount = Math.floor(index.length / 3)

    for (let triangle = 0; triangle < triangleCount; triangle++) {
        const i0 = index[triangle * 3] * 3
        const i1 = index[triangle * 3 + 1] * 3
        const i2 = index[triangle * 3 + 2] * 3

        const ax = positions[i0]
        const ay = positions[i0 + 1]
        const az = positions[i0 + 2]
        const bx = positions[i1]
        const by = positions[i1 + 1]
        const bz = positions[i1 + 2]
        const cx = positions[i2]
        const cy = positions[i2 + 1]
        const cz = positions[i2 + 2]

        const ab = (bx - ax) ** 2 + (by - ay) ** 2 + (bz - az) ** 2
        const bc = (cx - bx) ** 2 + (cy - by) ** 2 + (cz - bz) ** 2
        const ca = (ax - cx) ** 2 + (ay - cy) ** 2 + (az - cz) ** 2
        if (Math.max(ab, bc, ca) > limitSq) continue

        const mx = (ax + bx + cx) / 3
        const my = (ay + by + cy) / 3
        const mz = (az + bz + cz) / 3

        // atan2 returns exactly +PI for one direction, which floor() would put
        // one bin past the end — folded back onto the last sector, which is
        // where the seam is anyway.
        let sector = Math.floor(((Math.atan2(mz, mx) + Math.PI) / (2 * Math.PI)) * sectors)
        if (sector >= sectors) sector = sectors - 1

        const band = Math.min(
            bands - 1,
            Math.max(0, Math.floor(((my - bottom) / heightSpan) * bands))
        )

        const key = band * sectors + sector
        let cluster = clusters.get(key)
        if (!cluster) {
            cluster = { indices: [], sumX: 0, sumY: 0, sumZ: 0, triangles: 0 }
            clusters.set(key, cluster)
        }
        cluster.indices.push(index[triangle * 3], index[triangle * 3 + 1], index[triangle * 3 + 2])
        cluster.sumX += mx
        cluster.sumY += my
        cluster.sumZ += mz
        cluster.triangles += 1
    }

    return Array.from(clusters.values()).map((cluster) => ({
        indices: cluster.indices,
        centroid: [
            cluster.sumX / cluster.triangles,
            cluster.sumY / cluster.triangles,
            cluster.sumZ / cluster.triangles
        ],
        triangles: cluster.triangles
    }))
}
