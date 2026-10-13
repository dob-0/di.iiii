import { useEffect, useRef, useState } from 'react'
import { Line } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import {
    pointerOnPivotPlane, pivotOnScreen, grabStep, constrainDelta, rotateAxis, rotateEulerAroundWorldAxis,
    orbitAroundPivot, scaleStep, angleAround, distanceFrom, snapVector, snapScalar,
    PLANE_OF_KEY, isPlane, indicesOf, typedRotateAxis, snapStepFor,
} from '../utils/modalMotion.js'

const AXIS_VEC = {
    x: new Vector3(1, 0, 0),
    y: new Vector3(0, 1, 0),
    z: new Vector3(0, 0, 1),
}
const AXIS_COLOR = { x: '#ff5a6a', y: '#7dd35f', z: '#5a8bff' }
const LINE_LEN = 1000
const MODE_LABEL = { translate: 'GRAB', rotate: 'ROTATE', scale: 'SCALE' }
// Ctrl-held snap increments live in modalMotion.js (snapStepFor: 0.5 m / 15° / 0.1, a tenth with
// Shift). Snapping rounds the accumulated total, so tapping Ctrl mid-drag snaps the current result
// instead of just future movement.

const wrapAngle = (a) => ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI

/**
 * Blender's modal transform (owner 2026-10-13: "move … stuck, not like Blender"). G/R/S starts it;
 * the object follows the cursor at once: grab in the plane through the pivot facing the camera,
 * X/Y/Z slide along that axis, rotate by the angle the pointer turns around the pivot, scale by the
 * pointer's distance to the pivot (src/studio/utils/modalMotion.js). Shift = fine, Ctrl = snap,
 * typed numbers with an axis, click/Enter/Space confirm, Esc cancels. Colored axis line + HUD text.
 */
export default function ModalTransform({ op, selectedEntities, controlsRef, onPreview, onCommit, onCancel, onStatus }) {
    const camera = useThree((state) => state.camera)
    const gl = useThree((state) => state.gl)
    const sessionRef = useRef(null)
    const cbRef = useRef({})
    const [hudLines, setHudLines] = useState([])

    // The callbacks, kept where the keyboard and mouse handlers below can reach
    // the CURRENT ones without re-binding the session on every render. Written
    // in an effect rather than during render: a ref written mid-render is a
    // write to state React has not committed yet, and the rule that says so
    // (react-hooks/refs) is an error in the linter CI installs.
    useEffect(() => {
        cbRef.current = { onPreview, onCommit, onCancel, onStatus }
    })

    useEffect(() => {
        if (!op || !selectedEntities?.length) return undefined

        const controls = controlsRef?.current
        if (controls) controls.enabled = false

        const entities = selectedEntities.map((entity) => {
            const t = entity.components?.transform || {}
            return {
                id: entity.id,
                base: {
                    pos: [...(t.position || [0, 0, 0])],
                    rot: [...(t.rotation || [0, 0, 0])],
                    scale: [...(t.scale || [1, 1, 1])]
                },
                pos: [...(t.position || [0, 0, 0])],
                rot: [...(t.rotation || [0, 0, 0])],
                scale: [...(t.scale || [1, 1, 1])]
            }
        })

        const n = entities.length
        const computePivot = () => entities.reduce(
            (acc, e) => [acc[0] + e.pos[0] / n, acc[1] + e.pos[1] / n, acc[2] + e.pos[2] / n],
            [0, 0, 0]
        )
        let pivot = computePivot()

        const session = {
            mode: op.mode, axis: op.axis || null, entities, moved: false, total: 0, numeric: '',
            // the incremental drag: where the pointer was last, and what has accumulated since rebase
            last: null, delta: new Vector3(), angle: 0, factor: 1,
        }
        sessionRef.current = session
        const canvasRect = () => gl?.domElement?.getBoundingClientRect?.() || { left: 0, top: 0, width: window.innerWidth || 1, height: window.innerHeight || 1 }

        // Fold the current values into the base so a mode/axis switch continues
        // from where the drag left off instead of re-deriving from the start.
        const rebase = () => {
            for (const e of session.entities) {
                e.base = { pos: [...e.pos], rot: [...e.rot], scale: [...e.scale] }
            }
            pivot = computePivot()
            session.total = 0
            session.numeric = ''
            session.last = null
            session.delta.set(0, 0, 0); session.angle = 0; session.factor = 1
        }

        const buildPreviewMap = () => {
            const map = {}
            for (const e of session.entities) {
                map[e.id] = { position: e.pos, rotation: e.rot, scale: e.scale }
            }
            return map
        }

        const reportStatus = () => {
            const axisLabel = session.axis
                ? ` · ${session.axis === 'all' ? 'ALL' : isPlane(session.axis) ? `${session.axis.toUpperCase()} PLANE` : session.axis.toUpperCase()}`
                : ''
            const typed = session.numeric
                ? ` · ${session.numeric}${session.mode === 'rotate' ? '°' : session.mode === 'scale' ? '×' : ''}`
                : ''
            const hint = session.axis ? ' · move the mouse or type a value · CTRL snap · CTRL+SHIFT fine snap · SHIFT fine · ENTER' : ' · move the mouse · X / Y / Z lock an axis · SHIFT+X / Y / Z keep a plane · CTRL snap · SHIFT fine · ENTER'
            cbRef.current.onStatus?.({
                text: `${MODE_LABEL[session.mode] || session.mode}${axisLabel}${typed}${typed ? ' · ENTER' : hint}`
            })
            if (session.axis && session.axis !== 'all') {
                // one line for an axis, the plane's two for a plane
                const axes = isPlane(session.axis) ? [...session.axis] : [session.axis]
                setHudLines(axes.map((axis) => {
                    const u = AXIS_VEC[axis]
                    return {
                        axis,
                        points: [
                            [pivot[0] - u.x * LINE_LEN, pivot[1] - u.y * LINE_LEN, pivot[2] - u.z * LINE_LEN],
                            [pivot[0] + u.x * LINE_LEN, pivot[1] + u.y * LINE_LEN, pivot[2] + u.z * LINE_LEN],
                        ]
                    }
                }))
            } else {
                setHudLines([])
            }
        }

        const commitIfMoved = () => {
            if (!session.moved) return
            cbRef.current.onCommit?.(
                session.entities.map((e) => ({
                    id: e.id,
                    transform: { position: e.pos, rotation: e.rot, scale: e.scale }
                }))
            )
            session.moved = false
        }

        // Esc is documented as "Cancel" in the shipped shortcuts help and is
        // the Blender convention this operator is modeled on — it used to run
        // the same finish() as Enter/Space, silently persisting (and
        // broadcasting) the very transform the user was aborting.
        const revertToBase = () => {
            for (const e of session.entities) {
                e.pos = [...e.base.pos]
                e.rot = [...e.base.rot]
                e.scale = [...e.base.scale]
            }
            cbRef.current.onPreview?.(buildPreviewMap())
            session.moved = false
        }

        const finish = () => {
            commitIfMoved()
            if (controls) controls.enabled = true
            setHudLines([])
            cbRef.current.onStatus?.(null)
            sessionRef.current = null
            cbRef.current.onCancel?.()
        }

        // Recompute every entity from base + the accumulated total. Rotate and
        // scale act around the shared pivot (selection centroid), so a
        // multi-selection turns/grows as one rigid arrangement; a single
        // entity's own position IS the pivot, so it just spins/scales in place.
        const applyTotal = (total) => {
            const indices = indicesOf(session.axis)
            for (const e of session.entities) {
                if (session.mode === 'translate') {
                    for (const idx of indices) e.pos[idx] = e.base.pos[idx] + total
                } else if (session.mode === 'scale') {
                    const factor = Math.max(0.01, 1 + total)
                    for (const idx of indices) {
                        e.scale[idx] = Math.max(0.01, e.base.scale[idx] * factor)
                        e.pos[idx] = pivot[idx] + (e.base.pos[idx] - pivot[idx]) * factor
                    }
                } else if (session.mode === 'rotate') {
                    // A typed angle turns around the WORLD axis, the same turn the mouse makes (it used to add
                    // the number to one Euler component, which is a world turn only for X: R Z 90 on a tilted
                    // lamp went somewhere else than R Z by mouse). No axis = around the view axis (Blender).
                    const axisVec = typedRotateAxis(camera, session.axis)
                    e.rot = rotateEulerAroundWorldAxis(e.base.rot, axisVec, total)
                    if (n > 1) e.pos = orbitAroundPivot(e.base.pos, pivot, axisVec, total)
                }
            }
        }

        // Typed exact values (Blender-style): degrees for rotate, a scale
        // factor for scale, world units for translate. Mouse movement resumes
        // control and discards the typed string. R and S take a number with no
        // axis too (R 90 turns around the view, S 2 doubles); G still wants an
        // axis first (G X 2), since a free grab has no one direction to type.
        const applyNumericIfAny = () => {
            const value = parseFloat(session.numeric)
            if (!Number.isFinite(value)) return
            const total = session.mode === 'rotate'
                ? value * Math.PI / 180
                : session.mode === 'scale' ? value - 1 : value
            session.total = total
            applyTotal(total)
            session.moved = true
            cbRef.current.onPreview?.(buildPreviewMap())
        }

        // Blender: the drag follows the cursor from where it is — the first move only takes the start.
        const applyDrag = (snap, fine = false) => {
            const step = snapStepFor(session.mode, fine)
            if (session.mode === 'translate') {
                const c = constrainDelta(session.delta, session.axis)
                const d = snap ? snapVector(c, step) : c
                for (const e of session.entities) e.pos = [e.base.pos[0] + d.x, e.base.pos[1] + d.y, e.base.pos[2] + d.z]
            } else if (session.mode === 'rotate') {
                const a = snap ? snapScalar(session.angle, step) : session.angle
                const axisVec = rotateAxis(camera, session.axis)
                for (const e of session.entities) {
                    e.rot = rotateEulerAroundWorldAxis(e.base.rot, axisVec, a)
                    if (n > 1) e.pos = orbitAroundPivot(e.base.pos, pivot, axisVec, a)
                }
            } else if (session.mode === 'scale') {
                const f = Math.max(0.01, snap ? snapScalar(session.factor, step) : session.factor)
                const indices = indicesOf(session.axis)
                for (const e of session.entities) {
                    for (const idx of indices) {
                        e.scale[idx] = Math.max(0.01, e.base.scale[idx] * f)
                        e.pos[idx] = pivot[idx] + (e.base.pos[idx] - pivot[idx]) * f
                    }
                }
            }
        }
        const handlePointerMove = (event) => {
            if (!camera) return
            const rect = canvasRect()
            const x = event.clientX, y = event.clientY
            const precision = event.shiftKey ? 0.1 : 1
            if (session.numeric) { session.numeric = ''; reportStatus() }
            if (!session.last) {
                const centre = pivotOnScreen(camera, rect, pivot)
                session.last = {
                    point: pointerOnPivotPlane(camera, rect, x, y, pivot),
                    angle: angleAround(centre, x, y),
                    dist: distanceFrom(centre, x, y),
                    centre,
                }
                return
            }
            const last = session.last
            if (session.mode === 'translate') {
                const next = pointerOnPivotPlane(camera, rect, x, y, pivot)
                if (!next || !last.point) return
                // the FREE move; the constraint applies to the whole of it (applyDrag), so an X pressed mid-move
                // puts the whole move on X, as Blender does
                session.delta.add(grabStep(last.point, next, null, precision))
                last.point = next
            } else if (session.mode === 'rotate') {
                const a = angleAround(last.centre, x, y)
                session.angle += wrapAngle(a - last.angle) * precision
                last.angle = a
            } else if (session.mode === 'scale') {
                const d = distanceFrom(last.centre, x, y)
                session.factor *= scaleStep(last.dist, d, precision)
                last.dist = d
            }
            applyDrag(event.ctrlKey || event.metaKey, event.shiftKey)
            session.moved = true
            cbRef.current.onPreview?.(buildPreviewMap())
        }

        const handleKeyDown = (event) => {
            const lower = event.key?.toLowerCase?.()
            if (lower === 'x' || lower === 'y' || lower === 'z' || lower === 'a') {
                event.preventDefault(); event.stopImmediatePropagation()
                // Shift+X/Y/Z: the plane that leaves that axis out (Blender's axis locking)
                const next = lower === 'a' ? 'all' : event.shiftKey ? PLANE_OF_KEY[lower] : lower
                session.axis = session.axis === next ? null : next
                // Blender: the constraint takes the WHOLE move from where it started — G, a free move, then X puts the
                // object back on the X line through its start. Nothing is re-based here (the Studio walk 2026-10-13,
                // PR #921, found G then X kept the Y part of the free move).
                if (session.numeric && (session.axis || session.mode !== 'translate')) applyNumericIfAny()
                else {
                    session.numeric = ''
                    if (session.moved) { applyDrag(false); cbRef.current.onPreview?.(buildPreviewMap()) }
                }
                reportStatus()
            } else if (lower === 'g' || lower === 'r' || lower === 's') {
                event.preventDefault(); event.stopImmediatePropagation()
                commitIfMoved()
                session.mode = lower === 'g' ? 'translate' : lower === 'r' ? 'rotate' : 'scale'
                session.axis = null
                rebase()
                reportStatus()
            } else if ((session.axis || session.mode !== 'translate') && (/^[0-9.-]$/.test(event.key) || event.key === 'Backspace')) {
                event.preventDefault(); event.stopImmediatePropagation()
                session.numeric = event.key === 'Backspace'
                    ? session.numeric.slice(0, -1)
                    : `${session.numeric}${event.key}`
                applyNumericIfAny()
                reportStatus()
            } else if (event.key === 'Escape') {
                event.preventDefault(); event.stopImmediatePropagation()
                revertToBase()
                finish()
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault(); event.stopImmediatePropagation()
                finish()
            }
        }

        const handlePointerDown = (event) => {
            event.preventDefault()
            event.stopImmediatePropagation()
            finish()
        }

        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('keydown', handleKeyDown, true)
        window.addEventListener('pointerdown', handlePointerDown, true)
        reportStatus()

        return () => {
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('keydown', handleKeyDown, true)
            window.removeEventListener('pointerdown', handlePointerDown, true)
            commitIfMoved()
            if (controls) controls.enabled = true
            setHudLines([])
            cbRef.current.onStatus?.(null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [op?.seq])

    // Unmount only (NOT on an op.seq change, which would cancel the new op):
    // a session still open here means we were unmounted without finish() —
    // StudioSceneContent drops us as soon as the selection empties, which a
    // collaborator's delete or a remote document replace can do mid-modal.
    // Without this, transformOp stays set forever upstream and every keyboard
    // shortcut plus the drag gizmo is dead until a full remount.
    useEffect(() => () => {
        if (!sessionRef.current) return
        sessionRef.current = null
        cbRef.current.onCancel?.()
    }, [])

    return (
        <>
            {hudLines.length > 0 && (
                <group renderOrder={999}>
                    {hudLines.map((line) => (
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
            )}
        </>
    )
}
