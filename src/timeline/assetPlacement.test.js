import { describe, expect, it } from 'vitest'
import {
    DEFAULT_PLACEMENT,
    MIN_DISTANCE,
    MIN_SIZE,
    placementPosition,
    placementRotation,
    positionToPlacement,
    resolvePlacement,
    scalePlacementSize
} from './assetPlacement.js'
import { STANDPOINT } from '../timeline/stageView.js'
import { patchFromGizmo, resolveGroupTransform } from '../timeline/sequenceTransform.js'

const assetRow = (placement = {}) => ({
    id: 'asset-x',
    asset: { assetId: 'x', kind: 'image', src: '/x.png', ...placement }
})

describe('placementPosition', () => {
    it('puts a bearing of zero straight in front, at eye height', () => {
        expect(placementPosition({ distance: 4, height: 0, bearing: 0 }))
            .toEqual([0, STANDPOINT.y, -4])
    })

    it('reads bearing as degrees clockwise from straight ahead', () => {
        const [x, , z] = placementPosition({ distance: 4, height: 0, bearing: 90 })
        expect(x).toBeCloseTo(4, 6)
        expect(z).toBeCloseTo(0, 6)
    })

    it('offsets height from eye level, not the floor', () => {
        expect(placementPosition({ distance: 4, height: 0.5, bearing: 0 })[1])
            .toBeCloseTo(STANDPOINT.y + 0.5, 6)
    })
})

describe('positionToPlacement', () => {
    it('round-trips every bearing', () => {
        // This is the drag path: gizmo moves the group, we read the world
        // position back, and the four panel numbers have to land on the same
        // place. A sign error here sends the asset to the mirror position and
        // is invisible until someone drags one.
        for (let bearing = -180; bearing <= 180; bearing += 15) {
            const original = { distance: 3.5, height: 0.4, bearing, size: 2 }
            const round = positionToPlacement(placementPosition(original))
            expect(round.distance).toBeCloseTo(original.distance, 3)
            expect(round.height).toBeCloseTo(original.height, 3)
            // -180 and 180 are the same direction; compare as a position.
            expect(placementPosition({ ...original, ...round })[0])
                .toBeCloseTo(placementPosition(original)[0], 3)
            expect(placementPosition({ ...original, ...round })[2])
                .toBeCloseTo(placementPosition(original)[2], 3)
        }
    })

    it('normalises bearing into the range the panel field accepts', () => {
        // The field's min is -180; handing it 190 would clamp and teleport the
        // asset the moment anyone touched the input.
        for (let bearing = -180; bearing <= 180; bearing += 7) {
            const round = positionToPlacement(placementPosition({ distance: 2, height: 0, bearing }))
            expect(round.bearing).toBeGreaterThanOrEqual(-180)
            expect(round.bearing).toBeLessThanOrEqual(180)
        }
    })

    it('keeps the previous bearing when dragged onto the standpoint', () => {
        // At zero distance every bearing is the same point, so atan2 returns an
        // arbitrary one and the asset spins as it crosses the centre.
        const round = positionToPlacement([0, STANDPOINT.y, 0], { bearing: 42 })
        expect(round.bearing).toBe(42)
        expect(round.distance).toBe(MIN_DISTANCE)
    })

    it('never places an asset inside the viewer', () => {
        expect(positionToPlacement([0, STANDPOINT.y, -0.01]).distance).toBe(MIN_DISTANCE)
    })
})

describe('resolvePlacement', () => {
    it('fills defaults and survives junk', () => {
        expect(resolvePlacement(undefined)).toEqual({ ...DEFAULT_PLACEMENT })
        expect(resolvePlacement({ distance: NaN }).distance).toBe(DEFAULT_PLACEMENT.distance)
        expect(resolvePlacement({ size: 0 }).size).toBe(MIN_SIZE)
        expect(resolvePlacement({ distance: -5 }).distance).toBe(MIN_DISTANCE)
    })
})

describe('scalePlacementSize', () => {
    it('multiplies and clamps', () => {
        expect(scalePlacementSize(2, 1.5)).toBe(3)
        expect(scalePlacementSize(2, 0)).toBe(MIN_SIZE)
        expect(scalePlacementSize(2, NaN)).toBe(2)
    })
})

describe('resolveGroupTransform', () => {
    it('places an asset row from its polar numbers', () => {
        const { position, rotation, scale } = resolveGroupTransform(assetRow({ distance: 4, bearing: 0 }))
        expect(position).toEqual([0, STANDPOINT.y, -4])
        expect(rotation).toEqual(placementRotation({ bearing: 0 }))
        // Size is baked into the asset's geometry; scaling the group too would
        // apply it twice.
        expect(scale).toBe(1)
    })

    it('places a written sequence from its cartesian transform', () => {
        const written = { id: 's01', transform: { position: [0, 1, -2], scale: 2 } }
        expect(resolveGroupTransform(written)).toEqual({
            position: [0, 1, -2],
            rotation: [0, 0, 0],
            scale: 2
        })
    })

    it('leaves an untouched written sequence exactly where its own code puts it', () => {
        expect(resolveGroupTransform({ id: 's01' })).toEqual({
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: 1
        })
    })
})

describe('patchFromGizmo', () => {
    it('writes an asset drag back into the panel numbers, not a transform', () => {
        // The whole point of the unification: the handles and the number fields
        // edit the same four values.
        const row = assetRow({ distance: 4, size: 2, height: 0, bearing: 0 })
        const patch = patchFromGizmo(row, {
            position: [0, STANDPOINT.y + 1, -6],
            rotation: [0, 0, 0],
            scale: 1
        })
        expect(patch.kind).toBe('placement')
        expect(patch.asset.distance).toBeCloseTo(6, 3)
        expect(patch.asset.height).toBeCloseTo(1, 3)
        expect(patch.asset).not.toHaveProperty('position')
        // Identity fields survive the round trip.
        expect(patch.asset.src).toBe('/x.png')
    })

    it('scales an asset from the size it had when the drag began, not the live one', () => {
        // Otherwise each frame multiplies the already-multiplied size and the
        // asset runs away to the clamp within a few pixels of drag.
        const baseline = assetRow({ size: 2 })
        const midDrag = assetRow({ size: 3 })
        const patch = patchFromGizmo(midDrag, {
            position: placementPosition(resolvePlacement(midDrag.asset)),
            rotation: [0, 0, 0],
            scale: 1.5
        }, baseline)
        expect(patch.asset.size).toBe(3)
    })

    it('folds a rotate drag into bearing rather than fighting it', () => {
        const row = assetRow({ distance: 4, bearing: 0 })
        const patch = patchFromGizmo(row, {
            position: [0, STANDPOINT.y, -4],
            rotation: [0, Math.PI / 2, 0],
            scale: 1
        })
        expect(patch.asset.bearing).toBeCloseTo(90, 3)
    })

    it('writes a written sequence straight through as a transform', () => {
        const patch = patchFromGizmo({ id: 's01' }, {
            position: [1, 2, 3],
            rotation: [0, 0.5, 0],
            scale: 2
        })
        expect(patch).toEqual({
            kind: 'transform',
            transform: { position: [1, 2, 3], rotation: [0, 0.5, 0], scale: 2 }
        })
    })
})
