import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'
import { outsideBoxOf } from './NightOutside.jsx'

describe('the night outside the hall', () => {
    // the MOXIR building: 4 spans × 24 m wide, 108 m long, the floor slab 0.3 m deep
    const floor = new Box3(new Vector3(-48, -0.3, -54), new Vector3(48, 0, 54))
    const hall = new Box3(new Vector3(-48, -0.3, -54), new Vector3(48, 17, 54))

    it('hugs the building, just outside its walls and over its roof', () => {
        const box = outsideBoxOf(floor, hall)
        // the entry gate at z 54 sees the box's face 2 m beyond it: veiled like the wall beside it
        expect(box.center.z + box.size.z / 2).toBeCloseTo(56)
        expect(box.center.x - box.size.x / 2).toBeCloseTo(-50)
        expect(box.center.y + box.size.y / 2).toBeCloseTo(19)
        expect(box.center.y - box.size.y / 2).toBeLessThan(-0.3)
    })

    it('is never stretched by something tall in the model', () => {
        const tall = new Box3(new Vector3(-48, -0.3, -54), new Vector3(48, 300, 54))
        expect(outsideBoxOf(floor, tall).center.y + outsideBoxOf(floor, tall).size.y / 2).toBeLessThanOrEqual(40)
    })

    it('draws nothing without a floor', () => {
        expect(outsideBoxOf(new Box3(), hall)).toBeNull()
    })
})
