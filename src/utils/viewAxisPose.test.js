import { describe, expect, it } from 'vitest'
import { resolveViewKey, viewAxisPose, ORBIT_STEP_RAD } from './viewAxisPose.js'

describe('viewAxisPose', () => {
    const target = [1, 2, 3]
    const dist = (p) => Math.hypot(p[0] - 1, p[1] - 2, p[2] - 3)
    it('places the camera on the axis at the same distance', () => {
        expect(viewAxisPose({ axis: 'front', target, distance: 5 }).position).toEqual([1, 2, 8])
        expect(viewAxisPose({ axis: 'front', target, distance: 5, back: true }).position).toEqual([1, 2, -2])
        expect(viewAxisPose({ axis: 'right', target, distance: 5 }).position).toEqual([6, 2, 3])
        expect(viewAxisPose({ axis: 'right', target, distance: 5, back: true }).position).toEqual([-4, 2, 3])
        expect(viewAxisPose({ axis: 'top', target, distance: 5 }).position).toEqual([1, 7, 3])
        expect(viewAxisPose({ axis: 'top', target, distance: 5, back: true }).position).toEqual([1, -3, 3])
        for (const axis of ['front', 'right', 'top']) for (const back of [false, true]) {
            const pose = viewAxisPose({ axis, target, distance: 7.5, back })
            expect(dist(pose.position)).toBeCloseTo(7.5)
            expect(pose.target).toEqual(target)
        }
    })
    it('keeps a sane up vector, never parallel to the view direction', () => {
        for (const axis of ['front', 'right', 'top']) for (const back of [false, true]) {
            const pose = viewAxisPose({ axis, target: [0, 0, 0], distance: 4, back })
            const dot = pose.position.reduce((s, c, i) => s + c * pose.up[i], 0)
            expect(Math.abs(dot)).toBeCloseTo(0)
            expect(Math.hypot(...pose.up)).toBeCloseTo(1)
        }
        expect(viewAxisPose({ axis: 'front' }).up).toEqual([0, 1, 0])
        expect(viewAxisPose({ axis: 'top' }).up).toEqual([0, 0, -1])
    })
})

describe('resolveViewKey', () => {
    it('maps the numpad by event.code', () => {
        expect(resolveViewKey({ code: 'Numpad1' })).toEqual({ kind: 'axis', axis: 'front', back: false })
        expect(resolveViewKey({ code: 'Numpad1', ctrlKey: true })).toEqual({ kind: 'axis', axis: 'front', back: true })
        expect(resolveViewKey({ code: 'Numpad3' }).axis).toBe('right')
        expect(resolveViewKey({ code: 'Numpad7', ctrlKey: true })).toEqual({ kind: 'axis', axis: 'top', back: true })
        expect(resolveViewKey({ code: 'Numpad8' })).toEqual({ kind: 'orbit', azimuth: 0, polar: -ORBIT_STEP_RAD })
        expect(resolveViewKey({ code: 'Numpad4' }).azimuth).toBeCloseTo(-Math.PI / 12)
        expect(resolveViewKey({ code: 'Home' })).toEqual({ kind: 'frame-all' })
        expect(resolveViewKey({ code: 'NumpadDecimal' })).toEqual({ kind: 'frame-selected' })
    })
    it('does not touch the number row, letters, or Numpad5 (no real ortho)', () => {
        expect(resolveViewKey({ code: 'Digit1' })).toBeNull()
        expect(resolveViewKey({ code: 'Digit7', ctrlKey: true })).toBeNull()
        expect(resolveViewKey({ code: 'Numpad5' })).toBeNull()
        expect(resolveViewKey({ code: 'KeyF' })).toBeNull()
        expect(resolveViewKey({ code: 'Numpad1', altKey: true })).toBeNull()
    })
    it('offers the same commands without a numpad', () => {
        expect(resolveViewKey({ code: 'Digit1', shiftKey: true })).toEqual({ kind: 'axis', axis: 'front', back: false })
        expect(resolveViewKey({ code: 'Digit3', shiftKey: true, ctrlKey: true })).toEqual({ kind: 'axis', axis: 'right', back: true })
        expect(resolveViewKey({ code: 'ArrowLeft', shiftKey: true })).toEqual(resolveViewKey({ code: 'Numpad4' }))
        expect(resolveViewKey({ code: 'ArrowLeft' })).toBeNull()
    })
})
