import { describe, expect, it } from 'vitest'
import { shardScan } from './scanShards.js'

// A tiny synthetic "scan": unit-ish triangles placed by hand, so every claim
// about the cut can be checked against arithmetic rather than a screenshot.

// One small triangle centred near (x, y, z). Returns its three vertices.
const triangleAt = (x, y, z, size = 0.1) => [
    [x - size, y, z],
    [x + size, y, z],
    [x, y + size, z]
]

const buildMesh = (triangles) => {
    const positions = []
    const index = []
    triangles.forEach((vertices) => {
        vertices.forEach(([x, y, z]) => {
            index.push(positions.length / 3)
            positions.push(x, y, z)
        })
    })
    return { positions: Float32Array.from(positions), index: Uint32Array.from(index) }
}

describe('shardScan', () => {
    it('drops triangles with an edge over the limit — the reconstruction smears', () => {
        // One honest triangle, one taffy-pull bridging two metres of nothing.
        const { positions, index } = buildMesh([
            triangleAt(1, 0, 0, 0.1),
            [[0, 0, 0], [2.4, 0, 0], [1.2, 0.1, 0]]
        ])
        const shards = shardScan(positions, index, { edgeLimit: 0.45 })
        const kept = shards.reduce((sum, shard) => sum + shard.triangles, 0)
        expect(kept).toBe(1)
    })

    it('assigns every surviving triangle to exactly one shard', () => {
        const triangles = []
        for (let step = 0; step < 24; step++) {
            const angle = (step / 24) * Math.PI * 2
            triangles.push(triangleAt(Math.cos(angle) * 2, (step % 3) - 1, Math.sin(angle) * 2))
        }
        const { positions, index } = buildMesh(triangles)
        const shards = shardScan(positions, index, { sectors: 8, bands: 3, heightSpan: 3 })
        expect(shards.reduce((sum, shard) => sum + shard.triangles, 0)).toBe(24)
        // Three indices per triangle, every one accounted for exactly once.
        const seen = shards.flatMap((shard) => shard.indices)
        expect(seen.length).toBe(24 * 3)
        expect(new Set(seen).size).toBe(24 * 3)
    })

    it('separates opposite sides of the room into different shards', () => {
        const { positions, index } = buildMesh([
            triangleAt(2, 0, 0),
            triangleAt(-2, 0, 0)
        ])
        const shards = shardScan(positions, index, { sectors: 8, bands: 1 })
        expect(shards).toHaveLength(2)
    })

    it('separates floor from ceiling when banded', () => {
        const { positions, index } = buildMesh([
            triangleAt(2, -1, 0),
            triangleAt(2, 1, 0)
        ])
        const shards = shardScan(positions, index, {
            sectors: 1, bands: 2, centreY: 0, heightSpan: 3
        })
        expect(shards).toHaveLength(2)
    })

    it('reports a true centroid for each shard', () => {
        const { positions, index } = buildMesh([triangleAt(2, 0.5, 1, 0.1)])
        const [shard] = shardScan(positions, index)
        // The triangle's own centroid: x averages out, y gains size/3.
        expect(shard.centroid[0]).toBeCloseTo(2, 5)
        expect(shard.centroid[1]).toBeCloseTo(0.5 + 0.1 / 3, 5)
        expect(shard.centroid[2]).toBeCloseTo(1, 5)
    })

    it('never bins a seam triangle out of range', () => {
        // atan2 returns exactly +PI along -x, which naive flooring puts one
        // sector past the end.
        const { positions, index } = buildMesh([
            [[-2, 0, -0.001], [-2.1, 0, 0.001], [-2, 0.1, 0]]
        ])
        const shards = shardScan(positions, index, { sectors: 14 })
        expect(shards).toHaveLength(1)
    })

    it('is deterministic', () => {
        const triangles = []
        for (let step = 0; step < 12; step++) {
            triangles.push(triangleAt(Math.cos(step) * 2, 0, Math.sin(step) * 2))
        }
        const { positions, index } = buildMesh(triangles)
        expect(shardScan(positions, index)).toEqual(shardScan(positions, index))
    })
})
