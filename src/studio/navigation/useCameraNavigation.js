// THE STANDARD MOVE for every camera that goes through StudioViewport: both Studio tools (Edit, Navigate) and the public
// viewer (owner, 2026-10-13: "one standard model where it will be easy to navigate, not connected to the objects around ...
// the same speed and motion to every side ... you can go everywhere ... settable"). The speed is a setting (freeMove.js),
// never read from what is under the pointer, near the camera or in view:
// - the wheel moves the camera and its turning point forward or back by the same metres every notch, through anything;
// - a slide drag moves both sideways or up and down by the same metres per pixel in every direction;
// - a zoom drag moves both forward or back, 100 px a step;
// - a turn drag turns around a point a fixed distance ahead (setting: where you stand); the buttons stay the tool's own
//   (mappings.js: Edit like Blender, Navigate like Sketchfab);
// - a double-click on a surface turns the view to it and makes it the turning point until the next move (an explicit choice);
// - Blender's Orbit Around Selection, when the viewer turns it on, turns around the selection (an explicit choice).
// camera-controls keeps its own turning and easing; this hook places the turning point at each drag's start (capture-phase
// pointerdown, before camera-controls' own) and does the wheel, the slide and the zoom drag itself.
import { useEffect, useRef } from 'react'
import { CC_ACTION, actionFor, getNavigationPreset } from './mappings.js'
import { Vector3 } from 'three'
import { clientToNdc, contentLargestSide, pickPivot, selectionCenter } from './autoDepth.js'
import { wheelNotches } from '../../project/viewport/navMath.js'
import { IN_PLACE_DISTANCE, autoSpeed, resolveSpeed, slideMetresPerPixel, speedModifier, turnDistance, wheelStep, zoomDragStep } from './freeMove.js'

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
    if (cc?.active) cc.stop()
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
}) {
    // Read at gesture time, so a new selection or setting does not re-register listeners.
    const selectionRef = useRef(selectedEntityIds)
    useEffect(() => { selectionRef.current = selectedEntityIds }, [selectedEntityIds])
    const settingsRef = useRef({ speed: speedSetting, turn: turnSetting })
    useEffect(() => { settingsRef.current = { speed: speedSetting, turn: turnSetting } }, [speedSetting, turnSetting])
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

        // The automatic speed is taken once, from the space's size, the first time it has a size; then it is kept, so every
        // move of this visit has the same speed.
        let auto = null
        const speed = () => {
            if (auto == null && settingsRef.current.speed === 'auto') {
                const scene = getScene?.()
                if (import.meta.env?.DEV) window.__diNavScene = scene
                auto = autoSpeed(scene ? contentLargestSide(entityRoots(scene)) : 0)
                if (auto != null) trace({ why: 'auto speed taken', auto: +auto.toFixed(3) })
            }
            const s = resolveSpeed(settingsRef.current.speed, auto)
            if (lastReading.auto !== auto || lastReading.speed !== s) announceReading({ auto, speed: s })
            return s
        }
        // A double-click made a surface the turning point; it stays so until another move (wheel, slide, zoom drag).
        let focused = false

        const camPos = new Vector3(), viewDir = new Vector3(), point = new Vector3(), goalPos = new Vector3(), goalTarget = new Vector3()
        // The turning point onto the view axis, `distance` ahead; the camera does not move.
        const placeTurnPoint = (distance) => {
            const cam = cc.camera
            cam.updateMatrixWorld()
            cam.getWorldPosition(camPos); cam.getWorldDirection(viewDir)
            point.copy(camPos).addScaledVector(viewDir, distance)
            cc.setLookAt(camPos.x, camPos.y, camPos.z, point.x, point.y, point.z, false)
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
            goalPos.addScaledVector(viewDir, metres); goalTarget.addScaledVector(viewDir, metres)
            cc.setLookAt(goalPos.x, goalPos.y, goalPos.z, goalTarget.x, goalTarget.y, goalTarget.z, ease)
        }
        // drei redraws the on-demand loop on 'update'; the Studio keeps the view on 'controlend'.
        const announceMove = (event) => {
            cc.dispatchEvent({ type: 'update' })
            return event
        }

        // The slide and the zoom drag are this hook's own, at the standard speed; camera-controls sees no button for them.
        const startDrag = (event, kind) => {
            const pointerId = event.pointerId
            let lastX = event.clientX, lastY = event.clientY
            if (kind === 'zoom') focused = false
            cc.dispatchEvent({ type: 'controlstart', originalEvent: event })
            const onMove = (e) => {
                if (e.pointerId !== pointerId) return
                const dx = e.clientX - lastX, dy = e.clientY - lastY
                lastX = e.clientX; lastY = e.clientY
                if (!dx && !dy) return
                const s = speed()
                if (kind === 'slide') {
                    const fov = typeof cc.camera.getEffectiveFOV === 'function' ? cc.camera.getEffectiveFOV() : cc.camera.fov
                    const mpp = slideMetresPerPixel(turnDistance(s, 'point'), fov, element.getBoundingClientRect().height)
                    // camera-controls' own drag passes (last - current) to truck(): the same sign here, so it feels the same
                    cc.truck(-dx * mpp, -dy * mpp, ease)
                } else {
                    moveForward(zoomDragStep(dy, s))
                }
                announceMove(e)
            }
            const onUp = (e) => {
                if (e.pointerId !== pointerId) return
                doc.removeEventListener('pointermove', onMove, true)
                doc.removeEventListener('pointerup', onUp, true)
                doc.removeEventListener('pointercancel', onUp, true)
                cc.dispatchEvent({ type: 'controlend', originalEvent: e })
                trace({ action: kind, end: true, distance: +cc.distance.toFixed(3) })
            }
            doc.addEventListener('pointermove', onMove, true)
            doc.addEventListener('pointerup', onUp, true)
            doc.addEventListener('pointercancel', onUp, true)
            trace({ action: kind, gestureStart: true, speed: +speed().toFixed(3) })
        }

        const onPointerDown = (event) => {
            if (!element.contains(event.target)) { trace({ why: 'pointer outside controls element', target: event.target?.tagName, cls: String(event.target?.className || '').slice(0, 60) }); return }
            // pointerType is what the browser reports, not a guess: touch keeps camera-controls' touch gestures.
            if (event.pointerType === 'touch') return
            const name = BUTTON_NAME[event.button]
            if (!name) return
            const action = actionFor(preset.id, event.button, { shift: event.shiftKey, ctrl: event.ctrlKey, alt: event.altKey }, { ortho })
            if (action === CC_ACTION.NONE) { cc.mouseButtons[name] = action; return }
            settleForGesture(cc)
            if (action === CC_ACTION.TRUCK || action === CC_ACTION.SCREEN_PAN || action === CC_ACTION.DOLLY || action === CC_ACTION.ZOOM) {
                cc.mouseButtons[name] = CC_ACTION.NONE
                startDrag(event, action === CC_ACTION.DOLLY || action === CC_ACTION.ZOOM ? 'zoom' : 'slide')
                return
            }
            cc.mouseButtons[name] = action
            if (action !== CC_ACTION.ROTATE) return
            const selected = selectionRef.current
            const scene = getScene?.()
            if (orbitSelection && selected?.length && scene) {
                const center = selectionCenter(entityRoots(scene, new Set(selected)))
                if (center) { applyPivot(cc, center, { force: true, onAxis: false }); trace({ action: 'turn', source: 'selection' }); return }
            }
            if (focused) { trace({ action: 'turn', source: 'double-clicked point' }); return }
            const d = turnDistance(speed(), settingsRef.current.turn)
            placeTurnPoint(d)
            trace({ action: 'turn', gestureStart: true, distance: +d.toFixed(3), turn: settingsRef.current.turn })
        }

        const onWheel = (event) => {
            if (!element.contains(event.target)) return
            event.preventDefault()
            const notches = standardWheelNotches(event)
            if (!notches) return
            focused = false
            const s = speed()
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
            if (hit) { const c = cc.camera.position; cc.setLookAt(c.x, c.y, c.z, hit.x, hit.y, hit.z, true); focused = true }
            trace({ action: 'focus', hit: hit ? [hit.x, hit.y, hit.z].map((v) => +v.toFixed(2)) : null })
        }

        // The controls never bend a move for distance: their clamps would pull the camera back toward a range.
        const limits = { min: cc.minDistance, max: cc.maxDistance }
        cc.minDistance = IN_PLACE_DISTANCE / 2
        cc.maxDistance = Infinity
        doc.addEventListener('pointerdown', onPointerDown, { capture: true })
        element.addEventListener('wheel', onWheel, { passive: false })
        doc.addEventListener('contextmenu', onContextMenu, { capture: true })
        doc.addEventListener('dblclick', onDoubleClick, { capture: true })
        return () => {
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
