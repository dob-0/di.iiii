// WALK — Blender's Walk Navigation in the Studio (owner, 2026-10-12: "full freedom to move"; "like in Blender, people will not need to
// learn something new"). Modal, as in Blender: Shift+` enters, the pointer is locked and the mouse looks, W/S move along the look,
// A/D strafe, Q/E go down/up in world space, Shift is faster, Alt slower; Esc / Enter / left click keep the place, right click returns
// to where the walk began (Blender: Esc/RMB cancel, Enter/LMB confirm — in a browser Esc also releases the pointer lock, so it
// confirms here). The camera is free of any orbit point while walking; when the walk ends, camera-controls is re-aimed from the
// new place with the look depth kept, so orbit, pan and zoom carry on from there.
// Numbers: the owner's Blender 5.2 preferences read from ~/.config/blender/5.2 on 2026-10-12 — walk_speed 2.5 m/s,
// walk_speed_factor 5 (Shift), mouse_speed 1.0, gravity off, view_height 1.6 m (unused without gravity). The motion itself is the
// pure flyStep (src/project/viewport/flyMotion.js: frame-rate-independent first-order ramp).
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { FLY_DEFAULTS, flyStart, flyStep } from '../../project/viewport/flyMotion.js'

export const WALK_KEYS = Object.freeze({ KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right', KeyE: 'up', KeyQ: 'down' })
export const WALK_PREFS = Object.freeze({
    walkSpeed: 2.5,        // Blender walk_speed (m/s), the owner's value
    walkSpeedFactor: 5,    // Blender walk_speed_factor: Shift multiplies by this, the owner's value
    slowFactor: 0.25,      // Alt: Blender says "slower" and publishes no factor; ours
    mouseSpeed: 1.0,       // Blender mouse_speed, the owner's value
    lookRadPerPx: 0.4 * Math.PI / 180, // Blender Orbit Sensitivity 0.4°/px (his value) reused for the look; Blender's walk factor is not published
    pitchLimit: Math.PI / 2 - 0.01,
    accelTime: 0.08,       // Blender's walk has no published ramp; a short one keeps the frame-rate independence of flyStep. ours
    stopTime: 0.06,
    // The longest frame the walk counts: the flight's (useCameraNavigation, 0.25 s). flyStep's own 0.1 s made a walk below
    // 10 fps slower (review 2: 1.05 m a second at 5 fps instead of 2.5).
    maxDt: 0.25,
})

/** Is this keydown the Blender walk toggle (Shift+`)? Pure. */
export const isWalkToggle = (e) => Boolean(e && e.code === 'Backquote' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey)

/** flyStep params for the keys held: Shift wins over Alt. Pure. */
export const walkParams = (held, prefs = WALK_PREFS) => ({
    ...FLY_DEFAULTS,
    baseSpeed: prefs.walkSpeed,
    sprintFactor: held.has('shift') ? prefs.walkSpeedFactor : held.has('alt') ? prefs.slowFactor : 1,
    accelTime: prefs.accelTime,
    stopTime: prefs.stopTime,
    maxDt: prefs.maxDt,
    wheelStep: 1, // the wheel does not change the walk speed (Blender walk: speed is a preference)
})

/** The flyStep input for the keys held and the look direction. Pure. */
export const walkInput = (held, look) => ({
    forward: held.has('forward'), back: held.has('back'), left: held.has('left'), right: held.has('right'),
    up: held.has('up'), down: held.has('down'), sprint: held.has('shift') || held.has('alt'), wheel: 0, look,
})

/** Yaw/pitch after a mouse movement (pixels), pitch clamped. Pure. */
export const lookAfter = ({ yaw, pitch }, dx, dy, prefs = WALK_PREFS) => {
    const k = prefs.lookRadPerPx * prefs.mouseSpeed
    const p = Math.max(-prefs.pitchLimit, Math.min(prefs.pitchLimit, pitch - dy * k))
    return { yaw: yaw - dx * k, pitch: p }
}

const typing = (t) => t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)

export function useWalkNavigation({ controlsRef, active = true, onWalkingChange, onCameraChange }) {
    const cbs = useRef({ onWalkingChange, onCameraChange })
    useEffect(() => { cbs.current = { onWalkingChange, onCameraChange } }, [onWalkingChange, onCameraChange])
    useEffect(() => {
        if (!active || typeof document === 'undefined') return undefined
        const doc = document
        let walk = null // { state, yaw, pitch, held, start:{pos,target}, depth, raf, last }
        const fwd = new Vector3(), tmp = new Vector3()
        const forwardOf = (yaw, pitch) => fwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))

        const aim = () => { // write the camera; camera-controls is paused while walking
            const cc = controlsRef.current
            if (!cc || !walk) return
            const cam = cc.camera
            cam.position.set(walk.state.pos[0], walk.state.pos[1], walk.state.pos[2])
            forwardOf(walk.yaw, walk.pitch)
            cam.lookAt(tmp.copy(cam.position).add(fwd))
            cam.updateMatrixWorld()
        }
        const frame = (now) => {
            if (!walk) return
            const dt = walk.last ? (now - walk.last) / 1000 : 0
            walk.last = now
            forwardOf(walk.yaw, walk.pitch)
            walk.state = flyStep(walk.state, walkInput(walk.held, [fwd.x, fwd.y, fwd.z]), dt, walkParams(walk.held))
            aim()
            walk.raf = requestAnimationFrame(frame)
        }
        const begin = () => {
            const cc = controlsRef.current
            if (!cc || walk) return
            const cam = cc.camera
            const target = cc.getTarget(new Vector3())
            const depth = Math.max(0.5, cam.position.distanceTo(target))
            const dir = tmp.copy(target).sub(cam.position).normalize()
            const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)))
            const yaw = Math.atan2(-dir.x, -dir.z)
            walk = {
                state: flyStart(cam.position.toArray(), walkParams(new Set())), yaw, pitch, held: new Set(), depth,
                start: { pos: cam.position.toArray(), target: target.toArray() }, raf: 0, last: 0,
            }
            cc.enabled = false
            try { cc._domElement?.requestPointerLock?.() } catch { /* no lock: the look follows plain mouse movement */ }
            cbs.current.onWalkingChange?.(true)
            walk.raf = requestAnimationFrame(frame)
        }
        const end = ({ cancel = false } = {}) => {
            const cc = controlsRef.current
            if (!walk) return
            cancelAnimationFrame(walk.raf)
            const w = walk
            walk = null
            if (doc.pointerLockElement) { try { doc.exitPointerLock() } catch { /* already out */ } }
            if (!cc) return
            cc.enabled = true
            if (cancel) {
                cc.setLookAt(w.start.pos[0], w.start.pos[1], w.start.pos[2], w.start.target[0], w.start.target[1], w.start.target[2], false)
            } else {
                forwardOf(w.yaw, w.pitch)
                const p = w.state.pos
                cc.setLookAt(p[0], p[1], p[2], p[0] + fwd.x * w.depth, p[1] + fwd.y * w.depth, p[2] + fwd.z * w.depth, false)
            }
            cbs.current.onWalkingChange?.(false)
            cbs.current.onCameraChange?.({ position: cc.camera.position.toArray(), target: cc.getTarget(new Vector3()).toArray() })
        }
        const onKeyDown = (e) => {
            if (typing(e.target)) return
            if (isWalkToggle(e)) { e.preventDefault(); if (walk) end(); else begin(); return }
            if (!walk) return
            // While walking the keyboard is the walk's, as Blender's Walk is modal: the Studio's window shortcuts (E the tool,
            // S the scale gizmo, A select all, Shift+D duplicate) never fire mid-walk (mapped by the move-map agent, 2026-10-13).
            e.stopImmediatePropagation()
            if (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); end(); return }
            const k = WALK_KEYS[e.code]
            if (k) { e.preventDefault(); walk.held.add(k) }
            if (e.shiftKey) walk.held.add('shift'); else walk.held.delete('shift')
            if (e.altKey) walk.held.add('alt'); else walk.held.delete('alt')
        }
        const onKeyUp = (e) => {
            if (!walk) return
            e.stopImmediatePropagation()
            const k = WALK_KEYS[e.code]
            if (k) walk.held.delete(k)
            if (!e.shiftKey) walk.held.delete('shift')
            if (!e.altKey) walk.held.delete('alt')
        }
        let lastX = null, lastY = null
        const onMouseMove = (e) => {
            if (!walk) { lastX = lastY = null; return }
            let dx = e.movementX, dy = e.movementY
            if (!doc.pointerLockElement) { dx = lastX == null ? 0 : e.clientX - lastX; dy = lastY == null ? 0 : e.clientY - lastY; lastX = e.clientX; lastY = e.clientY }
            const next = lookAfter(walk, dx, dy)
            walk.yaw = next.yaw; walk.pitch = next.pitch
        }
        const onPointerDown = (e) => {
            if (!walk) return
            e.preventDefault(); e.stopPropagation()
            if (e.button === 2) end({ cancel: true }); else if (e.button === 0) end()
        }
        const onLockChange = () => { /* Esc released the lock: the walk continues until Esc reaches onKeyDown; if it never does, end */ if (walk && !doc.pointerLockElement) setTimeout(() => { if (walk && !doc.pointerLockElement) end() }, 0) }
        const onBlur = () => { if (walk) end() }
        doc.addEventListener('keydown', onKeyDown, { capture: true })
        doc.addEventListener('keyup', onKeyUp, { capture: true })
        doc.addEventListener('mousemove', onMouseMove, { capture: true })
        doc.addEventListener('pointerdown', onPointerDown, { capture: true })
        doc.addEventListener('pointerlockchange', onLockChange)
        doc.defaultView?.addEventListener('blur', onBlur)
        return () => {
            end()
            doc.removeEventListener('keydown', onKeyDown, { capture: true })
            doc.removeEventListener('keyup', onKeyUp, { capture: true })
            doc.removeEventListener('mousemove', onMouseMove, { capture: true })
            doc.removeEventListener('pointerdown', onPointerDown, { capture: true })
            doc.removeEventListener('pointerlockchange', onLockChange)
            doc.defaultView?.removeEventListener('blur', onBlur)
        }
    }, [active, controlsRef])
}
