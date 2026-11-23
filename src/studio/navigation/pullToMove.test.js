// The Studio's View | Edit (owner 2026-10-28) and its pull (pullToMove.js), with the real camera-controls 2.10.1 through the real
// hook, the same harness as standardMove.camera.test.js. What it holds: in View every pull is Move 1's, even on the selected thing;
// in Edit a pull that starts on the selected thing moves it on the floor plane at its height and the camera stays, every other drag
// is Move 1's, to the number; Alt and the middle button are the camera's; a locked thing and the place's own geometry never move.
// Move 1's own record is move1.golden.test.js, untouched.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import * as THREE from 'three'
import CameraControls from 'camera-controls'
import { renderHook, act } from '@testing-library/react'
import { useCameraNavigation } from './useCameraNavigation.js'
import { controlBindingsFor } from './mappings.js'
import { DEFAULT_MOVE_ID, MOVES } from './moves.js'
import { MOVE_STORAGE_KEY, getMovePreference, resetNavigationPreferenceMemory, setMovePreference } from './preference.js'
import {
    PULL_START_PX, PULL_TOOLS, createPull, pullPressAllowed, facingHit, isPlaceGeometry, movableForPull, planeHit, pullGoesToCamera, pullInProgress, pullTargetId,
} from './pullToMove.js'

CameraControls.install({ THREE })
vi.stubGlobal('requestAnimationFrame', () => 0)
vi.stubGlobal('cancelAnimationFrame', () => {})
const settle = (cc) => { for (let i = 0; i < 600; i += 1) cc.update(1 / 60) }

const mounted = []
afterEach(() => { for (const h of mounted.splice(0)) h.unmount(); document.body.innerHTML = '' })

const W = 1600, H = 900
const BOX = 'box-1'
function setup({ mode = 'edit', withPull = true, locked = false, components = {}, selected = [BOX], presetId = 'studio', onCommit = vi.fn() } = {}) {
    const el = document.createElement('div'); document.body.appendChild(el)
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H, x: 0, y: 0 })
    el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; el.requestPointerLock = () => {}
    const cam = new THREE.PerspectiveCamera(50, W / H, 0.01, 5000)
    const cc = new CameraControls(cam, el)
    cc.smoothTime = 0.25; cc.draggingSmoothTime = 0.125; cc.infinityDolly = true
    const b = controlBindingsFor(presetId); cc.mouseButtons = b.mouseButtons; cc.touches = b.touches
    // A 1 m box standing on the floor 10 m ahead, seen from 5 m up.
    const scene = new THREE.Scene()
    const group = new THREE.Group(); group.userData.svEntityId = BOX; group.position.set(0, 0.5, -10)
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()))
    scene.add(group); scene.updateMatrixWorld(true)
    cc.setLookAt(0, 5, 0, 0, 0.5, -10, false); cc.update(0)
    const entities = [{ id: BOX, type: 'box', components: { transform: { position: [0, 0.5, -10] }, runtime: { locked }, ...components } }]
    const live = { enabled: true, entities, selectedIds: selected, onCommit }
    const pull = createPull({ element: el, getCamera: () => cam, getScene: () => scene, getLive: () => live, getObject: (id) => (id === BOX ? group : null) })
    const controlsRef = { current: cc }
    const h = renderHook((p) => useCameraNavigation(p), {
        initialProps: { controlsRef, presetId, getScene: () => scene, speed: 2.724, turn: 'point', mode, pull: withPull ? pull : null },
    })
    mounted.push(h)
    const boxOnScreen = () => {
        cam.updateMatrixWorld()
        const p = group.getWorldPosition(new THREE.Vector3()).project(cam)
        return { x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H }
    }
    return { el, cam, cc, group, scene, onCommit, boxOnScreen }
}
const PE = window.PointerEvent || window.MouseEvent
function pe(type, init = {}) {
    const e = new PE(type, { bubbles: true, cancelable: true, clientX: 800, clientY: 450, ...init })
    Object.defineProperty(e, 'pointerId', { value: init.pointerId ?? 1 })
    Object.defineProperty(e, 'pointerType', { value: init.pointerType ?? 'mouse' })
    if (init.isPrimary !== undefined) Object.defineProperty(e, 'isPrimary', { value: init.isPrimary })
    return e
}
// A drag of (dx, dy) px from (x, y): down on the element, moves on the document, up.
function drag(env, { x, y, dx = 120, dy = 0, button = 0, buttons = 1, steps = 6, ...mods }) {
    act(() => { env.el.dispatchEvent(pe('pointerdown', { button, buttons, clientX: x, clientY: y, ...mods })) })
    for (let i = 1; i <= steps; i += 1) {
        act(() => { document.dispatchEvent(pe('pointermove', { button: -1, buttons, clientX: x + dx * i / steps, clientY: y + dy * i / steps, ...mods })) })
        env.cc.update(1 / 60)
    }
    act(() => { document.dispatchEvent(pe('pointerup', { button, buttons: 0, clientX: x + dx, clientY: y + dy, ...mods })) })
    settle(env.cc)
}
const camState = (cc) => [...cc.getPosition(new THREE.Vector3()).toArray(), ...cc.getTarget(new THREE.Vector3()).toArray()]
const near = (a, b, digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits))

describe('View | Edit: where a pull may start (pure)', () => {
    beforeEach(() => { resetNavigationPreferenceMemory(); try { window.localStorage.clear() } catch { /* no storage */ } })
    it('only in Edit; View (Navigate), Select, Walk and Fly never start a pull', () => {
        expect(PULL_TOOLS).toEqual(['edit'])
        expect(pullPressAllowed('edit')).toBe(true)
        for (const mode of ['navigate', 'select', 'walk', 'fly', undefined, null]) expect(pullPressAllowed(mode)).toBe(false)
    })
    it('Move 1 stays the camera\'s only move: no Move 2 in the list, a stored "move-2" reads as Move 1', () => {
        expect(MOVES.map((m) => m.id)).toEqual(['move-1'])
        expect(DEFAULT_MOVE_ID).toBe('move-1')
        window.localStorage.setItem(MOVE_STORAGE_KEY, 'move-2') // a browser that tried the Move 2 test copy
        resetNavigationPreferenceMemory()
        expect(getMovePreference()).toBe('move-1')
        expect(setMovePreference('move-2')).toBe('move-1')
    })
})

describe('Edit: which press is a pull (pure)', () => {
    it('only a plain left press or a first finger; Alt, Shift, Ctrl, Meta, the middle and right buttons go to the camera', () => {
        expect(pullGoesToCamera({ button: 0, pointerType: 'mouse' })).toBe(false)
        expect(pullGoesToCamera({ pointerType: 'touch', isPrimary: true })).toBe(false)
        expect(pullGoesToCamera({ pointerType: 'touch', isPrimary: false })).toBe(true)
        for (const k of ['altKey', 'shiftKey', 'ctrlKey', 'metaKey']) expect(pullGoesToCamera({ button: 0, [k]: true })).toBe(true)
        expect(pullGoesToCamera({ button: 1 })).toBe(true)
        expect(pullGoesToCamera({ button: 2 })).toBe(true)
    })
    it('never a locked, hidden or place thing, nor anything inside one; a light added from Create moves', () => {
        const hall = { id: 'place-hall', type: 'model', components: {} }
        const inHall = { id: 'chair', parentId: 'place-hall', components: {} }
        const lockedGroup = { id: 'g', components: { runtime: { locked: true } } }
        const inLocked = { id: 'c', parentId: 'g', components: {} }
        const byId = new Map([hall, inHall, lockedGroup, inLocked].map((e) => [e.id, e]))
        expect(movableForPull({ id: 'b', components: {} })).toBe(true)
        expect(movableForPull({ id: 'b', components: { runtime: { locked: true } } })).toBe(false)
        expect(movableForPull({ id: 'b', components: { runtime: { visible: false } } })).toBe(false)
        expect(movableForPull(hall, byId)).toBe(false)
        expect(movableForPull(inHall, byId)).toBe(false)
        expect(movableForPull(inLocked, byId)).toBe(false)
        expect(isPlaceGeometry({ id: 'w', components: { viewRole: 'architecture' } })).toBe(true)
        expect(isPlaceGeometry({ id: 'f', components: { fixture: { kind: 'wash' } } })).toBe(true)
        expect(isPlaceGeometry({ id: 'p', type: 'pointLight', components: { light: { type: 'point' } } })).toBe(false)
    })
    it('the picked thing must be the one selected thing', () => {
        const entities = [{ id: 'a', components: {} }, { id: 'b', components: {} }]
        expect(pullTargetId({ pickedId: 'a', selectedIds: ['a'], entities })).toBe('a')
        expect(pullTargetId({ pickedId: 'a', selectedIds: ['b'], entities })).toBe(null)
        expect(pullTargetId({ pickedId: 'a', selectedIds: ['a', 'b'], entities })).toBe(null)
        expect(pullTargetId({ pickedId: null, selectedIds: ['a'], entities })).toBe(null)
    })
    it('the floor plane at a height; a grazing ray uses the upright plane facing it', () => {
        const ray = new THREE.Ray(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -1, -1).normalize())
        near(planeHit(ray, 0.5).toArray(), [0, 0.5, -4.5])
        expect(planeHit(ray, 6)).toBe(null) // behind the eye
        expect(planeHit(ray, 0.5, new THREE.Vector3(), 3)).toBe(null) // past the reach
        const flat = new THREE.Ray(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.1, 0, -1).normalize())
        near(facingHit(flat, new THREE.Vector3(0, 1, -10)).toArray(), [100 / 101, 1, -1000 / 101], 6) // on the upright plane facing the ray
    })
})

describe('View | Edit with the real camera-controls', () => {
    it('View: a pull on the selected box turns the view exactly as Move 1, and the box never moves', () => {
        const a = setup({ mode: 'navigate', withPull: false }), b = setup({ mode: 'navigate' })
        const at = b.boxOnScreen()
        drag(a, { x: at.x, y: at.y, dx: 160, dy: 40 }); drag(b, { x: at.x, y: at.y, dx: 160, dy: 40 })
        near(camState(b.cc), camState(a.cc), 9)
        expect(camState(b.cc)).not.toEqual(camState(setup({ mode: 'navigate' }).cc)) // the view did turn
        expect(b.group.position.toArray()).toEqual([0, 0.5, -10])
        expect(b.onCommit).not.toHaveBeenCalled()
    })

    it('a pull that starts on the selected box moves it on the floor plane at its height; the camera stays; one edit', () => {
        const env = setup()
        const before = camState(env.cc)
        const at = env.boxOnScreen()
        drag(env, { x: at.x, y: at.y, dx: 160, dy: 40 })
        const p = env.group.position
        expect(p.y).toBeCloseTo(0.5, 9)
        expect(p.x).toBeGreaterThan(0.5)
        expect(p.z).toBeGreaterThan(-10) // down the screen = toward the camera
        near(camState(env.cc), before, 9)
        expect(env.onCommit).toHaveBeenCalledTimes(1)
        const [id, next] = env.onCommit.mock.calls[0]
        expect(id).toBe(BOX)
        near(next.position, [p.x, p.y, p.z], 9)
        expect(next.rotation).toEqual([0, 0, 0]); expect(next.scale).toEqual([1, 1, 1])
        expect(pullInProgress()).toBe(false)
        expect(env.cc.mouseButtons.left).toBe(controlBindingsFor('studio').mouseButtons.left) // the binding is given back
    })
    it('the grabbed point stays under the pointer (the floor-plane rule)', () => {
        const env = setup()
        const at = env.boxOnScreen()
        drag(env, { x: at.x, y: at.y, dx: 200, dy: 0 })
        const now = env.boxOnScreen()
        expect(Math.abs(now.x - (at.x + 200))).toBeLessThan(25) // the box centre follows; the grab point sits on its top face
    })
    it('a press with less than 3 px of motion is a click, not an edit', () => {
        const env = setup()
        const at = env.boxOnScreen()
        drag(env, { x: at.x, y: at.y, dx: PULL_START_PX - 1, steps: 1 })
        expect(env.group.position.toArray()).toEqual([0, 0.5, -10])
        expect(env.onCommit).not.toHaveBeenCalled()
    })
    it('a pull that starts anywhere else is Move 1, to the number', () => {
        const a = setup({ mode: 'navigate', withPull: false }), b = setup({ mode: 'edit' })
        drag(a, { x: 200, y: 120 }); drag(b, { x: 200, y: 120 })
        near(camState(b.cc), camState(a.cc), 9)
        expect(camState(b.cc)).not.toEqual(camState(setup({ mode: 'navigate', withPull: false }).cc)) // the view did turn
        expect(b.group.position.toArray()).toEqual([0, 0.5, -10])
        expect(b.onCommit).not.toHaveBeenCalled()
    })
    for (const [name, gesture] of [['Alt+drag', { altKey: true }], ['the middle button', { button: 1, buttons: 4 }], ['the right button', { button: 2, buttons: 2 }]]) {
        it(`${name} on the selected box is the camera's, exactly as Move 1`, () => {
            const a = setup({ mode: 'navigate', withPull: false }), b = setup({ mode: 'edit' })
            const at = b.boxOnScreen()
            drag(a, { x: at.x, y: at.y, ...gesture }); drag(b, { x: at.x, y: at.y, ...gesture })
            near(camState(b.cc), camState(a.cc), 9)
            expect(b.group.position.toArray()).toEqual([0, 0.5, -10])
            expect(b.onCommit).not.toHaveBeenCalled()
        })
    }
    for (const [name, opts] of [
        ['a locked box', { locked: true }],
        ['the place\'s own geometry', { components: { viewRole: 'architecture' } }],
        ['a box that is not selected', { selected: [] }],
        ['two selected things', { selected: [BOX, 'other'] }],
    ]) {
        it(`${name} never moves: the pull is Move 1's`, () => {
            const a = setup({ mode: 'navigate', withPull: false, ...opts }), b = setup({ mode: 'edit', ...opts })
            const at = b.boxOnScreen()
            drag(a, { x: at.x, y: at.y }); drag(b, { x: at.x, y: at.y })
            near(camState(b.cc), camState(a.cc), 9)
            expect(b.group.position.toArray()).toEqual([0, 0.5, -10])
            expect(b.onCommit).not.toHaveBeenCalled()
        })
    }
    it('one finger on the selected box pulls it and the camera stays', () => {
        const env = setup()
        const before = camState(env.cc)
        const at = env.boxOnScreen()
        drag(env, { x: at.x, y: at.y, dx: 150, pointerType: 'touch', isPrimary: true, buttons: 1 })
        expect(env.group.position.x).toBeGreaterThan(0.5)
        near(camState(env.cc), before, 9)
        expect(env.onCommit).toHaveBeenCalledTimes(1)
        expect(env.cc.touches.one).toBe(controlBindingsFor('studio').touches.one)
    })
    it('a cancelled pull (the window loses focus) puts the box back and writes nothing', () => {
        const env = setup()
        const at = env.boxOnScreen()
        act(() => { env.el.dispatchEvent(pe('pointerdown', { button: 0, buttons: 1, clientX: at.x, clientY: at.y })) })
        act(() => { document.dispatchEvent(pe('pointermove', { buttons: 1, clientX: at.x + 100, clientY: at.y })) })
        expect(env.group.position.x).toBeGreaterThan(0.1)
        act(() => { window.dispatchEvent(new Event('blur')) })
        near(env.group.position.toArray(), [0, 0.5, -10], 9)
        expect(env.onCommit).not.toHaveBeenCalled()
    })
})
