// Unit guard for #892's stated behaviour: a move takes its speed from the scene distance (sceneDistance.js), never from the
// surface under the pointer. Drives the real wheel handler of useCameraNavigation with a fake controls object and a stubbed
// depth picture (the GPU read is not unit-testable here; the picture itself is measured by scripts/nav/probe-depth-picture.cjs).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { PerspectiveCamera, Scene, Vector3 } from 'three'

const measure = vi.fn()
vi.mock('./sceneDistance.js', async (importOriginal) => ({
    ...(await importOriginal()),
    createSceneDistance: () => ({ measure, dispose: vi.fn() }),
}))

const { useCameraNavigation } = await import('./useCameraNavigation.js')

function rig() {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const camera = new PerspectiveCamera(50, 1.6, 0.1, 1000)
    camera.position.set(0, 0, 0); camera.lookAt(0, 0, -1); camera.updateMatrixWorld(true)
    const cc = {
        _domElement: element, camera, active: false, distance: 10, minDistance: 0.1, maxDistance: 500, mouseButtons: {},
        update: vi.fn(), stop: vi.fn(), setOrbitPoint: vi.fn(), setLookAt: vi.fn(), dispatchEvent: vi.fn(),
    }
    return { element, cc }
}
const wheel = (element, init = {}) => {
    const e = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true, ...init })
    element.dispatchEvent(e)
}
const mount = (cc, presetId) => renderHook(() => useCameraNavigation({ controlsRef: { current: cc }, presetId, getScene: () => new Scene(), getGl: () => ({}) }))
// how far the last setLookAt moved the camera along its view axis (-z)
const moved = (cc) => { const a = cc.setLookAt.mock.calls.at(-1); return -a[2] }

let ctx
beforeEach(() => { measure.mockReset(); ctx = rig() })
afterEach(() => { ctx.element.remove() })

describe('the Blender tool\'s wheel: speed from the scene distance', () => {
    it('one notch in moves 1 - 1/1.2 of the MEASURED scene distance, not of the orbit distance', () => {
        measure.mockReturnValue(30)
        const { unmount } = mount(ctx.cc, 'blender')
        wheel(ctx.element)
        expect(measure).toHaveBeenCalledTimes(1)
        expect(moved(ctx.cc)).toBeCloseTo(30 * (1 - 1 / 1.2), 6) // cc.distance is 10: that would give 1.67
        unmount()
    })
    it('the pointer\'s place makes no difference: same scene distance, same step wherever the cursor is', () => {
        measure.mockReturnValue(12)
        const { unmount } = mount(ctx.cc, 'blender')
        wheel(ctx.element, { clientX: 5, clientY: 5 }); const a = moved(ctx.cc)
        ctx.cc.camera.position.set(0, 0, 0); ctx.cc.camera.updateMatrixWorld(true)
        wheel(ctx.element, { clientX: 700, clientY: 400 }); const b = moved(ctx.cc)
        expect(a).toBeCloseTo(b, 6)
        unmount()
    })
    it('nothing measured: the orbit distance it already has is used', () => {
        measure.mockReturnValue(null)
        const { unmount } = mount(ctx.cc, 'blender')
        wheel(ctx.element)
        expect(moved(ctx.cc)).toBeCloseTo(10 * (1 - 1 / 1.2), 6)
        unmount()
    })
    it('a notch out never leaves the controls\' range (500 m)', () => {
        measure.mockReturnValue(450)
        const { unmount } = mount(ctx.cc, 'blender')
        wheel(ctx.element, { deltaY: 100 })
        const a = ctx.cc.setLookAt.mock.calls.at(-1)
        const eye = new Vector3(a[0], a[1], a[2]), target = new Vector3(a[3], a[4], a[5])
        expect(eye.distanceTo(target)).toBeLessThanOrEqual(500 + 1e-6)
        unmount()
    })
    it('a run of notches against a sudden near lamp changes the distance by at most 1.2x per notch', () => {
        const seq = [30, 30, 1, 1, 1]
        let i = 0; measure.mockImplementation(() => seq[i++])
        const { unmount } = mount(ctx.cc, 'blender')
        const steps = []
        for (let n = 0; n < seq.length; n++) {
            const before = ctx.cc.camera.position.z
            wheel(ctx.element)
            const a = ctx.cc.setLookAt.mock.calls.at(-1)
            ctx.cc.camera.position.set(a[0], a[1], a[2]); ctx.cc.camera.updateMatrixWorld(true)
            steps.push(before - a[2])
        }
        for (let n = 1; n < steps.length; n++) expect(steps[n] / steps[n - 1]).toBeGreaterThanOrEqual(1 / 1.2 - 1e-6)
        unmount()
    })
})

describe('the Sketchfab tool is unchanged', () => {
    it('takes no depth picture on the wheel', () => {
        measure.mockReturnValue(30)
        const { unmount } = mount(ctx.cc, 'studio')
        wheel(ctx.element)
        expect(measure).not.toHaveBeenCalled()
        unmount()
    })
})
