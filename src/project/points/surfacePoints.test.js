import { describe, expect, it } from 'vitest'
import { areaPoints, cloudPoints, MAX_POINTS, MAX_POINTS_LIGHT, pointBudget, seededRandom } from './surfacePoints.js'

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
            random: seededRandom(7)
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
            random: seededRandom(7)
        })
        expect(cloud.count).toBe(3)
    })

    it('keeps every sample inside its triangle', () => {
        const { positions, uvs, index } = buildMesh([unitTriangle])
        const cloud = cloudPoints(positions, uvs, index, {
            samplesPerTriangle: 200,
            random: seededRandom(11)
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
            random: seededRandom(3)
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
            random: seededRandom(5)
        })
        expect(Array.from(cloud.slots)).toEqual([0, 0, 2, 2])
    })

    it('is deterministic under the same seed', () => {
        const { positions, uvs, index } = buildMesh([unitTriangle])
        const first = cloudPoints(positions, uvs, index, {
            samplesPerTriangle: 20, random: seededRandom(9)
        })
        const second = cloudPoints(positions, uvs, index, {
            samplesPerTriangle: 20, random: seededRandom(9)
        })
        expect(first).toEqual(second)
    })
})

describe('areaPoints', () => {
    it('scatters exactly the asked number of points', () => {
        const { positions, index } = buildMesh([unitTriangle])
        expect(areaPoints(positions, index, 1000, seededRandom(1)).count).toBe(1000)
        expect(areaPoints(positions, index, 1000, seededRandom(1)).positions.length).toBe(3000)
    })

    it('shares points by area: a triangle 4x the area gets about 4x the points', () => {
        // unitTriangle has legs 0.2 (area 0.02); the big one legs 0.4 (area 0.08), at x >= 1.
        const big = [[1, 0, 0, 0, 0], [1.4, 0, 0, 1, 0], [1, 0.4, 0, 0, 1]]
        const { positions, index } = buildMesh([unitTriangle, big])
        const cloud = areaPoints(positions, index, 10000, seededRandom(4))
        let onBig = 0
        for (let point = 0; point < cloud.count; point++) {
            if (cloud.positions[point * 3] >= 1) onBig += 1
        }
        // Expected 8000 of 10000; binomial sd is 40, so 7800..8200 is five sd.
        expect(onBig).toBeGreaterThan(7800)
        expect(onBig).toBeLessThan(8200)
    })

    it('keeps every point inside its triangle, non-indexed input too', () => {
        const { positions } = buildMesh([unitTriangle])
        const cloud = areaPoints(positions, null, 500, seededRandom(2))
        expect(cloud.count).toBe(500)
        for (let point = 0; point < cloud.count; point++) {
            const x = cloud.positions[point * 3]
            const y = cloud.positions[point * 3 + 1]
            expect(x).toBeGreaterThanOrEqual(0)
            expect(y).toBeGreaterThanOrEqual(0)
            expect(x / 0.2 + y / 0.2).toBeLessThanOrEqual(1 + 1e-6)
        }
    })

    it('gives an empty cloud, not NaN, for a mesh with no area or no count', () => {
        const flat = buildMesh([[[0, 0, 0, 0, 0], [1, 0, 0, 1, 0], [2, 0, 0, 0, 1]]])
        expect(areaPoints(flat.positions, flat.index, 100).count).toBe(0)
        const { positions, index } = buildMesh([unitTriangle])
        expect(areaPoints(positions, index, 0).count).toBe(0)
        expect(areaPoints(new Float32Array(0), null, 100).count).toBe(0)
    })

    it('is deterministic under the same seed', () => {
        const { positions, index } = buildMesh([unitTriangle])
        expect(areaPoints(positions, index, 50, seededRandom(9)))
            .toEqual(areaPoints(positions, index, 50, seededRandom(9)))
    })
})

describe('pointBudget', () => {
    it('passes a reasonable count through, whole', () => {
        expect(pointBudget(5000)).toBe(5000)
        expect(pointBudget(12.7)).toBe(12)
    })

    it('caps at 120,000, and at 60,000 on a phone or for reduced motion', () => {
        expect(MAX_POINTS).toBe(120000)
        expect(MAX_POINTS_LIGHT).toBe(60000)
        expect(pointBudget(1e9)).toBe(120000)
        expect(pointBudget(1e9, { light: true })).toBe(60000)
        expect(pointBudget(90000, { light: true })).toBe(60000)
        expect(pointBudget(90000)).toBe(90000)
    })

    it('draws nothing for a negative, zero or unreadable count', () => {
        expect(pointBudget(-5)).toBe(0)
        expect(pointBudget(0)).toBe(0)
        expect(pointBudget('lots')).toBe(0)
        expect(pointBudget(undefined)).toBe(0)
    })
})
