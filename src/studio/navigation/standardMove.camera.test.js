// The standard move with the real camera-controls 2.10.1 driven through the real hooks (useCameraNavigation, useWalkNavigation).
// Built from the review-move agent's harness (2026-10-13), whose assertions encoded the defects; these encode the fixes.
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as THREE from 'three'
import CameraControls from 'camera-controls'
import { renderHook, act } from '@testing-library/react'
import { autoSpeedFor, useCameraNavigation } from './useCameraNavigation.js'
import { useWalkNavigation } from './useWalkNavigation.js'
import { controlBindingsFor, mouseButtonsFor } from './mappings.js'
import { slideMetresPerPixel } from './freeMove.js'

CameraControls.install({ THREE })
const V = THREE.Vector3
const STEP = 2.724

let rafQ = [], now = 1000
vi.stubGlobal('requestAnimationFrame', (cb) => { rafQ.push(cb); return rafQ.length })
vi.stubGlobal('cancelAnimationFrame', () => {})
function runFrames(n, dtMs, cc) {
    for (let i = 0; i < n; i += 1) {
        now += dtMs
        const q = rafQ; rafQ = []
        for (const cb of q) cb(now)
        if (cc) cc.update(dtMs / 1000)
    }
}
const settle = (cc) => { for (let i = 0; i < 600; i += 1) cc.update(1 / 60) }

const mounted = []
afterEach(() => { for (const h of mounted.splice(0)) h.unmount(); document.body.innerHTML = ''; rafQ = [] })

function entity(id, size, pos) {
    const g = new THREE.Group(); g.userData.svEntityId = id
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshBasicMaterial())
    m.position.set(...pos); g.add(m); return g
}
function setup({ presetId = 'studio', speed = STEP, turn = 'point', scene = new THREE.Scene(), orbitSelection = false, selectedEntityIds = null, smooth = 0.25, drag = 0.125, walk = false } = {}) {
    const el = document.createElement('div'); document.body.appendChild(el)
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1600, height: 900, right: 1600, bottom: 900, x: 0, y: 0 })
    el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; el.requestPointerLock = () => {}
    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 5000)
    const cc = new CameraControls(cam, el)
    cc.smoothTime = smooth; cc.draggingSmoothTime = drag; cc.infinityDolly = true
    const b = controlBindingsFor(presetId); cc.mouseButtons = b.mouseButtons; cc.touches = b.touches
    scene.updateMatrixWorld(true)
    cc.setLookAt(0, 1.6, 0, 0, 1.6, -27.24, false); cc.update(0)
    const controlsRef = { current: cc }
    const getScene = () => scene
    const h = renderHook((p) => { if (walk) useWalkNavigation({ controlsRef, active: true }); useCameraNavigation(p) },
        { initialProps: { controlsRef, presetId, getScene, speed, turn, orbitSelection, selectedEntityIds } })
    mounted.push(h)
    return { el, cam, cc, h, scene, controlsRef, getScene }
}
const PE = window.PointerEvent || window.MouseEvent
function pe(type, init = {}) {
    const e = new PE(type, { bubbles: true, cancelable: true, clientX: 800, clientY: 450, ...init })
    Object.defineProperty(e, 'pointerId', { value: init.pointerId ?? 1 })
    Object.defineProperty(e, 'pointerType', { value: init.pointerType ?? 'mouse' })
    return e
}
const key = (type, init) => new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })
const wheel = (el, init) => el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, deltaMode: 0, ...init }))

describe('the standard move with the real camera-controls', () => {
    it('a slide that starts mid-glide never jumps: the next frame moves like the glide\'s own frames', () => {
        const { el, cam, cc } = setup()
        act(() => { wheel(el, { shiftKey: true }) })
        let prev
        for (let i = 0; i < 6; i += 1) { prev = cam.position.z; cc.update(1 / 60) }
        const normal = Math.abs(cam.position.z - prev), zMid = cam.position.z
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })) })
        cc.update(1 / 60)
        act(() => { document.dispatchEvent(pe('pointerup', { button: 2, buttons: 0 })) })
        expect(Math.abs(cam.position.z - zMid)).toBeLessThan(2 * normal)
    })
    it('a turn that starts mid-glide keeps the whole notch (Shift: 5 steps)', () => {
        const { el, cam, cc } = setup()
        act(() => { wheel(el, { shiftKey: true }) })
        for (let i = 0; i < 6; i += 1) cc.update(1 / 60)
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 0, buttons: 1 })) })
        act(() => { document.dispatchEvent(pe('pointerup', { button: 0, buttons: 0 })) })
        settle(cc)
        expect(-cam.position.z).toBeCloseTo(5 * STEP, 1)
    })
    it('after an Orbit Around Selection turn, later turn starts do not shift the camera', () => {
        const scene = new THREE.Scene(); scene.add(entity('a', [1, 1, 1], [8, 1.6, -20]))
        const { el, cam, cc, h, controlsRef, getScene } = setup({ scene, orbitSelection: true, selectedEntityIds: ['a'] })
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 0, buttons: 1 })); document.dispatchEvent(pe('pointerup', { button: 0, buttons: 0 })) }); settle(cc)
        h.rerender({ controlsRef, presetId: 'studio', getScene, speed: STEP, turn: 'point', orbitSelection: true, selectedEntityIds: [] })
        const p = [cam.position.clone()]
        for (let i = 0; i < 3; i += 1) {
            act(() => { el.dispatchEvent(pe('pointerdown', { button: 0, buttons: 1 })); document.dispatchEvent(pe('pointerup', { button: 0, buttons: 0 })) }); settle(cc)
            p.push(cam.position.clone())
        }
        for (let i = 1; i < p.length; i += 1) expect(p[i].distanceTo(p[i - 1])).toBeLessThan(1e-3)
    })
    it('after a Walk that saw Shift released, the next flight is one step a second', () => {
        const { el, cc } = setup({ walk: true })
        act(() => {
            document.body.dispatchEvent(key('keydown', { key: 'Shift', code: 'ShiftLeft', shiftKey: true }))
            document.body.dispatchEvent(key('keydown', { key: '~', code: 'Backquote', shiftKey: true }))
            document.body.dispatchEvent(key('keyup', { key: 'Shift', code: 'ShiftLeft', shiftKey: false }))
            document.body.dispatchEvent(key('keyup', { key: '`', code: 'Backquote' }))
            document.body.dispatchEvent(key('keydown', { key: 'Escape', code: 'Escape' }))
            document.body.dispatchEvent(key('keyup', { key: 'Escape', code: 'Escape' }))
        })
        runFrames(3, 16, null); settle(cc)
        const a = cc.getPosition(new V(), true).clone()
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })); document.body.dispatchEvent(key('keydown', { key: 'w', code: 'KeyW' })) })
        runFrames(61, 1000 / 60, cc)
        act(() => { document.body.dispatchEvent(key('keyup', { key: 'w', code: 'KeyW' })); document.dispatchEvent(pe('pointerup', { button: 2, buttons: 0 })) })
        const flown = cc.getPosition(new V(), true).distanceTo(a)
        expect(flown).toBeGreaterThan(STEP * 0.9); expect(flown).toBeLessThan(STEP * 1.1)
    })
    it('flying at 10 fps still covers one step a second', () => {
        const { el, cc } = setup()
        const a = cc.getPosition(new V(), true).clone()
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })); document.body.dispatchEvent(key('keydown', { key: 'w', code: 'KeyW' })) })
        runFrames(11, 100, cc)
        act(() => { document.body.dispatchEvent(key('keyup', { key: 'w', code: 'KeyW' })); document.dispatchEvent(pe('pointerup', { button: 2, buttons: 0 })) })
        const flown = cc.getPosition(new V(), true).distanceTo(a)
        expect(flown).toBeGreaterThan(STEP * 0.9); expect(flown).toBeLessThan(STEP * 1.1)
    })
    it('a flight sends its own end when W is released before the right button, and starts and ends balance', () => {
        const { el, cc } = setup({ presetId: 'blender', drag: 0, smooth: 0.2 }) // Edit: the right button is free, so no slide
        let starts = 0, ends = 0
        cc.addEventListener('controlstart', () => { starts += 1 }); cc.addEventListener('controlend', () => { ends += 1 })
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })); document.body.dispatchEvent(key('keydown', { key: 'w', code: 'KeyW' })) })
        runFrames(30, 1000 / 60, cc)
        const endsBefore = ends
        act(() => { document.body.dispatchEvent(key('keyup', { key: 'w', code: 'KeyW' })) })
        expect(ends - endsBefore).toBe(1) // the flight ends when its last key is up, so the Studio keeps the flown view
        act(() => { document.dispatchEvent(pe('pointerup', { button: 2, buttons: 0 })) })
        expect(starts).toBe(ends) // camera-controls' own press start and end, and the flight's: balanced
    })
    it('the automatic speed: provisional while loading, fixed once idle, kept across a tool switch', () => {
        const scene = new THREE.Scene()
        let loading = true, size = 1
        const read = () => size / 40
        expect(autoSpeedFor(scene, { read, loading: () => loading })).toBeCloseTo(0.025, 9) // a chair, still loading
        size = 100; loading = false
        expect(autoSpeedFor(scene, { read, loading: () => loading })).toBeCloseTo(2.5, 9) // the hall arrived: taken again, fixed
        size = 1
        expect(autoSpeedFor(scene, { read, loading: () => loading })).toBeCloseTo(2.5, 9) // fixed for the visit
        const s2 = new THREE.Scene(); s2.add(entity('hall', [100, 20, 40], [0, 10, -20])); s2.updateMatrixWorld(true)
        const { el, cc, h, controlsRef } = setup({ scene: s2, speed: 'auto', presetId: 'blender', smooth: 0.2, drag: 0 })
        const step = () => { const a = cc.getPosition(new V(), true); act(() => { wheel(el, {}) }); return cc.getPosition(new V(), true).distanceTo(a) }
        const first = step()
        h.rerender({ controlsRef, presetId: 'studio', getScene: () => s2, speed: 'auto', turn: 'point', orbitSelection: false, selectedEntityIds: null })
        expect(first).toBeCloseTo(2.5, 6); expect(step()).toBeCloseTo(first, 6)
    })
    it('a two-finger pinch moves the standard metres for the same spread, around a point or in place', () => {
        for (const turn of ['point', 'place']) {
            const { el, cc } = setup({ turn, drag: 0, smooth: 0.2 })
            const a = cc.getPosition(new V(), true).clone()
            act(() => {
                el.dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: 11, clientX: 750, clientY: 450 }))
                el.dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: 12, clientX: 850, clientY: 450 }))
                document.dispatchEvent(pe('pointermove', { pointerType: 'touch', pointerId: 11, clientX: 700, clientY: 450 }))
                document.dispatchEvent(pe('pointermove', { pointerType: 'touch', pointerId: 12, clientX: 900, clientY: 450 }))
                document.dispatchEvent(pe('pointerup', { pointerType: 'touch', pointerId: 11, clientX: 700, clientY: 450 }))
                document.dispatchEvent(pe('pointerup', { pointerType: 'touch', pointerId: 12, clientX: 900, clientY: 450 }))
            })
            settle(cc)
            expect(cc.getPosition(new V(), true).distanceTo(a)).toBeCloseTo(STEP, 3) // fingers 100 px further apart: one step
        }
    })
    it('Inside\'s boundary: a 1 px slide after three Shift notches toward the end wall moves 1 px worth, not metres', () => {
        const { el, cam, cc } = setup()
        cc.setBoundary(new THREE.Box3(new V(-10, 0, -50), new V(10, 10, 5)))
        for (let i = 0; i < 3; i += 1) { act(() => { wheel(el, { shiftKey: true }) }); settle(cc) }
        const before = cam.position.clone()
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })); document.dispatchEvent(pe('pointermove', { buttons: 2, clientX: 801 })); document.dispatchEvent(pe('pointerup', { button: 2, buttons: 0, clientX: 801 })) })
        settle(cc)
        expect(cam.position.distanceTo(before)).toBeLessThan(10 * slideMetresPerPixel(10 * STEP, 50, 900))
    })
    it('a slide clears a double-click focus: the next turn is around the standard point again', () => {
        const scene = new THREE.Scene(); scene.add(entity('wall', [20, 20, 0.2], [0, 1.6, -5]))
        const { el, cc } = setup({ scene })
        act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 800, clientY: 450 })) }); settle(cc)
        expect(cc.distance).toBeLessThan(6)
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })); document.dispatchEvent(pe('pointermove', { buttons: 2, clientX: 820 })); document.dispatchEvent(pe('pointerup', { button: 2, buttons: 0, clientX: 820 })) })
        settle(cc)
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 0, buttons: 1 })) })
        expect(cc.distance).toBeCloseTo(10 * STEP, 2)
        act(() => { document.dispatchEvent(pe('pointerup', { button: 0, buttons: 0 })) })
    })
    it('a slide whose button release was lost stops at the next move without the button', () => {
        const { el, cam, cc } = setup()
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })) })
        act(() => { window.dispatchEvent(new Event('blur')) })
        settle(cc)
        const a = cam.position.clone()
        act(() => { document.dispatchEvent(pe('pointermove', { buttons: 0, clientX: 900 })) })
        settle(cc)
        expect(cam.position.distanceTo(a)).toBeLessThan(1e-6)
    })
    it('a slide follows the pointer: right moves the camera to its left, down moves it up', () => {
        const { el, cam, cc } = setup({ drag: 0, smooth: 0.2 })
        cc.setLookAt(0, 3, 10, 5, 1, -15, false); cc.update(0)
        const right = new V().setFromMatrixColumn(cam.matrix, 0), up = new V().setFromMatrixColumn(cam.matrix, 1)
        const moveOf = (mx, my) => {
            const a = cam.position.clone()
            act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })); document.dispatchEvent(pe('pointermove', { buttons: 2, clientX: 800 + mx, clientY: 450 + my })); document.dispatchEvent(pe('pointerup', { button: 2, buttons: 0, clientX: 800 + mx, clientY: 450 + my })) })
            settle(cc)
            return cam.position.clone().sub(a)
        }
        const r = moveOf(20, 0), d = moveOf(0, 20)
        expect(r.dot(right)).toBeLessThan(0); expect(Math.abs(r.dot(up))).toBeLessThan(1e-6)
        expect(d.dot(up)).toBeGreaterThan(0); expect(r.length()).toBeCloseTo(d.length(), 6) // the same metres in every direction
    })
    describe('multi-touch edge cases of the two-finger move', () => {
        const T = (type, id, x, y = 450) => pe(type, { pointerType: 'touch', pointerId: id, clientX: x, clientY: y, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1 })
        const down = (el, id, x, y) => act(() => { el.dispatchEvent(T('pointerdown', id, x, y)) })
        const move = (id, x, y) => act(() => { document.dispatchEvent(T('pointermove', id, x, y)) })
        const up = (id, x, y) => act(() => { document.dispatchEvent(T('pointerup', id, x, y)) })
        const cancel = (id, x, y) => act(() => { document.dispatchEvent(T('pointercancel', id, x, y)) })
        const counted = (cc) => { // camera-controls' own events (no originalEvent) fire per finger down and once at the last lift, so only the hook's own are counted
            const c = { starts: 0, ends: 0 }; cc.addEventListener('controlstart', (e) => { if (e.originalEvent) c.starts += 1 }); cc.addEventListener('controlend', (e) => { if (e.originalEvent) c.ends += 1 }); return c }
        const pos = (cc) => cc.getPosition(new V(), true).clone()

        it('a third finger landing and lifting moves nothing by itself, and the pair carries on from where it is', () => {
            const { el, cc } = setup({ drag: 0, smooth: 0.2 })
            const c = counted(cc)
            down(el, 11, 750); down(el, 12, 850)
            move(11, 700); move(12, 900); settle(cc)
            const a = pos(cc)
            down(el, 13, 400, 300)
            move(13, 380, 280); move(11, 650); move(12, 950) // the pair keeps spreading while three are down
            up(13, 380, 280); settle(cc)
            const b = pos(cc)
            move(11, 650); move(12, 950); settle(cc) // no change in the pair: the lift of the third must not move anything
            expect(pos(cc).distanceTo(b)).toBeLessThan(1e-6)
            up(11, 650); up(12, 950); settle(cc)
            expect(c.starts).toBe(c.ends)
            expect(pos(cc).distanceTo(a)).toBeLessThan(2 * STEP) // the spread beyond 3 fingers is bounded: no spurious jump
        })
        it('when the pair\'s first finger lifts under a third, the new pair does not jump', () => {
            const { el, cc } = setup({ drag: 0, smooth: 0.2 })
            down(el, 11, 750); down(el, 12, 850); down(el, 13, 1200, 450)
            settle(cc)
            const a = pos(cc)
            up(11, 750) // pair becomes 12 and 13, 350 px apart where 11 and 12 were 100
            settle(cc)
            move(12, 850); move(13, 1200); settle(cc) // nobody moved
            expect(pos(cc).distanceTo(a)).toBeLessThan(1e-6)
        })
        it('one finger lifting mid-pinch ends the pinch, and landing again starts a fresh one with no jump', () => {
            const { el, cc } = setup({ drag: 0, smooth: 0.2 })
            const c = counted(cc)
            down(el, 11, 750); down(el, 12, 850)
            move(11, 700); move(12, 900); settle(cc)
            up(11, 700)
            const a = pos(cc)
            move(12, 1000); settle(cc) // the lone finger is not a pinch: no forward move from it
            const lone = pos(cc)
            down(el, 14, 300)
            move(12, 1000); move(14, 300); settle(cc) // nothing moved since landing
            expect(pos(cc).distanceTo(lone)).toBeLessThan(1e-6)
            move(14, 200); settle(cc) // fingers 100 px further apart: one step
            expect(pos(cc).distanceTo(lone)).toBeCloseTo(STEP * 1, 0)
            up(12, 1000); up(14, 200)
            expect(c.starts).toBe(c.ends)
            expect(a.distanceTo(lone)).toBeLessThan(STEP * 1.5)
        })
        it('a pointercancel ends the pinch like a lift: balanced start and end, and later moves of the lost finger do nothing', () => {
            const { el, cc } = setup({ drag: 0, smooth: 0.2 })
            const c = counted(cc)
            down(el, 11, 750); down(el, 12, 850)
            move(11, 700); settle(cc)
            cancel(11, 700); settle(cc)
            const a = pos(cc)
            move(11, 100); move(12, 1500); settle(cc)
            expect(pos(cc).distanceTo(a)).toBeLessThan(1e-6)
            cancel(12, 850)
            expect(c.starts).toBe(c.ends)
            // and a whole new pinch works afterwards
            const b = pos(cc)
            down(el, 21, 750); down(el, 22, 850); move(21, 700); move(22, 900); up(21, 700); up(22, 900); settle(cc)
            expect(pos(cc).distanceTo(b)).toBeCloseTo(STEP, 3)
        })
        it('a pinch while a mouse slide is held: the slide keeps its button and both ends balance', () => {
            const { el, cc } = setup({ drag: 0, smooth: 0.2 })
            const c = counted(cc)
            act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })) })
            down(el, 11, 750); down(el, 12, 850)
            move(11, 700); move(12, 900)
            up(11, 700); up(12, 900)
            act(() => { document.dispatchEvent(pe('pointermove', { buttons: 2, clientX: 820 })) })
            settle(cc)
            const a = pos(cc)
            act(() => { document.dispatchEvent(pe('pointermove', { buttons: 2, clientX: 840 })) }); settle(cc)
            expect(pos(cc).distanceTo(a)).toBeGreaterThan(0) // the mouse slide still follows the mouse
            act(() => { document.dispatchEvent(pe('pointerup', { button: 2, buttons: 0, clientX: 840 })) })
            expect(c.starts).toBe(c.ends)
        })
        it('a pinch while the right button flies: a finger moving does not end the flight', () => {
            const { el, cc } = setup({ drag: 0, smooth: 0.2 })
            act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })); document.body.dispatchEvent(key('keydown', { key: 'w', code: 'KeyW' })) })
            runFrames(10, 1000 / 60, cc)
            down(el, 11, 750); move(11, 740)
            const a = pos(cc)
            runFrames(30, 1000 / 60, cc)
            expect(pos(cc).distanceTo(a)).toBeGreaterThan(STEP * 0.3) // still flying
            act(() => { document.body.dispatchEvent(key('keyup', { key: 'w', code: 'KeyW' })); document.dispatchEvent(pe('pointerup', { button: 2, buttons: 0 })) })
            up(11, 740)
        })
        it('a one-finger turn, then a second finger: the turn ends, the pinch is a pinch only, and nothing jumps', () => {
            const { el, cam, cc } = setup({ drag: 0, smooth: 0.2 })
            const c = counted(cc)
            down(el, 11, 750)
            move(11, 700); settle(cc)
            const yaw0 = cc.azimuthAngle
            down(el, 12, 900); settle(cc)
            const a = pos(cc)
            move(11, 650); move(12, 950); settle(cc) // 100 px of spread
            expect(cc.azimuthAngle).toBeCloseTo(yaw0, 6) // the first finger no longer turns
            expect(pos(cc).distanceTo(a)).toBeCloseTo(STEP, 3)
            up(11, 650); up(12, 950); settle(cc)
            expect(cam.position.distanceTo(a)).toBeCloseTo(STEP, 3)
            expect(c.starts).toBe(c.ends)
        })
    })
})

describe('Inside\'s lock box and the double-click focus', () => {
    it('a move stops at the box with its turning point: the turning distance stays, out as in', async () => {
        const { clampMoveToBox } = await import('./useCameraNavigation.js')
        const box = { min: [-10, 0, -50], max: [10, 10, 5] }
        const d = clampMoveToBox(new V(0, 1.6, 3), new V(0, 0, 5), box)
        expect(d.z).toBeCloseTo(2, 9) // only to the wall at z 5
        const { el, cam, cc } = setup({ drag: 0, smooth: 0.2 })
        cc.userData = { diLockBox: box }
        const dist0 = cc.distance
        for (let i = 0; i < 4; i += 1) { act(() => { wheel(el, { deltaY: 100 }) }); settle(cc) } // out, toward the wall at z 5
        expect(cam.position.z).toBeLessThanOrEqual(5 + 1e-6)
        expect(cc.distance).toBeCloseTo(dist0, 6) // the turning point stopped with the camera
    })
    it('a focus ends when something else moves the turning point (the view bar, Frame)', () => {
        const scene = new THREE.Scene(); scene.add(entity('wall', [20, 20, 0.2], [0, 1.6, -5]))
        const { el, cc } = setup({ scene })
        act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 800, clientY: 450 })) }); settle(cc)
        cc.setLookAt(30, 10, 30, 0, 0, 0, false); cc.update(0) // a view command
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 0, buttons: 1 })) })
        const endDistance = cc.getTarget(new V(), true).distanceTo(cc.getPosition(new V(), true))
        expect(endDistance).toBeCloseTo(10 * STEP, 2) // the standard turning point, not the old focus
        act(() => { document.dispatchEvent(pe('pointerup', { button: 0, buttons: 0 })) })
    })
})

describe('flight moves at once', () => {
    it('one second of W puts the camera itself one step ahead, and it stops when the key is up', () => {
        const { el, cam, cc } = setup()
        const a = cam.position.clone()
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })); document.body.dispatchEvent(key('keydown', { key: 'w', code: 'KeyW' })) })
        runFrames(61, 1000 / 60, cc)
        act(() => { document.body.dispatchEvent(key('keyup', { key: 'w', code: 'KeyW' })); document.dispatchEvent(pe('pointerup', { button: 2, buttons: 0 })) })
        const atRelease = cam.position.distanceTo(a)
        expect(atRelease).toBeGreaterThan(STEP * 0.95); expect(atRelease).toBeLessThan(STEP * 1.05)
        const b = cam.position.clone(); settle(cc)
        expect(cam.position.distanceTo(b)).toBeLessThan(1e-3) // no tail after the key is up
    })
})

describe('turning in place right after another move', () => {
    it('a turn in place right after a flight (camera-controls not yet rested) stays in place', () => {
        const { el, cam, cc } = setup({ turn: 'place' })
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 2, buttons: 2 })); document.body.dispatchEvent(key('keydown', { key: 'w', code: 'KeyW' })) })
        runFrames(10, 1000 / 60, cc)
        act(() => { document.body.dispatchEvent(key('keyup', { key: 'w', code: 'KeyW' })); document.dispatchEvent(pe('pointerup', { button: 2, buttons: 0 })) })
        const a = cam.position.clone()
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 0, buttons: 1 })) })
        for (let i = 1; i <= 10; i += 1) { act(() => { document.dispatchEvent(pe('pointermove', { buttons: 1, clientX: 800 + 20 * i })) }); cc.update(1 / 60) }
        act(() => { document.dispatchEvent(pe('pointerup', { button: 0, buttons: 0, clientX: 1000 })) })
        settle(cc)
        expect(cam.position.distanceTo(a)).toBeLessThan(0.005)
    })
})

// Second review (2026-10-13, review/standard-move-2): each case below failed before its fix.
describe('the standard move, second review', () => {
    it('a chord never runs camera-controls\' own zoom: StudioViewport puts the resting bindings back after the hook set them aside', () => {
        const { el, cc } = setup({ drag: 0, smooth: 0.2 })
        // StudioViewport's own effect, which runs after this hook's (declared later in StudioOrbit) and on every tool switch
        act(() => { Object.assign(cc.mouseButtons, mouseButtonsFor('studio')) })
        const d0 = cc.distance
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 0, buttons: 1 })) }) // a turn
        // the middle button pressed mid-turn: a chord arrives as a pointermove with more buttons, never as a pointerdown
        for (const y of [450, 550, 650]) { act(() => { document.dispatchEvent(pe('pointermove', { buttons: 1 | 4, clientY: y })) }); cc.update(1 / 60) }
        act(() => { document.dispatchEvent(pe('pointerup', { button: 0, buttons: 0, clientY: 650 })) })
        settle(cc)
        expect(cc.distance).toBeCloseTo(d0, 6) // the turning point stays 10 steps ahead: no zoom that scales with the distance
    })
    it('a third finger lifted mid-pinch does not jump: the next 1 px moves 1 px worth', () => {
        const { el, cc } = setup({ drag: 0, smooth: 0.2 })
        act(() => {
            el.dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: 11, clientX: 750, clientY: 450 }))
            el.dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: 12, clientX: 850, clientY: 450 }))
            el.dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: 13, clientX: 400, clientY: 450 }))
            document.dispatchEvent(pe('pointerup', { pointerType: 'touch', pointerId: 11, clientX: 750, clientY: 450 }))
        })
        settle(cc)
        const a = cc.getPosition(new V(), true).clone()
        act(() => { document.dispatchEvent(pe('pointermove', { pointerType: 'touch', pointerId: 12, clientX: 851, clientY: 450 })) })
        settle(cc)
        expect(cc.getPosition(new V(), true).distanceTo(a)).toBeLessThan(0.02 * STEP)
        act(() => {
            document.dispatchEvent(pe('pointerup', { pointerType: 'touch', pointerId: 12, clientX: 851, clientY: 450 }))
            document.dispatchEvent(pe('pointerup', { pointerType: 'touch', pointerId: 13, clientX: 400, clientY: 450 }))
        })
    })
    it('with Orbit Around Selection on, a turn that starts mid-glide keeps the whole notch', () => {
        const scene = new THREE.Scene(); scene.add(entity('a', [1, 1, 1], [8, 1.6, -20])); scene.updateMatrixWorld(true)
        const { el, cam, cc } = setup({ scene, orbitSelection: true, selectedEntityIds: ['a'] })
        act(() => { wheel(el, { shiftKey: true }) })
        for (let i = 0; i < 6; i += 1) cc.update(1 / 60)
        act(() => { el.dispatchEvent(pe('pointerdown', { button: 0, buttons: 1 })) })
        act(() => { document.dispatchEvent(pe('pointerup', { button: 0, buttons: 0 })) })
        settle(cc)
        expect(-cam.position.z).toBeCloseTo(5 * STEP, 1)
        expect(cam.position.x).toBeCloseTo(0, 3)
    })
    it('a one-finger touch that starts mid-glide keeps the whole pinch', () => {
        const { el, cam, cc } = setup()
        act(() => {
            el.dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: 11, clientX: 750, clientY: 450 }))
            el.dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: 12, clientX: 850, clientY: 450 }))
            document.dispatchEvent(pe('pointermove', { pointerType: 'touch', pointerId: 11, clientX: 550, clientY: 450 }))
            document.dispatchEvent(pe('pointermove', { pointerType: 'touch', pointerId: 12, clientX: 1050, clientY: 450 }))
            document.dispatchEvent(pe('pointerup', { pointerType: 'touch', pointerId: 11, clientX: 550, clientY: 450 }))
            document.dispatchEvent(pe('pointerup', { pointerType: 'touch', pointerId: 12, clientX: 1050, clientY: 450 }))
        })
        for (let i = 0; i < 3; i += 1) cc.update(1 / 60)
        act(() => {
            el.dispatchEvent(pe('pointerdown', { pointerType: 'touch', pointerId: 14, clientX: 800, clientY: 450 }))
            document.dispatchEvent(pe('pointerup', { pointerType: 'touch', pointerId: 14, clientX: 800, clientY: 450 }))
        })
        settle(cc)
        expect(-cam.position.z).toBeCloseTo(4 * STEP, 1) // fingers 400 px further apart: four steps, all of them
    })
    it('Walk at 5 fps still covers its 2.5 m a second', () => {
        const { cc } = setup({ walk: true })
        const a = cc.camera.position.clone()
        act(() => {
            document.body.dispatchEvent(key('keydown', { key: '~', code: 'Backquote', shiftKey: true }))
            document.body.dispatchEvent(key('keydown', { key: 'w', code: 'KeyW' }))
        })
        runFrames(6, 200, null) // the first frame only starts the clock: five frames of 0.2 s
        const walked = cc.camera.position.distanceTo(a)
        act(() => { document.body.dispatchEvent(key('keyup', { key: 'w', code: 'KeyW' })); document.body.dispatchEvent(key('keydown', { key: 'Escape', code: 'Escape' })) })
        expect(walked).toBeGreaterThan(2.5 * 0.85); expect(walked).toBeLessThan(2.5 * 1.05)
    })
    it('a model still downloading keeps the automatic speed provisional, and no drei Loader starts for it (modelLoads.js)', async () => {
        vi.resetModules()
        vi.doMock('@react-three/fiber', () => ({ useThree: (sel) => sel({ gl: null, invalidate: () => {} }), useFrame: () => {} }))
        vi.doMock('../../storage/assetStore.js', () => ({ getAssetBlob: async () => null, deleteAsset: async () => {} }))
        vi.doMock('../../services/assetSources.js', () => ({ getAssetSourceUrl: () => '/hall.glb', streamRemoteAsset: async () => null }))
        let finish
        const fetchStub = vi.fn(() => new Promise((resolve) => { finish = resolve }))
        vi.stubGlobal('fetch', fetchStub)
        try {
            const { default: ModelObject } = await import('../../objectComponents/ModelObject.jsx')
            // the same fresh module graph as ModelObject's, so both see one count of models in flight
            const { autoSpeedFor: autoSpeedNow } = await import('./useCameraNavigation.js')
            const { useProgress } = await import('@react-three/drei')
            const { createElement } = await import('react')
            const { render } = await import('@testing-library/react')
            const r = render(createElement(ModelObject, { assetRef: { id: 'hall' } }))
            await vi.waitFor(() => expect(fetchStub).toHaveBeenCalled())
            const scene = new THREE.Scene()
            let size = 1 // the chair that is already in
            const read = () => size / 40
            expect(useProgress.getState().active).toBe(false) // the V1 editor's <Loader/> overlay stays away
            expect(autoSpeedNow(scene, { read })).toBeCloseTo(0.025, 9)
            size = 100 // the hall arrived
            expect(autoSpeedNow(scene, { read })).toBeCloseTo(2.5, 9) // taken again: the chair's reading was provisional
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            finish({ ok: false, headers: { get: () => '' } }) // the download ends (here in an error): loading is idle again
            await vi.waitFor(() => { const s = new THREE.Scene(); autoSpeedNow(s, { read: () => 7 }); expect(autoSpeedNow(s, { read: () => 9 })).toBe(7) })
            warn.mockRestore()
            r.unmount()
        } finally {
            vi.doUnmock('@react-three/fiber'); vi.doUnmock('../../storage/assetStore.js'); vi.doUnmock('../../services/assetSources.js')
            vi.unstubAllGlobals()
            vi.stubGlobal('requestAnimationFrame', (cb) => { rafQ.push(cb); return rafQ.length })
            vi.stubGlobal('cancelAnimationFrame', () => {})
        }
    })
})
