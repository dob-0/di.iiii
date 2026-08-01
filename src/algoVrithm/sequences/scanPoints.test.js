import { describe, expect, it } from 'vitest'
import { cloudPoints } from './scanPoints.js'
import { createRandom } from '../random.js'

// A hand-built two-triangle mesh so every claim checks against arithmetic.

const buildMesh = (triangles) => {
    const positions = []
    const uvs = []
    const index = []
    triangles.forEach((vertices) => {
        vertices.forEach(([x, y, z, u, v]) => {
            index.push(positions.length / 3)
            positions.push(x, y, z)
            uvs.push(u, v)
        })
    })
    return {
        positions: Float32Array.from(positions),
        uvs: Float32Array.from(uvs),
        index: Uint32Array.from(index)
    }
}

const unitTriangle = [
    [0, 0, 0, 0, 0],
    [0.2, 0, 0, 1, 0],
    [0, 0.2, 0, 0, 1]
]

describe('cloudPoints', () => {
    it('scatters the requested number of points per surviving triangle', () => {
        const { positions, uvs, index } = buildMesh([unitTriangle])
        const cloud = cloudPoints(positions, uvs, index, {
            samplesPerTriangle: 5,
            random: createRandom(7)
        })
        expect(cloud.count).toBe(5)
        expect(cloud.positions.length).toBe(15)
        expect(cloud.uvs.length).toBe(10)
    })

    it('puts no points on stretched triangles — the reconstruction smears', () => {
        const smear = [
            [0, 0, 0, 0, 0],
            [2.4, 0, 0, 1, 0],
            [1.2, 0.1, 0, 0, 1]
        ]
        const { positions, uvs, index } = buildMesh([unitTriangle, smear])
        const cloud = cloudPoints(positions, uvs, index, {
            edgeLimit: 0.45,
            samplesPerTriangle: 3,
            random: createRandom(7)
        })
        expect(cloud.count).toBe(3)
    })

    it('keeps every sample inside its triangle', () => {
        const { positions, uvs, index } = buildMesh([unitTriangle])
        const cloud = cloudPoints(positions, uvs, index, {
            samplesPerTriangle: 200,
            random: createRandom(11)
        })
        for (let point = 0; point < cloud.count; point++) {
            const x = cloud.positions[point * 3]
            const y = cloud.positions[point * 3 + 1]
            // The triangle is x>=0, y>=0, x/0.2 + y/0.2 <= 1.
            expect(x).toBeGreaterThanOrEqual(0)
            expect(y).toBeGreaterThanOrEqual(0)
            expect(x / 0.2 + y / 0.2).toBeLessThanOrEqual(1 + 1e-6)
            expect(cloud.positions[point * 3 + 2]).toBe(0)
        }
    })

    it('interpolates uv with the same weights as position', () => {
        // On this triangle uv IS position/0.2, so the two must agree exactly.
        const { positions, uvs, index } = buildMesh([unitTriangle])
        const cloud = cloudPoints(positions, uvs, index, {
            samplesPerTriangle: 50,
            random: createRandom(3)
        })
        for (let point = 0; point < cloud.count; point++) {
            expect(cloud.uvs[point * 2]).toBeCloseTo(cloud.positions[point * 3] / 0.2, 5)
            expect(cloud.uvs[point * 2 + 1]).toBeCloseTo(cloud.positions[point * 3 + 1] / 0.2, 5)
        }
    })

    it('labels each point with its triangle group material slot', () => {
        const shifted = unitTriangle.map(([x, y, z, u, v]) => [x + 1, y, z, u, v])
        const { positions, uvs, index } = buildMesh([unitTriangle, shifted])
        const cloud = cloudPoints(positions, uvs, index, {
            groups: [
                { start: 0, count: 3, materialIndex: 0 },
                { start: 3, count: 3, materialIndex: 2 }
            ],
            samplesPerTriangle: 2,
            random: createRandom(5)
        })
        expect(Array.from(cloud.slots)).toEqual([0, 0, 2, 2])
    })

    it('is deterministic under the same seed', () => {
        const { positions, uvs, index } = buildMesh([unitTriangle])
        const first = cloudPoints(positions, uvs, index, {
            samplesPerTriangle: 20, random: createRandom(9)
        })
        const second = cloudPoints(positions, uvs, index, {
            samplesPerTriangle: 20, random: createRandom(9)
        })
        expect(first).toEqual(second)
    })
})
