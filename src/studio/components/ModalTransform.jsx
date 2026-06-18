import { useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Euler, Plane, Quaternion, Raycaster, Vector3 } from 'three'

const AXIS_VEC = {
    x: new Vector3(1, 0, 0),
    y: new Vector3(0, 1, 0),
    z: new Vector3(0, 0, 1)
}
const AXIS_COLOR = { x: '#ff5a6a', y: '#7dd35f', z: '#5a8bff' }
const AXIS_LABEL = { x: 'X', y: 'Y', z: 'Z' }
// Blender snap increments: 1 unit for move, 5° for rotate, 0.1 for scale.
const SNAP = { translate: 1, rotate: 5, scale: 0.1 }
const PRECISION = 0.1
const LINE_LEN = 1000

// Param `s` of the point on line (p1 + s*d1unit) closest to the ray.
function closestAxisParam(ray, p1, d1) {
    const p2 = ray.origin
    const d2 = ray.direction
    const w0 = p1.clone().sub(p2)
    const b = d1.dot(d2)
    const c = d2.dot(d2)
    const d = d1.dot(w0)
    const e = d2.dot(w0)
    const denom = c - b * b // a = d1·d1 = 1 (unit axis)
    if (Math.abs(denom) < 1e-6) return null
    return (b * e - c * d) / denom
}

const snapTo = (value, inc) => (inc > 0 ? Math.round(value / inc) * inc : value)
const fmt = (n) => {
    const r = Math.round(n * 1000) / 1000
    return Object.is(r, -0) ? '0' : String(r)
}
const parseNumeric = (str) => {
    if (!str || str === '-' || str === '.' || str === '-.') return 0
    const n = Number.parseFloat(str)
    return Number.isNaN(n) ? 0 : n
}

/**
 * Blender-style modal transform. Mounted inside the Canvas while `op` is set.
 * G/R/S grab the selection (it follows the mouse); X/Y/Z constrain to a global
 * axis (press again → local, again → free); Shift+axis constrains to a plane;
 * type a number for an exact value; Shift = precision, Ctrl = snap; click /
 * Enter / Space confirm; Esc / right-click cancel.
 */
export default function ModalTransform({ op, selectedEntities, primaryId, controlsRef, onPreview, onCommit, onCancel, onStatus }) {
    const { camera, gl } = useThree()
    const pointerRef = useRef({ x: 0, y: 0, w: 1, h: 1 })
    const sessionRef = useRef(null)
    const [hud, setHud] = useState(null)
    const cbRef = useRef({})
    cbRef.current = { onPreview, onCommit, onCancel, onStatus }

    // Always track the latest pointer position (canvas-relative pixels).
    useEffect(() => {
        const el = gl.domElement
        const track = (event) => {
            const rect = el.getBoundingClientRect()
            pointerRef.current = {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top,
                w: rect.width || 1,
                h: rect.height || 1
            }
        }
        window.addEventListener('pointermove', track)
        return () => window.removeEventListener('pointermove', track)
    }, [gl])

    useEffect(() => {
        if (!op || !selectedEntities?.length) return undefined

        const controls = controlsRef?.current
        const raycaster = new Raycaster()
        const cameraDir = camera.getWorldDirection(new Vector3())
        const axisOut = cameraDir.clone().negate() // out of the screen, toward the viewer

        const entities = selectedEntities.map((entity) => {
            const t = entity.components?.transform || {}
            return {
                id: entity.id,
                pos: [...(t.position || [0, 0, 0])],
                rot: [...(t.rotation || [0, 0, 0])],
                scale: [...(t.scale || [1, 1, 1])]
            }
        })
        const primary = entities.find((e) => e.id === primaryId) || entities[0]
        const primaryQuat = new Quaternion().setFromEuler(
            new Euler(primary.rot[0], primary.rot[1], primary.rot[2], 'XYZ')
        )
        const pivot = entities
            .reduce((acc, e) => acc.add(new Vector3(...e.pos)), new Vector3())
            .divideScalar(entities.length)

        const session = {
            mode: op.mode,
            axis: null,
            space: 'global',
            plane: false,
            numeric: '',
            shift: false,
            ctrl: false,
            // Rotate waits for an axis before it starts tracking the mouse; move/scale
            // begin immediately.
            armed: op.mode !== 'rotate',
            startPointer: { ...pointerRef.current },
            pivot,
            entities,
            primaryQuat,
            preview: null,
            moved: false
        }
        sessionRef.current = session

        const ndc = (p) => ({ x: (p.x / p.w) * 2 - 1, y: -((p.y / p.h) * 2 - 1) })
        const rayFor = (p) => {
            raycaster.setFromCamera(ndc(p), camera)
            return raycaster.ray
        }
        const pivotScreen = () => {
            const v = pivot.clone().project(camera)
            const p = pointerRef.current
            return { x: (v.x * 0.5 + 0.5) * p.w, y: (-v.y * 0.5 + 0.5) * p.h }
        }
        const axisUnit = (axis) => {
            const base = AXIS_VEC[axis].clone()
            if (session.space === 'local') base.applyQuaternion(primaryQuat).normalize()
            return base
        }

        const compute = (p) => {
            const map = {}
            const lines = []

            // Rotate is armed but no axis chosen yet — hold still and prompt for an axis.
            if (session.mode === 'rotate' && !session.armed) {
                for (const e of session.entities) {
                    map[e.id] = { position: e.pos, rotation: e.rot, scale: e.scale }
                }
                return { map, hud: { text: 'Rotate: press X / Y / Z to choose an axis', lines, pivot: [pivot.x, pivot.y, pivot.z] } }
            }

            const numericActive = session.numeric !== ''
            const numericVal = parseNumeric(session.numeric)
            let text = ''

            const pushAxisLine = (axis) => {
                const u = axisUnit(axis)
                lines.push({
                    axis,
                    points: [
                        [pivot.x - u.x * LINE_LEN, pivot.y - u.y * LINE_LEN, pivot.z - u.z * LINE_LEN],
                        [pivot.x + u.x * LINE_LEN, pivot.y + u.y * LINE_LEN, pivot.z + u.z * LINE_LEN]
                    ]
                })
            }
            const spaceTag = session.space === 'local' ? ' (local)' : ''
            const numTag = numericActive ? `  ⌨ ${session.numeric || '0'}` : ''

            if (session.mode === 'translate') {
                let delta = new Vector3()
                let label
                if (numericActive) {
                    const axis = session.axis || 'x'
                    delta = axisUnit(axis).multiplyScalar(numericVal)
                    pushAxisLine(axis)
                    label = `Move ${AXIS_LABEL[axis]}${spaceTag}: ${fmt(numericVal)}`
                } else if (session.plane && session.axis) {
                    const normal = axisUnit(session.axis)
                    const plane = new Plane().setFromNormalAndCoplanarPoint(normal, pivot)
                    const a = new Vector3()
                    const b = new Vector3()
                    if (rayFor(session.startPointer).intersectPlane(plane, a) && rayFor(p).intersectPlane(plane, b)) {
                        delta = b.sub(a)
                        if (session.shift) delta.multiplyScalar(PRECISION)
                        if (session.ctrl) {
                            const inc = SNAP.translate * (session.shift ? PRECISION : 1)
                            delta.set(snapTo(delta.x, inc), snapTo(delta.y, inc), snapTo(delta.z, inc))
                        }
                    }
                    for (const ax of ['x', 'y', 'z']) if (ax !== session.axis) pushAxisLine(ax)
                    label = `Move plane ⊥${AXIS_LABEL[session.axis]}${spaceTag}: ${fmt(delta.length())}`
                } else if (session.axis) {
                    const unit = axisUnit(session.axis)
                    const t0 = closestAxisParam(rayFor(session.startPointer), pivot, unit)
                    const t1 = closestAxisParam(rayFor(p), pivot, unit)
                    let dist = (t0 != null && t1 != null) ? t1 - t0 : 0
                    if (session.shift) dist *= PRECISION
                    if (session.ctrl) dist = snapTo(dist, SNAP.translate * (session.shift ? PRECISION : 1))
                    delta = unit.multiplyScalar(dist)
                    pushAxisLine(session.axis)
                    label = `Move ${AXIS_LABEL[session.axis]}${spaceTag}: ${fmt(dist)}`
                } else {
                    const plane = new Plane().setFromNormalAndCoplanarPoint(cameraDir, pivot)
                    const a = new Vector3()
                    const b = new Vector3()
                    if (rayFor(session.startPointer).intersectPlane(plane, a) && rayFor(p).intersectPlane(plane, b)) {
                        delta = b.sub(a)
                        if (session.shift) delta.multiplyScalar(PRECISION)
                        if (session.ctrl) {
                            const inc = SNAP.translate * (session.shift ? PRECISION : 1)
                            delta.set(snapTo(delta.x, inc), snapTo(delta.y, inc), snapTo(delta.z, inc))
                        }
                    }
                    label = `Move: ${fmt(delta.x)}  ${fmt(delta.y)}  ${fmt(delta.z)}`
                }
                for (const e of session.entities) {
                    map[e.id] = {
                        position: [e.pos[0] + delta.x, e.pos[1] + delta.y, e.pos[2] + delta.z],
                        rotation: e.rot,
                        scale: e.scale
                    }
                }
                text = label + numTag
            } else if (session.mode === 'rotate') {
                const axisVec = session.axis ? axisUnit(session.axis) : axisOut
                let angle
                if (numericActive) {
                    angle = (numericVal * Math.PI) / 180
                } else {
                    const ps = pivotScreen()
                    const a0 = Math.atan2(session.startPointer.y - ps.y, session.startPointer.x - ps.x)
                    const a1 = Math.atan2(p.y - ps.y, p.x - ps.x)
                    angle = -(a1 - a0)
                    if (session.axis) angle *= Math.sign(axisVec.dot(axisOut)) || 1
                    if (session.shift) angle *= PRECISION
                    if (session.ctrl) angle = (snapTo((angle * 180) / Math.PI, SNAP.rotate) * Math.PI) / 180
                }
                if (session.axis) pushAxisLine(session.axis)
                const dq = new Quaternion().setFromAxisAngle(axisVec, angle)
                for (const e of session.entities) {
                    const startQ = new Quaternion().setFromEuler(new Euler(e.rot[0], e.rot[1], e.rot[2], 'XYZ'))
                    const nextE = new Euler().setFromQuaternion(dq.clone().multiply(startQ), 'XYZ')
                    const offset = new Vector3(...e.pos).sub(pivot).applyQuaternion(dq).add(pivot)
                    map[e.id] = {
                        position: [offset.x, offset.y, offset.z],
                        rotation: [nextE.x, nextE.y, nextE.z],
                        scale: e.scale
                    }
                }
                const axisLabel = session.axis ? ` ${AXIS_LABEL[session.axis]}${spaceTag}` : ''
                text = `Rotate${axisLabel}: ${fmt((angle * 180) / Math.PI)}°` + numTag
            } else { // scale
                let factor
                if (numericActive) {
                    factor = numericVal
                } else {
                    const ps = pivotScreen()
                    const dStart = Math.hypot(session.startPointer.x - ps.x, session.startPointer.y - ps.y)
                    const dNow = Math.hypot(p.x - ps.x, p.y - ps.y)
                    factor = dStart < 4 ? 1 : dNow / dStart
                    if (session.shift) factor = 1 + (factor - 1) * PRECISION
                    if (session.ctrl) factor = snapTo(factor, SNAP.scale)
                }
                const inPlane = session.plane && session.axis
                const axisActive = (ax) => {
                    if (inPlane) return ax !== session.axis
                    if (session.axis) return ax === session.axis
                    return true
                }
                const fx = axisActive('x') ? factor : 1
                const fy = axisActive('y') ? factor : 1
                const fz = axisActive('z') ? factor : 1
                if (session.axis) {
                    if (inPlane) {
                        for (const ax of ['x', 'y', 'z']) if (ax !== session.axis) pushAxisLine(ax)
                    } else {
                        pushAxisLine(session.axis)
                    }
                }
                for (const e of session.entities) {
                    map[e.id] = {
                        position: [
                            pivot.x + (e.pos[0] - pivot.x) * fx,
                            pivot.y + (e.pos[1] - pivot.y) * fy,
                            pivot.z + (e.pos[2] - pivot.z) * fz
                        ],
                        rotation: e.rot,
                        scale: [e.scale[0] * fx, e.scale[1] * fy, e.scale[2] * fz]
                    }
                }
                const axisLabel = session.axis ? ` ${inPlane ? `⊥${AXIS_LABEL[session.axis]}` : AXIS_LABEL[session.axis]}` : ''
                text = `Scale${axisLabel}: ${fmt(factor)}` + numTag
            }

            return { map, hud: { text, lines, pivot: [pivot.x, pivot.y, pivot.z] } }
        }

        const preview = () => {
            const result = compute(pointerRef.current)
            if (!result) return
            session.preview = result.map
            cbRef.current.onPreview?.(result.map)
            cbRef.current.onStatus?.({ text: result.hud.text })
            setHud(result.hud)
        }

        const finish = (commit) => {
            if (controls) controls.enabled = true
            const active = session.mode !== 'rotate' || session.armed
            const wasMoved = active && (session.moved || session.numeric !== '')
            sessionRef.current = null
            setHud(null)
            cbRef.current.onStatus?.(null)
            if (commit && wasMoved && session.preview) {
                cbRef.current.onCommit?.(
                    Object.entries(session.preview).map(([id, transform]) => ({ id, transform }))
                )
            } else {
                cbRef.current.onCancel?.()
            }
        }

        const cycleAxis = (axis, shiftKey) => {
            if (shiftKey) {
                if (session.axis === axis && session.plane) {
                    session.axis = null
                    session.plane = false
                } else {
                    session.axis = axis
                    session.plane = true
                    session.space = 'global'
                }
                return
            }
            if (session.axis !== axis || session.plane) {
                session.axis = axis
                session.plane = false
                session.space = 'global'
            } else if (session.space === 'global') {
                session.space = 'local'
            } else {
                session.axis = null
                session.space = 'global'
            }
        }

        const handleMove = (event) => {
            session.shift = event.shiftKey
            session.ctrl = event.ctrlKey || event.metaKey
            session.moved = true
            preview()
        }
        const handleKeyDown = (event) => {
            const key = event.key
            const lower = key?.toLowerCase?.()
            session.shift = event.shiftKey
            session.ctrl = event.ctrlKey || event.metaKey

            if (lower === 'x' || lower === 'y' || lower === 'z') {
                event.preventDefault(); event.stopImmediatePropagation()
                cycleAxis(lower, event.shiftKey)
                // Rotate starts tracking the mouse only once an axis is chosen; re-base
                // the pointer so the rotation begins from zero at that moment.
                if (session.mode === 'rotate') {
                    if (session.axis && !session.armed) {
                        session.armed = true
                        session.startPointer = { ...pointerRef.current }
                    } else if (!session.axis) {
                        session.armed = false
                    }
                }
                preview()
            } else if (lower === 'g' || lower === 'r' || lower === 's') {
                event.preventDefault(); event.stopImmediatePropagation()
                session.mode = lower === 'g' ? 'translate' : lower === 'r' ? 'rotate' : 'scale'
                session.numeric = ''
                // Switching to rotate re-arms (wait for an axis); move/scale track at once.
                session.armed = session.mode === 'rotate' ? !!session.axis : true
                if (session.armed) session.startPointer = { ...pointerRef.current }
                preview()
            } else if (/^[0-9]$/.test(key) || key === '.' || key === '-') {
                event.preventDefault(); event.stopImmediatePropagation()
                session.numeric += key
                preview()
            } else if (key === 'Backspace') {
                event.preventDefault(); event.stopImmediatePropagation()
                session.numeric = session.numeric.slice(0, -1)
                preview()
            } else if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
                event.preventDefault(); event.stopImmediatePropagation()
                finish(true)
            } else if (key === 'Escape') {
                event.preventDefault(); event.stopImmediatePropagation()
                finish(false)
            } else if (key === 'Shift' || key === 'Control' || key === 'Meta') {
                preview()
            }
        }
        const handleKeyUp = (event) => {
            session.shift = event.shiftKey
            session.ctrl = event.ctrlKey || event.metaKey
            if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Meta') preview()
        }
        const handlePointerDown = (event) => {
            event.preventDefault(); event.stopImmediatePropagation()
            finish(event.button !== 2)
        }
        const handleContextMenu = (event) => {
            event.preventDefault()
            finish(false)
        }

        if (controls) controls.enabled = false
        preview()

        window.addEventListener('pointermove', handleMove)
        window.addEventListener('keydown', handleKeyDown, true)
        window.addEventListener('keyup', handleKeyUp, true)
        window.addEventListener('pointerdown', handlePointerDown, true)
        window.addEventListener('contextmenu', handleContextMenu)
        return () => {
            window.removeEventListener('pointermove', handleMove)
            window.removeEventListener('keydown', handleKeyDown, true)
            window.removeEventListener('keyup', handleKeyUp, true)
            window.removeEventListener('pointerdown', handlePointerDown, true)
            window.removeEventListener('contextmenu', handleContextMenu)
            if (controls) controls.enabled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [op?.seq])

    if (!hud?.lines?.length) return null
    return (
        <group renderOrder={999}>
            {hud.lines.map((line) => (
                <Line
                    key={line.axis}
                    points={line.points}
                    color={AXIS_COLOR[line.axis]}
                    lineWidth={1.5}
                    transparent
                    opacity={0.9}
                    depthTest={false}
                />
            ))}
        </group>
    )
}
