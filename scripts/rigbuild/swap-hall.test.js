import { describe, expect, it } from 'vitest'
import { swapHallOps } from './swap-hall.mjs'

const asset = { id: 'new', name: 'hall.glb', mimeType: 'model/gltf-binary' }

describe('swapHallOps', () => {
    it('lists the new hall model BEFORE the hall points at it (else the room draws no hall)', () => {
        const ops = swapHallOps({ old: 'old', asset, listed: false, stamp: 1 })
        expect(ops.map((o) => o.type)).toEqual(['upsertAsset', 'updateComponent', 'deleteAsset'])
        expect(ops[0].payload.asset.id).toBe('new')
    })
    it('repairs a swap that pointed at the model but never listed it', () => {
        expect(swapHallOps({ old: 'new', asset, listed: false, stamp: 1 }).map((o) => o.type)).toEqual(['upsertAsset'])
    })
    it('does nothing when the model is already the hall and listed', () => {
        expect(swapHallOps({ old: 'new', asset, listed: true, stamp: 1 })).toEqual([])
    })
})
