import { describe, expect, it } from 'vitest'
import { GIZMO_SNAP, gizmoSnapSteps, snapStateOf } from './gizmoSnap.js'

// The gizmo snaps like the modal G/R/S: Ctrl the increments, Ctrl+Shift a tenth (Blender's precision snap).
describe('gizmo snap steps', () => {
    it('Ctrl = 0.5 m / 15° / 0.1; Ctrl+Shift = a tenth; Shift alone or nothing = no snap', () => {
        expect(snapStateOf({ ctrlKey: true })).toBe('coarse')
        expect(snapStateOf({ metaKey: true, shiftKey: true })).toBe('fine')
        expect(snapStateOf({ shiftKey: true })).toBe(false)
        expect(gizmoSnapSteps(false)).toEqual({ translation: null, rotation: null, scale: null })
        expect(gizmoSnapSteps('coarse')).toEqual(GIZMO_SNAP)
        const fine = gizmoSnapSteps('fine')
        expect(fine.translation).toBeCloseTo(0.05, 12)
        expect(fine.rotation).toBeCloseTo(Math.PI / 120, 12)
        expect(fine.scale).toBeCloseTo(0.01, 12)
    })
})
