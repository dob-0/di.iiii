// WALK — Blender's Walk Navigation in the Studio (owner, 2026-10-12: "full freedom to move"; "like in Blender, people will not need to
// learn something new"). Modal, as in Blender: Shift+` enters, the pointer is locked and the mouse looks, W/S move along the look,
// A/D strafe, Q/E go down/up in world space, Shift is faster, Alt slower; Esc / Enter / left click keep the place, right click returns
// to where the walk began (Blender: Esc/RMB cancel, Enter/LMB confirm — in a browser Esc also releases the pointer lock, so it
// confirms here). The camera is free of any orbit point while walking; when the walk ends, camera-controls is re-aimed from the
// new place with the look depth kept, so orbit, pan and zoom carry on from there.
// Numbers: the owner's Blender 5.2 preferences read from ~/.config/blender/5.2 on 2026-10-12 — walk_speed 2.5 m/s,
// walk_speed_factor 5 (Shift), mouse_speed 1.0, gravity off, view_height 1.6 m (unused without gravity). The motion itself is the
// pure flyStep (src/project/viewport/flyMotion.js: frame-rate-independent first-order ramp).
//
// WALK and FLY (owner, 2026-10-13: "can the Studio too have the buttons Walk / Fly?"). Blender 5.2 manual, Fly/Walk Navigation
// (docs.blender.org/manual/en/latest/editors/3dview/navigate/walk_fly.html): in Walk the Tab key toggles gravity. Here the two states
// are two modes of the one controller: 'fly' = gravity off (the owner's preference, what Shift+` starts), 'walk' = gravity on — the
// camera falls to EYE_HEIGHT above the floor and stays there, W/S move on the level along the heading, E/Q do nothing. Tab switches.
// The floor is y 0: the visitor walk (LiveProjectScene's Walker) holds the eye at EYE_HEIGHT absolute, so its floor is y 0 too.
// The Studio control cluster starts either mode through requestWalk() (a document event, so the click is the user gesture the
// pointer lock needs) and shows the running one through useWalkMode().
import { useEffect, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { FLY_DEFAULTS, flyStart, flyStep } from '../../project/viewport/flyMotion.js'
import { EYE_HEIGHT } from '../../components/walkModeConfig.js'
import { isPlaying } from '../../project/play/playingFlag.js'

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

export const WALK_MODES = Object.freeze(['walk', 'fly'])
export const WALK_GRAVITY = Object.freeze({
    g: 9.80665,           // m/s², standard gravity. Blender's walk falls under gravity too; that it uses exactly this value is UNVERIFIED
    floorY: 0,            // the visitor walk's floor (see the header)
    eyeHeight: EYE_HEIGHT, // the platform's eye height, 1.6 m (also the owner's Blender view_height)
    maxDt: 0.1,           // a stalled frame counts as this long, as flyStep does
})

/** Tab in a walk: the other mode (Blender: Tab toggles gravity). Pure. */
export const nextWalkMode = (mode) => (mode === 'walk' ? 'fly' : 'walk')

/**
 * One frame of gravity. Pure. { y, vy } in metres and m/s. Above eye height the camera falls (exact constant-acceleration step,
 * so the fall does not depend on the frame rate) and lands on eye height; at or below it the camera stands at eye height, at rest.
 */
export const gravityStep = ({ y, vy = 0 }, dt, gravity = WALK_GRAVITY) => {
    const p = { ...WALK_GRAVITY, ...gravity }
    const stand = p.floorY + p.eyeHeight
    const t = Number.isFinite(dt) && dt > 0 ? Math.min(dt, p.maxDt) : 0
    if (!Number.isFinite(y) || y <= stand) return { y: stand, vy: 0 }
    const v0 = Number.isFinite(vy) ? vy : 0
    const next = y + v0 * t - 0.5 * p.g * t * t
    return next <= stand ? { y: stand, vy: 0 } : { y: next, vy: v0 - p.g * t }
}

/** What a keydown does inside a walk of this mode: 'toggle' | 'end' | a held key name | null. Pure. */
export const walkKeyAction = (code, mode) => {
    if (code === 'Tab') return 'toggle'
    if (code === 'Escape' || code === 'Enter' || code === 'NumpadEnter') return 'end'
    const k = WALK_KEYS[code]
    if (!k) return null
    if (mode === 'walk' && (k === 'up' || k === 'down')) return null // gravity holds the height: E/Q do nothing
    return k
}

/** The direction W moves: the look in Fly, the level heading in Walk. Pure. */
export const walkLook = (mode, yaw, pitch) => (mode === 'walk'
    ? [-Math.sin(yaw), 0, -Math.cos(yaw)]
    : [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)])

// The bridge between the cluster (outside the canvas) and the controller (inside it).
export const WALK_REQUEST_EVENT = 'studio:walk-request'
/** The walk asks the shell to hide / show its panels (H while building). */
export const UI_TOGGLE_EVENT = 'studio:ui-toggle'
export const WALK_STATE_EVENT = 'studio:walk-state'
/** Start a walk in this mode; the same mode again ends it, the other switches. Call it from the click itself. */
export const requestWalk = (mode) => {
    if (typeof document === 'undefined') return
    document.dispatchEvent(new CustomEvent(WALK_REQUEST_EVENT, { detail: { mode } }))
}
// THE BUILDER — the Studio's Walk is the Minecraft one: while a builder is registered, the walk hands it the keys and the
// clicks first (hotbar 1-9, E inventory, click places, right-click removes, Ctrl+Z, R turns) and ends only on Esc or a
// click nobody took. {key(e, ctx) -> bool, pointer(e, ctx) -> bool, holds() -> bool}: `ctx` = {origin, direction, relock};
// `holds()` is true while its inventory has the mouse (the look and the pointer-lock watch stand still). No builder = the
// walk as it was (a click confirms, a right-click cancels). The public viewer never registers one.
let builder = null
export const setWalkBuilder = (b) => {
    builder = b
    return () => { if (builder === b) builder = null }
}

/** The running walk's mode ('walk' | 'fly'), or null. */
export function useWalkMode() {
    const [mode, setMode] = useState(null)
    useEffect(() => {
        if (typeof document === 'undefined') return undefined
        const on = (e) => setMode(e.detail?.mode ?? null)
        document.addEventListener(WALK_STATE_EVENT, on)
        return () => document.removeEventListener(WALK_STATE_EVENT, on)
    }, [])
    return mode
}

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
        let walk = null // { mode, state, vy, yaw, pitch, held, start:{pos,target}, depth, raf, last }
        const announce = () => doc.dispatchEvent(new CustomEvent(WALK_STATE_EVENT, { detail: { mode: walk ? walk.mode : null } }))
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
            walk.state = flyStep(walk.state, walkInput(walk.held, walkLook(walk.mode, walk.yaw, walk.pitch)), dt, walkParams(walk.held))
            if (walk.mode === 'walk') {
                const g = gravityStep({ y: walk.state.pos[1], vy: walk.vy }, dt)
                walk.vy = g.vy
                walk.state = { ...walk.state, pos: [walk.state.pos[0], g.y, walk.state.pos[2]], vel: [walk.state.vel[0], 0, walk.state.vel[2]] }
            }
            aim()
            walk.raf = requestAnimationFrame(frame)
        }
        const rayOf = () => {
            forwardOf(walk.yaw, walk.pitch)
            return {
                origin: [walk.state.pos[0], walk.state.pos[1], walk.state.pos[2]],
                direction: [fwd.x, fwd.y, fwd.z],
                relock: () => { try { controlsRef.current?._domElement?.requestPointerLock?.() } catch { /* no lock */ } }
            }
        }
        const begin = (mode = 'fly') => {
            const cc = controlsRef.current
            if (!cc || walk) return
            const cam = cc.camera
            const target = cc.getTarget(new Vector3())
            const depth = Math.max(0.5, cam.position.distanceTo(target))
            const dir = tmp.copy(target).sub(cam.position).normalize()
            const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)))
            const yaw = Math.atan2(-dir.x, -dir.z)
            walk = {
                mode: WALK_MODES.includes(mode) ? mode : 'fly', vy: 0,
                state: flyStart(cam.position.toArray(), walkParams(new Set())), yaw, pitch, held: new Set(), depth,
                start: { pos: cam.position.toArray(), target: target.toArray() }, raf: 0, last: 0,
            }
            cc.enabled = false
            try { cc._domElement?.requestPointerLock?.() } catch { /* no lock: the look follows plain mouse movement */ }
            cbs.current.onWalkingChange?.(true)
            announce()
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
            announce()
            cbs.current.onCameraChange?.({ position: cc.camera.position.toArray(), target: cc.getTarget(new Vector3()).toArray() })
        }
        const onKeyDown = (e) => {
            if (isPlaying()) return
            if (typing(e.target)) return
            if (isWalkToggle(e)) { e.preventDefault(); if (walk) end(); else begin('fly'); return }
            if (!walk) return
            // The walk is modal (Blender): no key reaches the Studio's own shortcuts while it lasts — before this, E (up) and Tab also
            // toggled Navigate/Edit and H hid the panels, because StudioShell listens on window after this capture listener.
            e.stopImmediatePropagation() // also the window's other capture listeners (the standard move's map, 2026-10-13)
            if (builder) {
                // H hides every panel but the crosshair: the shell owns that state, so it is asked, not reached by the key.
                if ((e.key === 'h' || e.key === 'H') && !e.ctrlKey && !e.metaKey && !e.altKey && !builder.holds?.()) { e.preventDefault(); doc.dispatchEvent(new CustomEvent(UI_TOGGLE_EVENT)); return }
                if (builder.key?.(e, rayOf())) { e.preventDefault(); return }
            }
            // Fly up is E in Blender; building, E is the inventory, so Space lifts (Minecraft's creative fly).
            const action = walkKeyAction(builder && e.code === 'Space' ? 'KeyE' : e.code, walk.mode)
            if (action === 'end') { e.preventDefault(); end(); return }
            if (action === 'toggle') { e.preventDefault(); setMode(nextWalkMode(walk.mode)); return }
            if (action) { e.preventDefault(); walk.held.add(action) }
            if (e.shiftKey) walk.held.add('shift'); else walk.held.delete('shift')
            if (e.altKey) walk.held.add('alt'); else walk.held.delete('alt')
        }
        const setMode = (mode) => {
            if (!walk || walk.mode === mode) return
            walk.mode = mode
            walk.vy = 0
            walk.held.delete('up'); walk.held.delete('down')
            announce()
        }
        const onRequest = (e) => {
            const mode = WALK_MODES.includes(e.detail?.mode) ? e.detail.mode : 'fly'
            if (!walk) begin(mode)
            else if (walk.mode === mode) end()
            else setMode(mode)
        }
        const onKeyUp = (e) => {
            if (!walk) return
            e.stopImmediatePropagation()
            const k = WALK_KEYS[builder && e.code === 'Space' ? 'KeyE' : e.code]
            if (k) walk.held.delete(k)
            if (!e.shiftKey) walk.held.delete('shift')
            if (!e.altKey) walk.held.delete('alt')
        }
        let lastX = null, lastY = null
        const onMouseMove = (e) => {
            if (!walk) { lastX = lastY = null; return }
            if (builder?.holds?.()) { lastX = lastY = null; return }
            let dx = e.movementX, dy = e.movementY
            if (!doc.pointerLockElement) { dx = lastX == null ? 0 : e.clientX - lastX; dy = lastY == null ? 0 : e.clientY - lastY; lastX = e.clientX; lastY = e.clientY }
            const next = lookAfter(walk, dx, dy)
            walk.yaw = next.yaw; walk.pitch = next.pitch
        }
        const onPointerDown = (e) => {
            if (!walk) return
            // A click on the Walk / Fly buttons is theirs (switch or leave), not the walk's confirm.
            if (e.target?.closest?.('[data-walk-mode],[data-walk-build]')) return
            if (builder) {
                if (builder.holds?.()) return
                const taken = builder.pointer?.(e, rayOf())
                if (taken) { e.preventDefault(); e.stopPropagation(); return }
            }
            e.preventDefault(); e.stopPropagation()
            if (e.button === 2) end({ cancel: true }); else if (e.button === 0) end()
        }
        const onLockChange = () => { if (builder?.holds?.()) return; /* Esc released the lock: the walk continues until Esc reaches onKeyDown; if it never does, end */ if (walk && !doc.pointerLockElement) setTimeout(() => { if (walk && !doc.pointerLockElement) end() }, 0) }
        const onBlur = () => { if (walk) end() }
        doc.addEventListener('keydown', onKeyDown, { capture: true })
        doc.addEventListener('keyup', onKeyUp, { capture: true })
        doc.addEventListener('mousemove', onMouseMove, { capture: true })
        doc.addEventListener('pointerdown', onPointerDown, { capture: true })
        doc.addEventListener('pointerlockchange', onLockChange)
        doc.addEventListener(WALK_REQUEST_EVENT, onRequest)
        doc.defaultView?.addEventListener('blur', onBlur)
        return () => {
            end()
            doc.removeEventListener('keydown', onKeyDown, { capture: true })
            doc.removeEventListener('keyup', onKeyUp, { capture: true })
            doc.removeEventListener('mousemove', onMouseMove, { capture: true })
            doc.removeEventListener('pointerdown', onPointerDown, { capture: true })
            doc.removeEventListener('pointerlockchange', onLockChange)
            doc.removeEventListener(WALK_REQUEST_EVENT, onRequest)
            doc.defaultView?.removeEventListener('blur', onBlur)
        }
    }, [active, controlsRef])
}
