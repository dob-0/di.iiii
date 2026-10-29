// THE STANDARD MOVE for every camera that goes through StudioViewport: both Studio tools (Edit, Navigate) and the public
// viewer (owner, 2026-10-13: "one standard model where it will be easy to navigate, not connected to the objects around ...
// the same speed and motion to every side ... you can go everywhere ... settable"). The speed is a setting (freeMove.js),
// never read from what is under the pointer, near the camera or in view:
// - the wheel moves the camera and its turning point forward or back by the same metres every notch, through anything;
// - a slide drag moves both sideways or up and down by the same metres per pixel in every direction;
// - a zoom drag moves both forward or back, 100 px a step;
// - a turn drag turns around a point a fixed distance ahead (setting: where you stand); the buttons stay the tool's own
//   (mappings.js: the Studio uses 'studio', like Sketchfab, in View and Edit since 2026-10-28; 'blender' stays as a preset);
// - a double-click on a surface turns the view to it and makes it the turning point until the next move (an explicit choice);
// - Blender's Orbit Around Selection, when the viewer turns it on, turns around the selection (an explicit choice).
// camera-controls keeps its own turning and easing; this hook places the turning point at each drag's start (capture-phase
// pointerdown, before camera-controls' own) and does the wheel, the slide and the zoom drag itself.
import { useEffect, useRef } from 'react'
import { CC_ACTION, actionFor, getNavigationPreset } from './mappings.js'
import { Vector3 } from 'three'
import { useProgress } from '@react-three/drei'
import { modelsLoading } from '../../objectComponents/modelLoads.js'
import { clientToNdc, contentLargestSide, pickPivot, selectionCenter } from './autoDepth.js'
import { pullPressAllowed } from './pullToMove.js'
import { wheelNotches } from '../../project/viewport/navMath.js'
import { IN_PLACE_DISTANCE, autoSpeed, flyVelocity, resolveSpeed, slideMetresPerPixel, speedModifier, turnDistance, wheelStep, zoomDragStep } from './freeMove.js'

const BUTTON_NAME = { 0: 'left', 1: 'middle', 2: 'right' }

// Content objects only: Studio tags every entity group with userData.svEntityId
// (StudioViewport.jsx); grid, gizmo and rig markers carry no such tag.
export function entityRoots(scene, ids = null) {
    const out = []
    scene?.traverse?.((object) => {
        const id = object.userData?.svEntityId
        if (id != null && (!ids || ids.has(id))) out.push(object)
    })
    return out
}

// camera-controls: setOrbitPoint "SHOULD NOT RUN DURING ANIMATIONS".
// `active` is true while it is still easing toward a goal.
export function applyPivot(cc, point, { force = false, onAxis = true } = {}) {
    if (!cc || !point || (cc.active && !force)) return false
    if (onAxis) {
        // Blender's Auto Depth sets the view DEPTH under the mouse, never a sideways pivot. camera-controls' setOrbitPoint does
        // the sideways version through a focal offset, and for a hit far off the view axis its next update() moved the camera
        // 6.94 m in one frame (walked through 2026-10-12; the maintainer calls the focal offset problematic, issue #424). So the
        // orbit point goes onto the view axis at the hit's depth: camera and aim stay exactly where they are.
        const cam = cc.camera
        const target = axisPointAtDepth(cam, point)
        cc.setLookAt(cam.position.x, cam.position.y, cam.position.z, target.x, target.y, target.z, false)
        return true
    }
    cc.setOrbitPoint(point.x, point.y, point.z)
    return true
}

// The point on the camera's view axis at the same depth as `point`. Pure.
export function axisPointAtDepth(camera, point) {
    const depth = camera.position.distanceTo(point)
    return camera.getWorldDirection(new Vector3()).multiplyScalar(depth).add(camera.position)
}

// A gesture is starting, so whatever the camera was easing toward (the slow turn a visitor who touches nothing is shown,
// a fly-to) is over: stop it, so the pivot below can be set. Measured 2026-10-08 on the public viewer (Inside and Free):
// camera-controls reported `active` at the start of EVERY gesture, applyPivot refused, Auto Depth never ran and a 240 px
// right-drag still moved the camera 0.11-0.64 m. applyPivot keeps its own refusal (setOrbitPoint must not run mid-ease).
export function settleForGesture(cc) {
    if (!cc?.active) return
    const p = cc.getPosition(new Vector3(), false), t = cc.getTarget(new Vector3(), false)
    cc.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, false)
}

// settleForGesture for a gesture that must place its pivot on a camera at rest (setOrbitPoint, the focal offset's clearing),
// keeping what is left of a glide that only carries the camera (a wheel notch, a slide, a flight): `place` runs on the settled
// camera and the rest of the glide is added back, eased. Settling alone cut a notch to whatever it had covered so far (review 2:
// a Shift notch, then a turn with Orbit Around Selection on, moved 2.6 m instead of 13.6 m).
export function settleKeepingGlide(cc, place) {
    if (!cc?.active) { place(); return }
    const p = cc.getPosition(new Vector3(), false), t = cc.getTarget(new Vector3(), false)
    const rest = cc.getPosition(new Vector3(), true).sub(p), restT = cc.getTarget(new Vector3(), true).sub(t)
    const carried = rest.lengthSq() > 0 && rest.distanceTo(restT) <= 1e-6 * Math.max(1, rest.length())
    settleForGesture(cc); cc.update(0)
    place()
    if (!carried) return
    const gp = cc.getPosition(new Vector3(), true).add(rest), gt = cc.getTarget(new Vector3(), true).add(rest)
    cc.setLookAt(gp.x, gp.y, gp.z, gt.x, gt.y, gt.z, true)
}

// The frame delta camera-controls may ease over. With frameloop="demand" the first frame of a gesture after a pause carries the
// whole pause as its delta (walked through 2026-10-12: ~0.7 s), and SmoothDamp then finishes the ease in that one frame — a 6.9 m
// snap at the floor, a pop at the start of every gesture after a rest. Clamped to two frames at 30 Hz. Pure.
export const MAX_UPDATE_DT = 1 / 15
export const clampUpdateDt = (dt) => (Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_UPDATE_DT) : 0)

// Installs the clamp on a camera-controls instance once (drei calls cc.update(delta) with R3F's raw delta). Returns the undo.
export function clampUpdates(cc) {
    if (!cc || typeof cc.update !== 'function' || cc.__diClampedUpdate) return () => {}
    const original = cc.update
    cc.update = function (dt) { return original.call(this, clampUpdateDt(dt)) }
    cc.__diClampedUpdate = true
    return () => { cc.update = original; delete cc.__diClampedUpdate }
}

// Wheel notches for the standard move (+ = forward). Chrome on Linux sends Shift+wheel as a sideways scroll (deltaX, deltaY 0),
// and Shift is the "faster" key: that sideways scroll counts as the wheel. Pure.
export function standardWheelNotches(event) {
    const n = wheelNotches(event)
    if (n) return n
    if (!event?.shiftKey) return 0
    const dx = Number(event?.deltaX)
    if (!Number.isFinite(dx) || dx === 0) return 0
    const px = event.deltaMode === 1 ? dx * 16 : event.deltaMode === 2 ? dx * 100 : dx
    return -px / 100
}

// The page's last automatic speed reading, for the settings panel ("Auto (2.5 m)"). Announced as a window event.
export const STANDARD_MOVE_SPEED_EVENT = 'di:standard-move-speed'
let lastReading = { auto: null, speed: null }
export const getStandardMoveReading = () => lastReading
function announceReading(reading) {
    lastReading = reading
    try { window.dispatchEvent(new CustomEvent(STANDARD_MOVE_SPEED_EVENT, { detail: reading })) } catch { /* no window */ }
}

// The automatic speed per space (review-move F7): taken once and kept across tool switches. While three's loaders are still
// busy (drei's progress store, fed by THREE.DefaultLoadingManager) or a model is still in flight (modelLoads.js), the reading
// is provisional and is taken again at the next gesture; once loading is idle it is fixed for the visit, so a half-loaded
// first reading never sticks.
const autoSpeeds = new WeakMap()
const loadingNow = () => { if (modelsLoading()) return true; try { return Boolean(useProgress.getState?.().active) } catch { return false } }
export function autoSpeedFor(scene, { read = (sc) => autoSpeed(contentLargestSide(entityRoots(sc))), loading = loadingNow } = {}) {
    if (!scene) return null
    const held = autoSpeeds.get(scene)
    if (held?.fixed) return held.auto
    const auto = read(scene)
    if (auto == null) return held?.auto ?? null
    autoSpeeds.set(scene, { auto, fixed: !loading() })
    return auto
}

// Inside the public viewer's lock box (SmartView puts it on cc.userData.diLockBox: { min: [x, y, z], max: [x, y, z] }) a move
// goes only as far as the box lets the camera go, and the turning point goes the same way, so the turning distance stays.
// Returns the delta to apply (the same object, shortened). Pure.
export function clampMoveToBox(from, delta, box) {
    if (!box) return delta
    for (const [i, k] of [[0, 'x'], [1, 'y'], [2, 'z']]) {
        const to = Math.min(Math.max(from[k] + delta[k], box.min[i]), box.max[i])
        delta[k] = to - from[k]
    }
    return delta
}

export function useCameraNavigation({
    controlsRef,
    presetId,
    ortho = false,
    orbitSelection = false,
    selectedEntityIds = null,
    getScene,
    // The standard move's settings (preference.js): 'auto' or metres per notch, and 'point' or 'place'. Read at gesture time.
    speed: speedSetting = 'auto',
    turn: turnSetting = 'point',
    // Re-run when the controls mount/unmount (Studio hides them in XR / when disabled).
    active = true,
    // The Studio's View | Edit (StudioShell viewportEditMode: 'navigate' = View, 'edit' = Edit) and its pull (pullToMove.js
    // usePullToMove). Only in Edit is a press handed to the pull first. Read at gesture time.
    mode = 'navigate',
    pull = null,
}) {
    // Read at gesture time, so a new selection or setting does not re-register listeners.
    const selectionRef = useRef(selectedEntityIds)
    useEffect(() => { selectionRef.current = selectedEntityIds }, [selectedEntityIds])
    const settingsRef = useRef({ speed: speedSetting, turn: turnSetting })
    useEffect(() => { settingsRef.current = { speed: speedSetting, turn: turnSetting } }, [speedSetting, turnSetting])
    const moveRef = useRef({ mode, pull })
    useEffect(() => { moveRef.current = { mode, pull } }, [mode, pull])
    useEffect(() => {
        const preset = getNavigationPreset(presetId)
        const cc = controlsRef.current
        if (!active || !cc) return undefined
        const element = cc._domElement
        const doc = element?.ownerDocument
        if (!element || !doc) return undefined
        const unclamp = clampUpdates(cc)
        const ease = preset.draggingSmoothTime > 0
        // Dev-only trace of every decision (window.__diNavTrace), read by the probes in scripts/nav with NAV_TRACE=1.
        const trace = (entry) => { if (import.meta.env?.DEV) (window.__diNavTrace ||= []).push({ t: Math.round(performance.now()), ...entry }) }

        // The speed of this gesture: read afresh at each gesture's start (`fresh`), the same for every step of that gesture.
        // The automatic speed comes from autoSpeedFor: once per space, fixed once loading is idle.
        let auto = null, current = null
        const speed = (fresh = false) => {
            if (!fresh && current != null) return current
            if (settingsRef.current.speed === 'auto') {
                const scene = getScene?.()
                if (import.meta.env?.DEV) window.__diNavScene = scene
                const before = auto
                auto = autoSpeedFor(scene)
                if (auto != null && auto !== before) trace({ why: 'auto speed taken', auto: +auto.toFixed(3), fixed: Boolean(scene && autoSpeeds.get(scene)?.fixed) })
            }
            current = resolveSpeed(settingsRef.current.speed, auto)
            if (lastReading.auto !== auto || lastReading.speed !== current) announceReading({ auto, speed: current })
            return current
        }
        // A double-click made a surface the turning point; it stays so until another move (wheel, slide, zoom drag).
        let focused = false
        const focusPoint = new Vector3()

        const camPos = new Vector3(), viewDir = new Vector3(), point = new Vector3(), goalPos = new Vector3(), goalTarget = new Vector3(), moveDelta = new Vector3()
        const curPos = new Vector3(), curTarget = new Vector3(), endPos = new Vector3(), endTarget = new Vector3()
        // The turning point onto the view axis, `distance` ahead; the camera does not move.
        const offset = new Vector3()
        const placeTurnPoint = (distance) => {
            if (cc.getFocalOffset(offset, true).lengthSq() > 0) {
                settleKeepingGlide(cc, () => {
                    const cam = cc.camera
                    cam.updateMatrixWorld(); cam.getWorldPosition(camPos); cam.getWorldDirection(viewDir)
                    cc.setFocalOffset(0, 0, 0, false)
                    point.copy(camPos).addScaledVector(viewDir, distance)
                    cc.setLookAt(camPos.x, camPos.y, camPos.z, point.x, point.y, point.z, false)
                })
                return
            }
            // The point goes `distance` ahead of the camera where it is AND where a running glide is heading, so the glide goes on
            // and the turning distance is right from the first frame (easing it whenever camera-controls had not yet rested swung a
            // turn in place 4 cm: measured on the 3080, 2026-10-13).
            cc.getPosition(curPos, false); cc.getTarget(curTarget, false)
            cc.getPosition(endPos, true); cc.getTarget(endTarget, true)
            const gliding = curPos.distanceToSquared(endPos) > 1e-12 || curTarget.distanceToSquared(endTarget) > 1e-12
            viewDir.subVectors(endTarget, endPos).normalize()
            point.copy(curPos).addScaledVector(viewDir, distance)
            cc.setLookAt(curPos.x, curPos.y, curPos.z, point.x, point.y, point.z, false)
            if (gliding) { point.copy(endPos).addScaledVector(viewDir, distance); cc.setLookAt(endPos.x, endPos.y, endPos.z, point.x, point.y, point.z, true) }
        }
        // Camera and turning point forward (+) or back along the view, from where the controls are heading (their goal), so
        // notches that arrive while a glide is still running add up exactly.
        const moveForward = (metres) => {
            if (!metres) return
            cc.getPosition(goalPos, true); cc.getTarget(goalTarget, true)
            viewDir.subVectors(goalTarget, goalPos)
            const keep = viewDir.length()
            if (!(keep > 0)) return
            viewDir.divideScalar(keep)
            moveDelta.copy(viewDir).multiplyScalar(metres)
            clampMoveToBox(goalPos, moveDelta, cc.userData?.diLockBox)
            goalPos.add(moveDelta); goalTarget.add(moveDelta)
            cc.setLookAt(goalPos.x, goalPos.y, goalPos.z, goalTarget.x, goalTarget.y, goalTarget.z, ease)
        }
        // Flight moves the camera at once (a glide behind the keys lagged 0.6 m in a second and drifted on after the keys were
        // up: measured on the 3080, 2026-10-13). If a wheel glide is running, where it is heading moves by the same delta and it
        // goes on: nothing jumps and no notch is cut.
        const translateAll = (delta) => {
            cc.getPosition(curPos, false); cc.getTarget(curTarget, false)
            cc.getPosition(endPos, true); cc.getTarget(endTarget, true)
            const gliding = curPos.distanceToSquared(endPos) > 1e-12 || curTarget.distanceToSquared(endTarget) > 1e-12
            curPos.add(delta); curTarget.add(delta)
            cc.setLookAt(curPos.x, curPos.y, curPos.z, curTarget.x, curTarget.y, curTarget.z, false)
            if (gliding) { endPos.add(delta); endTarget.add(delta); cc.setLookAt(endPos.x, endPos.y, endPos.z, endTarget.x, endTarget.y, endTarget.z, true) }
        }
        // drei redraws the on-demand loop on 'update'; the Studio keeps the view on 'controlend'.
        const announceMove = (event) => {
            cc.dispatchEvent({ type: 'update' })
            return event
        }

        // A slide of dx, dy pixels: camera and turning point move together by the same metres per pixel in every direction, a
        // plain translation like every other move (camera-controls' truck() goes through its boundary and snapped a turning point
        // the other moves had carried past it: review-move F8).
        const slideX = new Vector3(), slideY = new Vector3(), slideD = new Vector3()
        const slideBy = (dx, dy, s) => {
            const fov = typeof cc.camera.getEffectiveFOV === 'function' ? cc.camera.getEffectiveFOV() : cc.camera.fov
            const mpp = slideMetresPerPixel(turnDistance(s, 'point'), fov, element.getBoundingClientRect().height)
            cc.camera.updateMatrix()
            slideX.setFromMatrixColumn(cc.camera.matrix, 0); slideY.setFromMatrixColumn(cc.camera.matrix, 1)
            cc.getPosition(goalPos, true); cc.getTarget(goalTarget, true)
            slideD.set(0, 0, 0).addScaledVector(slideX, -dx * mpp).addScaledVector(slideY, dy * mpp)
            clampMoveToBox(goalPos, slideD, cc.userData?.diLockBox)
            goalPos.add(slideD); goalTarget.add(slideD)
            cc.setLookAt(goalPos.x, goalPos.y, goalPos.z, goalTarget.x, goalTarget.y, goalTarget.z, ease)
        }
        // The slide and the zoom drag are this hook's own, at the standard speed; camera-controls sees no button for them.
        const BUTTON_BIT = { 0: 1, 1: 4, 2: 2 }
        const OWN = [CC_ACTION.TRUCK, CC_ACTION.SCREEN_PAN, CC_ACTION.DOLLY, CC_ACTION.ZOOM]
        let endDrag = null
        const startDrag = (event, kind) => {
            const pointerId = event.pointerId
            const bit = BUTTON_BIT[event.button] ?? 0
            let lastX = event.clientX, lastY = event.clientY
            focused = false
            cc.dispatchEvent({ type: 'controlstart', originalEvent: event })
            speed(true)
            const onMove = (e) => {
                if (e.pointerId !== pointerId) return
                if (bit && (e.buttons & bit) === 0) { onUp(e); return }
                const dx = e.clientX - lastX, dy = e.clientY - lastY
                lastX = e.clientX; lastY = e.clientY
                if (!dx && !dy) return
                const s = speed()
                if (kind === 'slide') {
                    slideBy(dx, dy, s)
                } else {
                    moveForward(zoomDragStep(dy, s))
                }
                announceMove(e)
            }
            const onUp = (e) => {
                if (e && e.pointerId !== pointerId) return
                endDrag = null
                window.removeEventListener('blur', onUp)
                doc.removeEventListener('pointermove', onMove, true)
                doc.removeEventListener('pointerup', onUp, true)
                doc.removeEventListener('pointercancel', onUp, true)
                cc.dispatchEvent({ type: 'controlend', originalEvent: e || undefined })
                trace({ action: kind, end: true, distance: +cc.distance.toFixed(3) })
            }
            doc.addEventListener('pointermove', onMove, true)
            doc.addEventListener('pointerup', onUp, true)
            doc.addEventListener('pointercancel', onUp, true)
            window.addEventListener('blur', onUp)
            endDrag = () => onUp(null)
            trace({ action: kind, gestureStart: true, speed: +speed().toFixed(3) })
        }

        // Flying: hold the right button over the view and W A S D Q E move at the standard speed, one step a second (Unity's
        // and Unreal's convention: the keys fly only while the button is held, so the Studio's single-key shortcuts stay theirs).
        let rightHeld = false
        const held = new Set()
        let flyFrame = 0, flyLast = 0
        const FLY_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'])
        const right = new Vector3(), worldUp = new Vector3(0, 1, 0), delta = new Vector3()
        const mods = { shift: false, alt: false }
        const readMods = (event) => { mods.shift = Boolean(event.shiftKey); mods.alt = Boolean(event.altKey) }
        const flyTick = (now) => {
            flyFrame = 0
            if (!held.size || !rightHeld) return
            const dt = flyLast ? Math.min(Math.max((now - flyLast) / 1000, 0), 0.25) : 0
            flyLast = now
            const v = flyVelocity(held, speed(), speedModifier(mods))
            cc.getPosition(goalPos, true); cc.getTarget(goalTarget, true)
            viewDir.subVectors(goalTarget, goalPos).normalize()
            right.crossVectors(viewDir, worldUp).normalize()
            delta.set(0, 0, 0).addScaledVector(viewDir, v.forward * dt).addScaledVector(right, v.right * dt).addScaledVector(worldUp, v.up * dt)
            clampMoveToBox(goalPos, delta, cc.userData?.diLockBox)
            if (delta.lengthSq() > 0) {
                focused = false
                translateAll(delta)
                cc.dispatchEvent({ type: 'update' })
            }
            flyFrame = requestAnimationFrame(flyTick)
        }
        let flying = false
        const endFlight = () => { if (flying) { flying = false; cc.dispatchEvent({ type: 'controlend' }) } }
        const stopFlying = () => {
            endFlight()
            held.clear(); rightHeld = false; flyLast = 0
            if (flyFrame) { cancelAnimationFrame(flyFrame); flyFrame = 0 }
        }
        const onFlyKey = (event) => {
            const down = event.type === 'keydown'
            readMods(event)
            if (!rightHeld || !FLY_KEYS.has(event.code)) return
            event.preventDefault(); event.stopImmediatePropagation()
            if (!down) { held.delete(event.code); if (![...held].some((k) => FLY_KEYS.has(k))) endFlight(); return }
            if (!flying) { flying = true; speed(true); cc.dispatchEvent({ type: 'controlstart', originalEvent: event }) }
            held.add(event.code)
            if (!flyFrame) { flyLast = 0; flyFrame = requestAnimationFrame(flyTick) }
        }
        const onPointerUp = (event) => { if (event.button === 2) stopFlying() }
        // A release outside the window may never arrive as pointerup: the next move that shows no right button ends the flight.
        const onPointerMoveFly = (event) => { if (event.pointerType === 'touch') return; readMods(event); if (rightHeld && (event.buttons & 2) === 0) stopFlying() }

        // Touch (review-move F3): spreading two fingers 100 px goes one step forward (the zoom drag's rule) and moving them
        // together slides at the standard metres per pixel; one finger turns (camera-controls), around the point placed here.
        const touchPts = new Map()
        let pinch = null
        const touchMeasure = () => { const [a, b] = [...touchPts.values()]; return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 } }
        const onTouchDown = (event) => {
            touchPts.set(event.pointerId, { x: event.clientX, y: event.clientY })
            if (touchPts.size === 1) {
                // no settle: a glide still running (a pinch's) finishes, as for the mouse turn (review 2: it was cut to 0.67 of 10.9 m)
                if (!focused) placeTurnPoint(Math.min(Math.max(turnDistance(speed(true), settingsRef.current.turn), cc.minDistance), cc.maxDistance))
                return
            }
            if (touchPts.size === 2 && !pinch) { focused = false; speed(true); cc.dispatchEvent({ type: 'controlstart', originalEvent: event }) }
            // A pair is measured from the moment it is a pair: a third finger landing makes it three (no move), and the pair
            // that remains after any lift is a new pair, so its first move is measured against itself, not the old pair.
            if (touchPts.size === 2) pinch = touchMeasure()
        }
        const onTouchMove = (event) => {
            if (event.pointerType !== 'touch' || !touchPts.has(event.pointerId)) return
            touchPts.set(event.pointerId, { x: event.clientX, y: event.clientY })
            if (touchPts.size !== 2 || !pinch) return
            const m = touchMeasure(), s = speed()
            moveForward(zoomDragStep(pinch.dist - m.dist, s)) // fingers apart = forward
            slideBy(m.cx - pinch.cx, m.cy - pinch.cy, s)
            pinch = m
            announceMove(event)
        }
        const onTouchUp = (event) => {
            if (event.pointerType !== 'touch' || !touchPts.delete(event.pointerId)) return
            if (!pinch) return
            if (touchPts.size < 2) { pinch = null; cc.dispatchEvent({ type: 'controlend', originalEvent: event }) }
            // a third finger lifted: a new pair, measured afresh (review 2: the old pair's spread and centre made 1 px jump 10.8 m)
            else if (touchPts.size === 2) pinch = touchMeasure()
        }

        const onPointerDown = (event) => {
            if (!element.contains(event.target)) { trace({ why: 'pointer outside controls element', target: event.target?.tagName, cls: String(event.target?.className || '').slice(0, 60) }); return }
            // EDIT MODE (View | Edit, owner 2026-10-28): a pull that starts on the selected thing moves it (pullToMove.js), and the
            // camera holds still until it ends; every other press goes on to Move 1's path below, which this branch never changes.
            // In View this branch is never taken: every pull is Move 1's.
            if (pullPressAllowed(moveRef.current.mode) && moveRef.current.pull) {
                const touch = event.pointerType === 'touch'
                const held = touch ? cc.touches.one : cc.mouseButtons.left
                const release = () => { if (touch) cc.touches.one = held; else if (cc.mouseButtons.left === CC_ACTION.NONE) cc.mouseButtons.left = held }
                if (moveRef.current.pull.begin(event, { onEnd: release })) {
                    if (touch) cc.touches.one = CC_ACTION.NONE; else cc.mouseButtons.left = CC_ACTION.NONE
                    trace({ action: 'pull', mode: 'edit' })
                    return
                }
            }
            // pointerType is what the browser reports, not a guess: touch keeps camera-controls' touch gestures.
            if (event.pointerType === 'touch') { onTouchDown(event); return }
            const name = BUTTON_NAME[event.button]
            if (!name) return
            // A second button pressed mid-drag arrives as a pointermove, never a pointerdown, and camera-controls then reads its
            // binding: every slide or zoom binding is set aside at each press, whoever put it back (StudioViewport's own effect
            // restores the resting bindings after this hook's, and on every tool switch: review 2, a middle-button chord zoomed
            // with camera-controls' own dolly, 27.2 m to 7.6 m for 200 px).
            for (const n of ['left', 'middle', 'right']) if (OWN.includes(cc.mouseButtons[n])) cc.mouseButtons[n] = CC_ACTION.NONE
            if (event.button === 2) { rightHeld = true; readMods(event) }
            const action = actionFor(preset.id, event.button, { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey }, { ortho })
            if (action === CC_ACTION.NONE) { cc.mouseButtons[name] = action; return }
            if (action === CC_ACTION.TRUCK || action === CC_ACTION.SCREEN_PAN || action === CC_ACTION.DOLLY || action === CC_ACTION.ZOOM) {
                cc.mouseButtons[name] = CC_ACTION.NONE
                startDrag(event, action === CC_ACTION.DOLLY || action === CC_ACTION.ZOOM ? 'zoom' : 'slide')
                return
            }
            cc.mouseButtons[name] = action
            if (action !== CC_ACTION.ROTATE) { settleForGesture(cc); return }
            const selected = selectionRef.current
            const scene = getScene?.()
            if (orbitSelection && selected?.length && scene) {
                const center = selectionCenter(entityRoots(scene, new Set(selected)))
                if (center) { settleKeepingGlide(cc, () => applyPivot(cc, center, { force: true, onAxis: false })); trace({ action: 'turn', source: 'selection' }); return }
            }
            // the focus holds only while its point is still the turning point: the view bar, Frame or a preset moving it ends it
            if (focused && cc.getTarget(goalTarget, true).distanceTo(focusPoint) > 1e-3) focused = false
            if (focused) { trace({ action: 'turn', source: 'double-clicked point' }); return }
            // inside the range a viewer's own lock sets (the public viewer's Inside: 2-25 m); the Studio's range is open
            const d = Math.min(Math.max(turnDistance(speed(true), settingsRef.current.turn), cc.minDistance), cc.maxDistance)
            placeTurnPoint(d)
            trace({ action: 'turn', gestureStart: true, distance: +d.toFixed(3), turn: settingsRef.current.turn })
        }

        const onWheel = (event) => {
            if (!element.contains(event.target)) return
            event.preventDefault()
            const notches = standardWheelNotches(event)
            if (!notches) return
            focused = false
            const s = speed(true)
            const metres = wheelStep(notches, s, speedModifier({ shift: event.shiftKey, alt: event.altKey }))
            cc.dispatchEvent({ type: 'controlstart', originalEvent: event })
            moveForward(metres)
            announceMove(event)
            cc.dispatchEvent({ type: 'controlend', originalEvent: event })
            trace({ action: 'wheel', notches: +notches.toFixed(3), metres: +metres.toFixed(3), speed: +s.toFixed(3) })
        }

        // Neither Blender nor Sketchfab ever shows the browser's menu over the view (owner, 2026-10-12): a right-click on the
        // viewport is the app's.
        const onContextMenu = (event) => { if (element.contains(event.target)) event.preventDefault() }

        // Sketchfab: double-click a surface and the view turns to it; it is the turning point until the next move.
        const onDoubleClick = (event) => {
            if (!preset.focusOnDoubleClick || !element.contains(event.target)) return
            const scene = getScene?.()
            if (!scene) return
            const ndc = clientToNdc(event.clientX, event.clientY, element.getBoundingClientRect())
            if (!ndc) return
            settleForGesture(cc)
            const hit = pickPivot({ camera: cc.camera, ndc, objects: entityRoots(scene) })
            if (hit) { const c = cc.camera.position; cc.setLookAt(c.x, c.y, c.z, hit.x, hit.y, hit.z, true); focused = true; focusPoint.copy(hit) }
            trace({ action: 'focus', hit: hit ? [hit.x, hit.y, hit.z].map((v) => +v.toFixed(2)) : null })
        }

        // The controls never bend a move for distance: their clamps would pull the camera back toward a range.
        const limits = { min: cc.minDistance, max: cc.maxDistance }
        cc.minDistance = IN_PLACE_DISTANCE / 2
        cc.maxDistance = Infinity
        // A button pressed in the middle of another drag (a chord) never runs camera-controls' own slide or zoom: those resting
        // bindings are NONE, and this hook gives each gesture its action at its own pointerdown (review-move F11). Two fingers too.
        const restingButtons = { left: cc.mouseButtons.left, middle: cc.mouseButtons.middle, right: cc.mouseButtons.right }
        for (const name of ['left', 'middle', 'right']) if (OWN.includes(cc.mouseButtons[name])) cc.mouseButtons[name] = CC_ACTION.NONE
        const restingTwo = cc.touches.two
        cc.touches.two = CC_ACTION.NONE
        const onTouchEnd = (event) => onTouchUp(event)
        doc.addEventListener('pointerdown', onPointerDown, { capture: true })
        element.addEventListener('wheel', onWheel, { passive: false })
        doc.addEventListener('contextmenu', onContextMenu, { capture: true })
        doc.addEventListener('dblclick', onDoubleClick, { capture: true })
        doc.addEventListener('keydown', onFlyKey, { capture: true })
        doc.addEventListener('keyup', onFlyKey, { capture: true })
        doc.addEventListener('pointerup', onPointerUp, { capture: true })
        doc.addEventListener('pointermove', onPointerMoveFly, { capture: true })
        doc.addEventListener('pointermove', onTouchMove, { capture: true })
        doc.addEventListener('pointerup', onTouchEnd, { capture: true })
        doc.addEventListener('pointercancel', onTouchEnd, { capture: true })
        window.addEventListener('blur', stopFlying)
        return () => {
            doc.removeEventListener('pointermove', onTouchMove, { capture: true })
            doc.removeEventListener('pointerup', onTouchEnd, { capture: true })
            doc.removeEventListener('pointercancel', onTouchEnd, { capture: true })
            cc.touches.two = restingTwo
            for (const name of ['left', 'middle', 'right']) if (cc.mouseButtons[name] === CC_ACTION.NONE && OWN.includes(restingButtons[name])) cc.mouseButtons[name] = restingButtons[name]
            endDrag?.()
            stopFlying()
            doc.removeEventListener('keydown', onFlyKey, { capture: true })
            doc.removeEventListener('keyup', onFlyKey, { capture: true })
            doc.removeEventListener('pointerup', onPointerUp, { capture: true })
            doc.removeEventListener('pointermove', onPointerMoveFly, { capture: true })
            window.removeEventListener('blur', stopFlying)
            unclamp()
            cc.minDistance = limits.min
            cc.maxDistance = limits.max
            doc.removeEventListener('pointerdown', onPointerDown, { capture: true })
            element.removeEventListener('wheel', onWheel)
            doc.removeEventListener('contextmenu', onContextMenu, { capture: true })
            doc.removeEventListener('dblclick', onDoubleClick, { capture: true })
        }
    }, [active, controlsRef, presetId, ortho, orbitSelection, getScene])
}
