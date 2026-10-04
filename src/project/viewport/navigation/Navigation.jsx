import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
    axisView, dollyToPoint, frameSphere, glideSmoothTime, isDoubleTap, isSolidSurface, isTap,
    mouseAction, nudgeOut, pinchFactor, pointAlong, pointerRay, retargetAtDepth, stepOrbit, stepPan, stepZoom, wheelFactor
} from './navigationMath.js'

// The camera's hands (docs/architecture/MOVEMENT.md), inside the canvas beside SmartView.
//
// camera-controls stays the engine (damping, drag, boundary, limits). This adds what it does
// not do, following Blender's documented viewport navigation:
//   • zoom to the mouse position, at the depth under the pointer ("Auto Depth") — so scrolling
//     in reaches the surface you point at, and scrolling out leaves from it; pinch likewise,
//     at the fingers' centre;
//   • the orbit pivot / pan anchor at the depth under the pointer when you press, never farther
//     than the point of interest you already had;
//   • Home (the opening view), F / Numpad . (frame what is under the pointer), a double
//     click or tap (empty space: home; an object: frame it), Numpad steps and axis views;
//   • Blender's mouse set (middle orbits, Shift pans, Ctrl zooms, Alt+left = emulated middle);
//   • a camera that stops inside a surface is put outside it.
// `apiRef.current` = { home, frameAtPointer, escape } for the buttons around the canvas.

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/
const ACTION = { rotate: 1, truck: 2, dolly: 16 }
const PIVOT_MIN_DISTANCE = 0.05
const CLEARANCE = 0.1

const solidHit = (hit) => {
    const o = hit.object
    if (!o?.isMesh || o.userData?.noZoom) return false
    for (let p = o; p; p = p.parent) if (p.visible === false) return false
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const m = mats[hit.face?.materialIndex ?? 0] || mats[0]
    if (!m) return false
    if (m.depthTest === false) return false // a gizmo, a helper
    const clipped = Array.isArray(m.clippingPlanes) && m.clippingPlanes.some((pl) => pl.distanceToPoint(hit.point) < 0)
    return isSolidSurface({
        additive: m.blending === THREE.AdditiveBlending,
        opacity: m.transparent ? m.opacity : 1,
        depthWrite: m.depthWrite !== false,
        clippedPoint: clipped
    })
}

const entityOf = (object) => {
    for (let p = object; p; p = p.parent) if (p.userData?.svEntityId) return p
    return null
}

/**
 * @param {object}  props
 * @param {object}  props.controlsRef   camera-controls
 * @param {object}  props.home          { current: { position, target, fov } } — the opening view
 * @param {object}  [props.fovRef]      the lens the camera eases toward
 * @param {object}  props.apiRef        receives { home, frameAtPointer, escape }
 * @param {boolean} props.wheel         zoom to the pointer (wheel + pinch) and Auto Depth
 * @param {boolean} props.keys          Home, F, numpad
 * @param {boolean} props.doubleTap     double click / tap: home or frame
 * @param {(id:string)=>boolean} [props.isBuilding]
 * @param {()=>void} [props.onUserMove] a visitor took the camera (lets a preset go)
 */
export default function Navigation({ controlsRef, home, fovRef = null, apiRef, wheel = true, keys = true, doubleTap = true, isBuilding = null, onUserMove = null, onEscape = null }) {
    const { gl, camera, scene, size } = useThree()
    // camera-controls mounts and remounts on its own schedule: follow it.
    const [cc, setCc] = useState(null)
    useFrame(() => { if (controlsRef.current !== cc) setCc(controlsRef.current || null) })
    const live = useRef({
        cache: null, pointer: { x: 0, y: 0, inside: false }, pointers: new Map(), pinch: null,
        lastTap: null, down: null, restore: null, since: 0, lastPos: new THREE.Vector3(NaN, NaN, NaN)
    })
    const scratch = useRef({
        a: new THREE.Vector3(), b: new THREE.Vector3(), ray: new THREE.Raycaster(), box: new THREE.Box3(), sphere: new THREE.Sphere(), n: new THREE.Vector3(), m3: new THREE.Matrix3()
    })
    const propsRef = useRef({})
    useEffect(() => { propsRef.current = { home, fovRef, isBuilding, onUserMove, onEscape, size, camera } })

    useEffect(() => {
        const el = gl.domElement
        if (!cc || !el) return undefined
        const s = scratch.current
        const state = live.current
        const previousMin = cc.minDistance
        cc.minDistance = PIVOT_MIN_DISTANCE

        const goalPose = () => ({ pos: cc.getPosition(new THREE.Vector3(), true).toArray(), tgt: cc.getTarget(new THREE.Vector3(), true).toArray() })
        const ndcOf = (clientX, clientY) => {
            const r = el.getBoundingClientRect()
            return [((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1)]
        }
        const rayAt = (ndc, pose) => pointerRay(pose.pos, pose.tgt, camera.up.toArray(), camera.fov, propsRef.current.size.width / propsRef.current.size.height, ndc[0], ndc[1])
        // The first drawn solid surface under a ray, or null.
        const cast = (ray) => {
            s.ray.set(new THREE.Vector3(...ray.origin), new THREE.Vector3(...ray.direction))
            s.ray.near = 0
            s.ray.far = 2000
            s.ray.firstHitOnly = false
            const hits = s.ray.intersectObjects(scene.children, true)
            for (const hit of hits) if (solidHit(hit)) return hit
            return null
        }
        const touchUser = () => {
            cc.dispatchEvent({ type: 'controlstart' })
            clearTimeout(state.endTimer)
            state.endTimer = setTimeout(() => cc.dispatchEvent({ type: 'controlend' }), 180)
        }
        const go = (pos, tgt, transition = true) => {
            cc.setLookAt(pos[0], pos[1], pos[2], tgt[0], tgt[1], tgt[2], transition)
        }

        // --- zoom to the pointer ----------------------------------------------------------
        const zoomAt = (clientX, clientY, factor, { reuse = true } = {}) => {
            const pose = goalPose()
            const ndc = ndcOf(clientX, clientY)
            const ray = rayAt(ndc, pose)
            const now = performance.now()
            let point = null
            const c = state.cache
            if (reuse && c && now - c.t < 500 && Math.abs(c.x - clientX) < 4 && Math.abs(c.y - clientY) < 4) point = c.point
            if (!point) {
                const hit = cast(ray)
                point = hit ? hit.point.toArray() : pointAlong(ray, Math.hypot(pose.pos[0] - pose.tgt[0], pose.pos[1] - pose.tgt[1], pose.pos[2] - pose.tgt[2]))
            }
            state.cache = { t: now, x: clientX, y: clientY, point }
            const r = dollyToPoint(pose.pos, pose.tgt, point, factor)
            go(r.position, r.target, true)
            touchUser()
        }

        const onWheel = (e) => {
            if (!wheel || camera.isOrthographicCamera) return
            e.preventDefault()
            e.stopPropagation()
            zoomAt(e.clientX, e.clientY, wheelFactor(e.deltaY, { deltaMode: e.deltaMode, ctrlKey: e.ctrlKey }))
        }

        // --- presses: Blender's buttons, Auto Depth for the pivot, pinch ---------------------
        const restoreButtons = () => {
            if (!state.restore) return
            const { key, value } = state.restore
            cc.mouseButtons[key] = value
            state.restore = null
        }
        const onDown = (e) => {
            state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType })
            state.pointer = { x: e.clientX, y: e.clientY, inside: true }
            if (e.pointerType === 'mouse') {
                const act = mouseAction(e.button, { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey })
                if (act) {
                    const key = e.button === 1 ? 'middle' : 'left'
                    restoreButtons()
                    state.restore = { key, value: cc.mouseButtons[key] }
                    cc.mouseButtons[key] = ACTION[act]
                }
            }
            state.down = { t: performance.now(), x: e.clientX, y: e.clientY, pointerType: e.pointerType, id: e.pointerId }
            if (state.pointers.size === 1 && wheel && !camera.isOrthographicCamera) {
                // Auto Depth: the pivot at the surface under the pointer, never farther than the point of interest.
                const pose = goalPose()
                const hit = cast(rayAt(ndcOf(e.clientX, e.clientY), pose))
                if (hit) {
                    const cur = retargetAtDepth(pose.pos, pose.tgt, pose.tgt)
                    const near = retargetAtDepth(pose.pos, pose.tgt, hit.point.toArray())
                    const dNear = Math.hypot(near[0] - pose.pos[0], near[1] - pose.pos[1], near[2] - pose.pos[2])
                    const dCur = Math.hypot(cur[0] - pose.pos[0], cur[1] - pose.pos[1], cur[2] - pose.pos[2])
                    if (dNear < dCur - 0.01) go(pose.pos, near, false)
                }
                state.cache = null
            }
            if (state.pointers.size === 2 && e.pointerType === 'touch' && wheel && !camera.isOrthographicCamera) {
                const [p, q] = [...state.pointers.values()]
                const cx = (p.x + q.x) / 2
                const cy = (p.y + q.y) / 2
                const pose = goalPose()
                const hit = cast(rayAt(ndcOf(cx, cy), pose))
                const ray = rayAt(ndcOf(cx, cy), pose)
                state.pinch = {
                    spread: Math.hypot(p.x - q.x, p.y - q.y),
                    point: hit ? hit.point.toArray() : pointAlong(ray, Math.hypot(pose.pos[0] - pose.tgt[0], pose.pos[1] - pose.tgt[1], pose.pos[2] - pose.tgt[2]))
                }
            }
        }
        const onMove = (e) => {
            state.pointer = { x: e.clientX, y: e.clientY, inside: true }
            const p = state.pointers.get(e.pointerId)
            if (!p) return
            p.x = e.clientX
            p.y = e.clientY
            if (state.pinch && state.pointers.size === 2) {
                const [a, b] = [...state.pointers.values()]
                const spread = Math.hypot(a.x - b.x, a.y - b.y)
                const f = pinchFactor(state.pinch.spread, spread)
                state.pinch.spread = spread
                if (f !== 1) {
                    const pose = goalPose()
                    const r = dollyToPoint(pose.pos, pose.tgt, state.pinch.point, f)
                    go(r.position, r.target, false)
                }
            }
        }
        const onUp = (e) => {
            const p = state.pointers.get(e.pointerId)
            state.pointers.delete(e.pointerId)
            if (state.pointers.size < 2) state.pinch = null
            restoreButtons()
            if (!p || !doubleTap || e.pointerType !== 'touch') return
            const up = { t: performance.now(), x: e.clientX, y: e.clientY }
            if (state.down && state.down.id === e.pointerId && isTap(state.down, up) && state.pointers.size === 0) {
                if (isDoubleTap(state.lastTap, up)) {
                    state.lastTap = null
                    activate(e.clientX, e.clientY)
                } else {
                    state.lastTap = up
                }
            }
        }
        const onCancel = (e) => {
            state.pointers.delete(e.pointerId)
            state.pinch = null
            restoreButtons()
        }
        const onLeave = () => { state.pointer.inside = false }

        // --- home, frame ---------------------------------------------------------------------
        const home_ = () => {
            const h = propsRef.current.home?.current
            if (!h) return false
            const from = cc.getPosition(new THREE.Vector3(), false).toArray()
            const previous = cc.smoothTime
            cc.smoothTime = glideSmoothTime(Math.hypot(from[0] - h.position[0], from[1] - h.position[1], from[2] - h.position[2]))
            const restore = () => { cc.smoothTime = previous; cc.removeEventListener('rest', restore) }
            cc.addEventListener('rest', restore)
            if (propsRef.current.fovRef && h.fov) propsRef.current.fovRef.current = h.fov
            go(h.position, h.target, true)
            touchUser()
            return true
        }
        const frameObject = (object) => {
            const box = s.box.makeEmpty()
            object.traverse((o) => {
                if (o.isMesh && solidHit({ object: o, point: new THREE.Vector3(), face: null })) box.expandByObject(o, true)
            })
            if (box.isEmpty()) box.setFromObject(object)
            if (box.isEmpty()) return false
            box.getBoundingSphere(s.sphere)
            const pose = goalPose()
            const r = frameSphere(pose.pos, pose.tgt, s.sphere.center.toArray(), s.sphere.radius, camera.fov, propsRef.current.size.width / propsRef.current.size.height)
            go(r.position, r.target, true)
            touchUser()
            return true
        }
        const frameAtPointer = () => {
            const pose = goalPose()
            const p = state.pointer
            const ndc = p.inside ? ndcOf(p.x, p.y) : [0, 0]
            const hit = cast(rayAt(ndc, pose))
            if (!hit) return false
            const owner = entityOf(hit.object)
            if (owner && !(propsRef.current.isBuilding?.(owner.userData.svEntityId))) return frameObject(owner)
            // A wall or the floor: frame the spot, not the building.
            const r = frameSphere(pose.pos, pose.tgt, hit.point.toArray(), 1.5, camera.fov, propsRef.current.size.width / propsRef.current.size.height)
            go(r.position, r.target, true)
            touchUser()
            return true
        }
        // A double click / tap: an object is framed, anywhere else is home.
        function activate(clientX, clientY) {
            const pose = goalPose()
            const hit = cast(rayAt(ndcOf(clientX, clientY), pose))
            const owner = hit ? entityOf(hit.object) : null
            if (owner && !(propsRef.current.isBuilding?.(owner.userData.svEntityId))) frameObject(owner)
            else home_()
        }
        const onDblClick = (e) => { if (doubleTap) { e.preventDefault(); activate(e.clientX, e.clientY) } }

        // --- keys -----------------------------------------------------------------------------
        const onKey = (e) => {
            const t = e.target
            if (t && (TYPING.test(t.tagName) || t.isContentEditable)) return
            if (e.metaKey) return
            const code = e.code
            if (code === 'Home' && !e.ctrlKey && !e.altKey) { e.preventDefault(); home_(); return }
            if (code === 'Escape') { propsRef.current.onEscape?.(); return }
            if (e.altKey) return
            if ((code === 'KeyF' || code === 'NumpadDecimal') && !e.ctrlKey && !e.shiftKey) {
                if (frameAtPointer()) e.preventDefault()
                return
            }
            if (!/^Numpad/.test(code)) return
            const pose = goalPose()
            const dist = Math.hypot(pose.pos[0] - pose.tgt[0], pose.pos[1] - pose.tgt[1], pose.pos[2] - pose.tgt[2])
            const stepO = stepOrbit(code)
            if (stepO && !e.ctrlKey) { e.preventDefault(); cc.rotate(stepO[0], stepO[1], true); touchUser(); return }
            const stepP = stepPan(code)
            if (stepP && e.ctrlKey) {
                e.preventDefault()
                const unit = dist * Math.tan((camera.fov * Math.PI) / 360) * 0.4
                cc.truck(stepP[0] * unit, -stepP[1] * unit, true)
                touchUser()
                return
            }
            const z = stepZoom(code)
            if (z && !e.ctrlKey) {
                e.preventDefault()
                const r = el.getBoundingClientRect()
                zoomAt(r.left + r.width / 2, r.top + r.height / 2, z, { reuse: false })
                return
            }
            const name = { Numpad1: 'front', Numpad3: 'right', Numpad7: 'top' }[code]
            if (name) {
                e.preventDefault()
                const v = axisView(pose.tgt, dist, name, e.ctrlKey)
                go(v.position, v.target, true)
                touchUser()
            }
        }

        // --- a camera that came to rest inside a surface is put outside it --------------------
        const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
        const settle = () => {
            const pos = cc.getPosition(new THREE.Vector3(), false)
            const probes = []
            for (const d of AXES) {
                s.ray.set(pos, s.a.set(d[0], d[1], d[2]))
                s.ray.near = 0
                s.ray.far = CLEARANCE * 3
                const hits = s.ray.intersectObjects(scene.children, true)
                const hit = hits.find(solidHit)
                if (!hit || !hit.face) continue
                s.m3.getNormalMatrix(hit.object.matrixWorld)
                const n = s.n.copy(hit.face.normal).applyMatrix3(s.m3).normalize()
                probes.push({ direction: d, distance: hit.distance, normal: n.toArray(), frontFacing: n.dot(s.a.set(d[0], d[1], d[2])) < 0 })
            }
            const push = nudgeOut(probes, CLEARANCE)
            if (!push) return
            const tgt = cc.getTarget(new THREE.Vector3(), false)
            go([pos.x + push[0], pos.y + push[1], pos.z + push[2]], [tgt.x + push[0], tgt.y + push[1], tgt.z + push[2]], true)
        }
        const onRest = () => { if (state.pointers.size === 0) settle() }

        // Wheel handlers must be non-passive to preventDefault; capture so camera-controls' own
        // wheel (set to NONE by the viewer when `wheel` is on) never doubles it.
        el.addEventListener('wheel', onWheel, { passive: false, capture: true })
        el.addEventListener('pointerdown', onDown, { capture: true })
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
        window.addEventListener('pointercancel', onCancel)
        el.addEventListener('pointerleave', onLeave)
        el.addEventListener('dblclick', onDblClick)
        if (keys) window.addEventListener('keydown', onKey)
        cc.addEventListener('rest', onRest)
        if (apiRef) apiRef.current = { home: home_, frameAtPointer, escape: () => propsRef.current.onEscape?.() }
        return () => {
            el.removeEventListener('wheel', onWheel, { capture: true })
            el.removeEventListener('pointerdown', onDown, { capture: true })
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointercancel', onCancel)
            el.removeEventListener('pointerleave', onLeave)
            el.removeEventListener('dblclick', onDblClick)
            window.removeEventListener('keydown', onKey)
            cc.removeEventListener('rest', onRest)
            clearTimeout(state.endTimer)
            restoreButtons()
            cc.minDistance = previousMin
            if (apiRef && apiRef.current) apiRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gl, scene, camera, cc, wheel, keys, doubleTap])

    return null
}
