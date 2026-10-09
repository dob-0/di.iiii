import { useEffect, useRef } from 'react'
import { Box3, Sphere } from 'three'
import { wheelNotches } from '../../project/viewport/navMath.js'
import { FLY_DEFAULTS, flyStart, flyStep, speedForScene } from '../../project/viewport/flyMotion.js'

// FLY — hold the right button and press W A S D to move through the scene the way Blender's Fly/Walk, Unreal's viewport and Unity's
// flythrough do (sources and numbers: flyMotion.js, docs/ai/navigation-spec.md). The motion is the pure flyStep; this hook is the input
// and the camera. Keys count ONLY while the right button is held, so Studio's own letter shortcuts are untouched the rest of the time.
//   W/S forward/back along the look direction, A/D strafe, E/Q up/down (world), Shift faster, Alt slower, wheel = speed (x1.25 a notch).
// camera-controls moves camera and target together via setLookAt, so orbit still works around the new place afterwards.
// Limit: the right button still pans in the Studio mapping, so a mouse move while flying slides the view; Unreal's right-button
// look-around is not replicated (owed; in the Blender preset the right button is free for it).
export const FLY_CODES = Object.freeze({ KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right', KeyE: 'up', KeyQ: 'down' })
export const SLOW_FACTOR = 0.25

/** The flyStep input for the keys held. Pure. */
export const flyInputFor = (held, look, wheel = 0) => ({
    forward: held.has('forward'), back: held.has('back'), left: held.has('left'), right: held.has('right'), up: held.has('up'), down: held.has('down'),
    sprint: held.has('shift') || held.has('alt'), wheel, look
})
/** Shift beats Alt; Alt is the slow factor. */
export const flyParamsFor = (held, { baseSpeed, factor }) => ({ baseSpeed, sprintFactor: held.has('shift') ? factor : held.has('alt') ? SLOW_FACTOR : 1 })

/** Shift / Alt state read from the event itself, so a modifier held BEFORE the right button still counts. Pure. */
export const modifiersFrom = (e) => ({ shift: Boolean(e?.shiftKey), alt: Boolean(e?.altKey) })
/** The keys held plus the modifiers as last seen on an event. Pure; returns a new Set. */
export const heldWithModifiers = (held, mods) => {
    const out = new Set(held)
    out.delete('shift'); out.delete('alt')
    if (mods?.shift) out.add('shift')
    if (mods?.alt) out.add('alt')
    return out
}
/** True when a pointer event proves the right button is NOT down (buttons is a bitmask, 2 = right). Unknown buttons proves nothing. */
export const rightButtonUp = (e) => typeof e?.buttons === 'number' && (e.buttons & 2) === 0
/** A key combined with Ctrl or Cmd is the browser's or the app's shortcut, never a fly key. */
export const isChord = (e) => Boolean(e?.ctrlKey || e?.metaKey)

export function useFlyNavigation({ controlsRef, active = true, enabled = true, getScene, speedScale = 1, factor = FLY_DEFAULTS.sprintFactor }) {
    const live = useRef({ speedScale, factor })
    live.current = { speedScale, factor }
    useEffect(() => {
        // The controls mount AFTER the first render, so nothing here may depend on controlsRef.current being set when the effect runs
        // (measured 2026-10-08: the first version read it once, found null, attached nothing, and the first flight did not move).
        // Listeners go on the document; the controls and their element are looked up when an event or a frame needs them.
        if (!active || !enabled || typeof document === 'undefined') return undefined
        const doc = document
        const win = doc.defaultView
        const ccNow = () => controlsRef.current
        const elementNow = () => ccNow()?._domElement
        const held = new Set()
        let rmb = false
        let wheel = 0
        let state = null
        // the cruise speed outlives a flight (Blender, Unreal and Unity keep the wheel-set speed): measured 2026-10-08, the wheel notches
        // given before the first key were lost because the flight state is dropped when the camera is at rest
        let speedKept = null
        let seenScale = live.current.speedScale // the Fly Speed slider: a change must rescale the kept speed too
        let mods = { shift: false, alt: false }
        let flew = false
        let raf = 0
        let last = 0
        const typing = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
        // the scene's own size sets the pace (flyMotion.js speedForScene): a 100 m hall is not a 5 m room
        const sceneRadius = () => {
            try {
                const box = new Box3().setFromObject(getScene?.())
                if (box.isEmpty()) return 50
                return Math.min(500, Math.max(5, box.getBoundingSphere(new Sphere()).radius))
            } catch { return 50 }
        }
        const frame = (now) => {
            raf = 0
            const cc = ccNow()
            const cam = cc && (cc.camera || cc._camera)
            if (!cam) return
            const dt = last ? (now - last) / 1000 : 0
            last = now
            if (live.current.speedScale !== seenScale) { seenScale = live.current.speedScale; speedKept = null; state = null }
            if (!state) {
                const base = speedForScene(sceneRadius()) * live.current.speedScale
                state = { ...flyStart(cam.position.toArray()), speed: speedKept ?? base, base }
            }
            const look = cam.getWorldDirection(cam.position.clone()).toArray()
            const heldNow = heldWithModifiers(held, mods)
            const params = flyParamsFor(heldNow, { baseSpeed: state.base, factor: live.current.factor })
            const next = flyStep({ pos: cam.position.toArray(), vel: state.vel, speed: state.speed }, flyInputFor(heldNow, look, wheel), dt, params)
            wheel = 0
            const delta = next.pos.map((c, i) => c - cam.position.getComponent(i))
            const target = cc.getTarget(cam.position.clone())
            state = { ...state, vel: next.vel, speed: next.speed }
            speedKept = next.speed
            const moving = Math.hypot(...next.vel) > 1e-3 || held.size > 0
            if (Math.hypot(...delta) > 0) flew = true
            if (Math.hypot(...delta) > 0) cc.setLookAt(next.pos[0], next.pos[1], next.pos[2], target.x + delta[0], target.y + delta[1], target.z + delta[2], false)
            if (moving && rmb) raf = win.requestAnimationFrame(frame)
            else {
                last = 0
                if (!moving) state = null
                // the flight came to rest (or the button was let go): tell whoever saves the view, as camera-controls does after a drag
                if (flew) { flew = false; cc.dispatchEvent?.({ type: 'controlend' }) }
            }
        }
        const kick = () => { if (!raf) { last = 0; raf = win.requestAnimationFrame(frame) } }
        const onDown = (e) => { const el = elementNow(); if (e.button === 2 && el && el.contains(e.target)) { rmb = true; mods = modifiersFrom(e) } }
        const release = () => { rmb = false; held.clear() }
        const onUp = (e) => { if (e.button === 2) release() }
        // the latch must never outlive the button: a release outside the window, a context menu or a hidden tab sends no pointerup
        const onMove = (e) => { if (rmb) { mods = modifiersFrom(e); if (rightButtonUp(e)) release() } }
        // Bubble phase on purpose: camera-controls preventDefaults the menu when the right button is mapped (the Studio case), no menu opens and
        // pointerup still comes, so flying goes on (contextmenu fires on mousedown on Linux/macOS). An unprevented menu WILL swallow pointerup.
        const onContext = (e) => { if (!e.defaultPrevented) release() }
        const onVisibility = () => { if (doc.visibilityState === 'hidden') release() }
        const onKey = (down) => (e) => {
            if (e.key === 'Shift' || e.key === 'Alt') mods = modifiersFrom(e)
            if (typing(e.target) || !rmb || isChord(e)) return // not flying: the key is somebody else's
            const name = FLY_CODES[e.code] || (e.key === 'Shift' ? 'shift' : e.key === 'Alt' ? 'alt' : null)
            if (!name) return
            if (FLY_CODES[e.code]) { e.preventDefault(); e.stopPropagation() }
            if (down) held.add(name); else held.delete(name)
            kick()
        }
        const onWheel = (e) => {
            const el = elementNow()
            if (!rmb || !el || !el.contains(e.target)) return
            // window capture runs before any document listener; stopImmediate keeps useCameraNavigation's wheel from also running
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
            mods = modifiersFrom(e)
            wheel += wheelNotches(e) // 100 px = one notch, deltaMode aware: a trackpad swipe is a few notches, not dozens
            kick()
        }
        const kd = onKey(true), ku = onKey(false)
        const onBlur = release
        doc.addEventListener('pointerdown', onDown, true)
        doc.addEventListener('pointerup', onUp, true)
        doc.addEventListener('pointercancel', onUp, true)
        doc.addEventListener('keydown', kd, true)
        doc.addEventListener('keyup', ku, true)
        doc.addEventListener('pointermove', onMove, true)
        doc.addEventListener('contextmenu', onContext)
        doc.addEventListener('visibilitychange', onVisibility)
        win.addEventListener('wheel', onWheel, { capture: true, passive: false })
        win.addEventListener('blur', onBlur)
        return () => {
            if (raf) win.cancelAnimationFrame(raf)
            doc.removeEventListener('pointerdown', onDown, true)
            doc.removeEventListener('pointerup', onUp, true)
            doc.removeEventListener('pointercancel', onUp, true)
            doc.removeEventListener('keydown', kd, true)
            doc.removeEventListener('keyup', ku, true)
            doc.removeEventListener('pointermove', onMove, true)
            doc.removeEventListener('contextmenu', onContext)
            doc.removeEventListener('visibilitychange', onVisibility)
            win.removeEventListener('wheel', onWheel, { capture: true })
            win.removeEventListener('blur', onBlur)
        }
    }, [active, enabled, controlsRef, getScene])
}
