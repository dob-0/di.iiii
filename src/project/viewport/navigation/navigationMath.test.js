import { describe, expect, it } from 'vitest'
import {
    NEAR_LIMIT, ZOOM_PER_UNIT, axisView, dollyToPoint, fitDistance, frameSphere, glideSmoothTime, isDoubleTap,
    isSolidSurface, isTap, liftAboveFloor, mouseAction, nudgeOut, pinchFactor, pointAlong, pointerRay,
    retargetAtDepth, stepOrbit, stepPan, stepZoom, wheelFactor
} from './navigationMath.js'

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('wheel', () => {
    it('one 100-unit notch is the old wheel: x1.136 out, its inverse in', () => {
        expect(wheelFactor(100)).toBeCloseTo(1.136, 3)
        expect(wheelFactor(-100)).toBeCloseTo(1 / 1.136, 3)
        expect(Math.exp(100 * ZOOM_PER_UNIT)).toBeCloseTo(1.136, 3)
    })
    it('lines and pages are scaled, a trackpad pinch (ctrl) is stronger, a burst is capped', () => {
        expect(wheelFactor(3, { deltaMode: 1 })).toBeCloseTo(wheelFactor(99), 6)
        expect(wheelFactor(2, { ctrlKey: true })).toBeCloseTo(wheelFactor(12), 6)
        expect(wheelFactor(100000)).toBeCloseTo(wheelFactor(400), 6)
        expect(wheelFactor(NaN)).toBe(1)
    })
    it('pinch follows the fingers 1:1, within a bound', () => {
        expect(pinchFactor(100, 200)).toBeCloseTo(0.5)
        expect(pinchFactor(200, 100)).toBe(2)
        expect(pinchFactor(100, 1)).toBe(2)
        expect(pinchFactor(0, 100)).toBe(1)
    })
})

describe('dollyToPoint (Auto Depth + Zoom to Mouse Position)', () => {
    const pos = [0, 1.6, 20]
    const target = [0, 5, 3]
    const point = [10, 4, -30] // a surface off to the right, far away
    it('moves toward the point along the line to it and keeps the view direction', () => {
        const r = dollyToPoint(pos, target, point, 0.5)
        expect(dist(r.position, point)).toBeCloseTo(dist(pos, point) * 0.5, 6)
        const fwd0 = [target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]]
        const fwd1 = [r.target[0] - r.position[0], r.target[1] - r.position[1], r.target[2] - r.position[2]]
        const n = (v) => v.map((x) => x / Math.hypot(...v))
        n(fwd0).forEach((x, i) => expect(n(fwd1)[i]).toBeCloseTo(x, 6))
    })
    it('puts the orbit target on the view axis at the surface depth', () => {
        const r = dollyToPoint(pos, target, point, 0.5)
        const fwd = [r.target[0] - r.position[0], r.target[1] - r.position[1], r.target[2] - r.position[2]]
        const to = [point[0] - r.position[0], point[1] - r.position[1], point[2] - r.position[2]]
        const l = Math.hypot(...fwd)
        expect((fwd[0] * to[0] + fwd[1] * to[1] + fwd[2] * to[2]) / l).toBeCloseTo(l, 5)
    })
    it('reaches the surface: repeated notches close the gap to the near limit and no closer', () => {
        let p = pos
        let t = target
        for (let i = 0; i < 200; i += 1) {
            const r = dollyToPoint(p, t, point, 1 / 1.136)
            p = r.position
            t = r.target
        }
        expect(dist(p, point)).toBeCloseTo(NEAR_LIMIT, 6)
    })
    it('zooming out from the same point retraces the way back', () => {
        const a = dollyToPoint(pos, target, point, 0.6)
        const b = dollyToPoint(a.position, a.target, point, 1 / 0.6)
        b.position.forEach((x, i) => expect(x).toBeCloseTo(pos[i], 6))
    })
    it('speed is proportional to distance: a notch covers 11.9% of the way, far or near', () => {
        const far = dollyToPoint(pos, target, point, 1 / 1.136)
        const step = dist(far.position, pos)
        expect(step / dist(pos, point)).toBeCloseTo(1 - 1 / 1.136, 6)
        const near = dollyToPoint(pos, target, [0, 1.6, 18], 1 / 1.136)
        expect(dist(near.position, pos) / 2).toBeCloseTo(1 - 1 / 1.136, 6)
    })
    it('a point at the camera does nothing', () => {
        expect(dollyToPoint(pos, target, pos, 0.5).clamped).toBe(true)
    })
    it('does not pass the near limit even from inside it', () => {
        const r = dollyToPoint([0, 0, 0.05], [0, 0, -1], [0, 0, 0], 0.1)
        expect(dist(r.position, [0, 0, 0])).toBeLessThanOrEqual(0.05 + 1e-9)
    })
})

describe('retargetAtDepth', () => {
    it('keeps the camera, moves the target along the axis to the depth of the point', () => {
        const t = retargetAtDepth([0, 0, 10], [0, 0, 0], [3, 0, 4])
        expect(t[0]).toBeCloseTo(0)
        expect(t[2]).toBeCloseTo(4)
    })
})

describe('pointerRay', () => {
    it('the centre of the screen looks along the view axis; the edge leans by the fov', () => {
        const c = pointerRay([0, 0, 10], [0, 0, 0], [0, 1, 0], 60, 2, 0, 0)
        expect(c.direction[2]).toBeCloseTo(-1)
        const e = pointerRay([0, 0, 10], [0, 0, 0], [0, 1, 0], 60, 2, 0, 1)
        expect(Math.atan2(e.direction[1], -e.direction[2]) * 180 / Math.PI).toBeCloseTo(30, 4)
        expect(pointAlong(c, 4)[2]).toBeCloseTo(6)
    })
})

describe('what can be zoomed to', () => {
    it('solid things yes; hidden, beams, haze and cut-away parts no', () => {
        expect(isSolidSurface({})).toBe(true)
        expect(isSolidSurface({ visible: false })).toBe(false)
        expect(isSolidSurface({ additive: true })).toBe(false)
        expect(isSolidSurface({ opacity: 0.2 })).toBe(false)
        expect(isSolidSurface({ depthWrite: false })).toBe(false)
        expect(isSolidSurface({ clippedPoint: true })).toBe(false)
        expect(isSolidSurface({ isLineOrPoints: true })).toBe(false)
    })
})

describe('framing', () => {
    it('stands back far enough that the sphere fits the narrower side', () => {
        const wide = fitDistance(2, 50, 1.6)
        const tall = fitDistance(2, 50, 0.5)
        expect(tall).toBeGreaterThan(wide)
        expect(wide).toBeGreaterThan(2)
    })
    it('View Selected keeps the direction and centres the sphere', () => {
        const r = frameSphere([0, 1.6, 20], [0, 5, 3], [4, 6, -2], 1.5, 55, 1.6)
        expect(r.target).toEqual([4, 6, -2])
        const d = dist(r.position, r.target)
        expect(d).toBeGreaterThan(1.5)
        const before = [0, 3.4, -17]
        const after = [r.target[0] - r.position[0], r.target[1] - r.position[1], r.target[2] - r.position[2]]
        const cos = (before[0] * after[0] + before[1] * after[1] + before[2] * after[2]) / (Math.hypot(...before) * Math.hypot(...after))
        expect(cos).toBeCloseTo(1, 6)
    })
})

describe('axis views and steps', () => {
    it('front, right, top; Ctrl is the opposite side; the distance is kept', () => {
        expect(axisView([0, 5, 0], 10, 'front').position).toEqual([0, 5, 10])
        expect(axisView([0, 5, 0], 10, 'front', true).position).toEqual([0, 5, -10])
        expect(axisView([0, 5, 0], 10, 'right').position).toEqual([10, 5, 0])
        const top = axisView([0, 5, 0], 10, 'top')
        expect(top.position[1]).toBeCloseTo(15)
        expect(top.position[2]).toBeGreaterThan(0)
        expect(axisView([0, 0, 0], 1, 'nope')).toBeNull()
    })
    it('numpad steps: 15 degrees, the four directions, nothing for other keys', () => {
        expect(stepOrbit('Numpad4')[0]).toBeCloseTo(-Math.PI / 12)
        expect(stepOrbit('Numpad6')[0]).toBeCloseTo(Math.PI / 12)
        expect(stepOrbit('Numpad8')[1]).toBeCloseTo(-Math.PI / 12)
        expect(stepOrbit('Numpad5')).toBeNull()
        expect(stepPan('Numpad8')).toEqual([0, 1])
        expect(stepZoom('NumpadAdd')).toBeLessThan(1)
        expect(stepZoom('NumpadSubtract')).toBeGreaterThan(1)
        expect(stepZoom('KeyA')).toBeNull()
    })
})

describe('unstick', () => {
    it('clear space asks for nothing', () => {
        expect(nudgeOut([{ direction: [0, -1, 0], distance: 1, normal: [0, 1, 0], frontFacing: true }])).toBeNull()
        expect(nudgeOut([])).toBeNull()
    })
    it('a surface too near pushes out along its normal by the deficit', () => {
        const p = nudgeOut([{ direction: [0, 0, -1], distance: 0.05, normal: [0, 0, 1], frontFacing: true }])
        expect(p[2]).toBeCloseTo(NEAR_LIMIT - 0.05)
    })
    it('inside a solid (a back face this near) leaves through it', () => {
        const p = nudgeOut([{ direction: [1, 0, 0], distance: 0.05, normal: [-1, 0, 0], frontFacing: false }])
        expect(p[0]).toBeCloseTo(0.05 + NEAR_LIMIT)
    })
    it('the floor is a floor', () => {
        expect(liftAboveFloor(-3)).toBe(0.3)
        expect(liftAboveFloor(1.7)).toBe(1.7)
    })
})

describe('home glide and taps', () => {
    it('never a jump, never a crawl', () => {
        expect(glideSmoothTime(0)).toBe(0.28)
        expect(glideSmoothTime(1000)).toBe(0.5)
        expect(glideSmoothTime(100)).toBeGreaterThan(glideSmoothTime(10))
    })
    it('a tap is short and still; two close ones are a double tap', () => {
        expect(isTap({ t: 0, x: 10, y: 10 }, { t: 120, x: 12, y: 11 })).toBe(true)
        expect(isTap({ t: 0, x: 10, y: 10 }, { t: 500, x: 10, y: 10 })).toBe(false)
        expect(isTap({ t: 0, x: 10, y: 10 }, { t: 100, x: 60, y: 10 })).toBe(false)
        expect(isDoubleTap({ t: 0, x: 10, y: 10 }, { t: 250, x: 20, y: 12 })).toBe(true)
        expect(isDoubleTap({ t: 0, x: 10, y: 10 }, { t: 900, x: 10, y: 10 })).toBe(false)
        expect(isDoubleTap(null, { t: 1, x: 0, y: 0 })).toBe(false)
    })
})

describe('mouse', () => {
    it('Blender: middle orbits, Shift pans, Ctrl zooms; Alt+left is the emulated middle', () => {
        expect(mouseAction(1)).toBe('rotate')
        expect(mouseAction(1, { shift: true })).toBe('truck')
        expect(mouseAction(1, { ctrl: true })).toBe('dolly')
        expect(mouseAction(0, { alt: true })).toBe('rotate')
        expect(mouseAction(0, { alt: true, shift: true })).toBe('truck')
        expect(mouseAction(0, { alt: true, ctrl: true })).toBe('dolly')
    })
    it('a plain left or right press keeps the viewer\'s own binding', () => {
        expect(mouseAction(0)).toBeNull()
        expect(mouseAction(2)).toBeNull()
        expect(mouseAction(0, { shift: true })).toBeNull()
    })
})
