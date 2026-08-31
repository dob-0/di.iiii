import { describe, it, expect } from 'vitest'
import { centroidSpawn, CENTROID_STANDBACK_MIN, CENTROID_STANDBACK_MAX } from './LiveProjectScene.jsx'

describe('centroidSpawn', () => {
    it('stands at the content, not the world origin', () => {
        // the real `main` space: 83 entities, centroid (20.6, 24.4)
        const p = centroidSpawn({ x: 20.6, z: 24.4 }, { minZ: -37.8, maxZ: 54 })
        expect(p.x).toBeCloseTo(20.6)
        expect(p.z).toBeGreaterThan(24.4)      // stood back, not inside the work
        expect(p.yaw).toBeCloseTo(Math.PI)     // facing into it
    })

    it('stands back proportionally, within bounds', () => {
        const tiny = centroidSpawn({ x: 0, z: 0 }, { minZ: -1, maxZ: 1 })
        expect(tiny.z).toBe(CENTROID_STANDBACK_MIN)
        const huge = centroidSpawn({ x: 0, z: 0 }, { minZ: -200, maxZ: 200 })
        expect(huge.z).toBe(CENTROID_STANDBACK_MAX)
    })

    it('survives missing inputs', () => {
        expect(centroidSpawn(undefined, undefined)).toEqual({ x: 0, z: CENTROID_STANDBACK_MIN, yaw: Math.PI, pitch: 0 })
    })
})
