import { useEffect, useRef, useState } from 'react'
import { Line } from '@react-three/drei'
import { Vector3 } from 'three'

const AXIS_INDEX = { x: 0, y: 1, z: 2 }
const ALL_INDICES = [0, 1, 2]
const AXIS_VEC = {
    x: new Vector3(1, 0, 0),
    y: new Vector3(0, 1, 0),
    z: new Vector3(0, 0, 1),
}
const AXIS_COLOR = { x: '#ff5a6a', y: '#7dd35f', z: '#5a8bff' }
const LINE_LEN = 1000
const MODE_LABEL = { translate: 'GRAB', rotate: 'ROTATE', scale: 'SCALE' }
// Ctrl-held snap increments (Blender-style): world units / radians (15°) /
// scale-factor steps. Snapping rounds the accumulated total, so tapping Ctrl
// mid-drag snaps the current result instead of just future movement.
const SNAP_STEP = { translate: 0.5, rotate: Math.PI / 12, scale: 0.1 }
const snapTo = (value, step) => Math.round(value / step) * step

/**
 * V1-parity modal transform. G/R/S sets the mode, X/Y/Z locks the axis, then
 * moving the mouse applies (movementX+movementY)*sensitivity to that axis on
 * every selected entity independently (no shared pivot). Escape/Enter/Space
 * confirms; whatever moved stays. Colored axis line + HUD text give feedback.
 */
export default function ModalTransform({ op, selectedEntities, controlsRef, onPreview, onCommit, onCancel, onStatus }) {
    const sessionRef = useRef(null)
    const cbRef = useRef({})
    cbRef.current = { onPreview, onCommit, onCancel, onStatus }
    const [hudLines, setHudLines] = useState([])

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

        const session = { mode: op.mode, axis: op.axis || null, entities, moved: false, total: 0, numeric: '' }
        sessionRef.current = session

        // Fold the current values into the base so a mode/axis switch continues
        // from where the drag left off instead of re-deriving from the start.
        const rebase = () => {
            for (const e of session.entities) {
                e.base = { pos: [...e.pos], rot: [...e.rot], scale: [...e.scale] }
            }
            pivot = computePivot()
            session.total = 0
            session.numeric = ''
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
                ? ` · ${session.axis === 'all' ? 'ALL' : session.axis.toUpperCase()}`
                : ''
            const typed = session.numeric
                ? ` · ${session.numeric}${session.mode === 'rotate' ? '°' : session.mode === 'scale' ? '×' : ''}`
                : ''
            const hint = session.axis ? ' · move mouse or type a value · CTRL snap · ENTER' : ' · pick X / Y / Z / A'
            cbRef.current.onStatus?.({
                text: `${MODE_LABEL[session.mode] || session.mode}${axisLabel}${typed}${typed ? ' · ENTER' : hint}`
            })
            if (session.axis && session.axis !== 'all') {
                const u = AXIS_VEC[session.axis]
                setHudLines([{
                    axis: session.axis,
                    points: [
                        [pivot[0] - u.x * LINE_LEN, pivot[1] - u.y * LINE_LEN, pivot[2] - u.z * LINE_LEN],
                        [pivot[0] + u.x * LINE_LEN, pivot[1] + u.y * LINE_LEN, pivot[2] + u.z * LINE_LEN],
                    ]
                }])
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
            const indices = session.axis === 'all' ? ALL_INDICES : [AXIS_INDEX[session.axis]]
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
                    for (const idx of indices) e.rot[idx] = e.base.rot[idx] + total
                    // Orbit positions around the pivot only for a single locked
                    // axis — 'all' has no meaningful orbit axis.
                    if (session.axis !== 'all' && n > 1) {
                        const v = new Vector3(
                            e.base.pos[0] - pivot[0],
                            e.base.pos[1] - pivot[1],
                            e.base.pos[2] - pivot[2]
                        ).applyAxisAngle(AXIS_VEC[session.axis], total)
                        e.pos = [pivot[0] + v.x, pivot[1] + v.y, pivot[2] + v.z]
                    }
                }
            }
        }

        // Typed exact values (Blender-style): degrees for rotate, a scale
        // factor for scale, world units for translate. Mouse movement resumes
        // control and discards the typed string.
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

        const handlePointerMove = (event) => {
            if (!session.axis) return
            if (session.numeric) {
                session.numeric = ''
                reportStatus()
            }
            const sensitivity = event.shiftKey ? 0.002 : 0.02
            const delta = ((event.movementX || 0) + (event.movementY || 0)) * sensitivity
            if (delta === 0) return
            session.total += delta
            const effective = event.ctrlKey || event.metaKey
                ? snapTo(session.total, SNAP_STEP[session.mode])
                : session.total
            applyTotal(effective)
            session.moved = true
            cbRef.current.onPreview?.(buildPreviewMap())
        }

        const handleKeyDown = (event) => {
            const lower = event.key?.toLowerCase?.()
            if (lower === 'x' || lower === 'y' || lower === 'z' || lower === 'a') {
                event.preventDefault(); event.stopImmediatePropagation()
                const next = lower === 'a' ? 'all' : lower
                session.axis = session.axis === next ? null : next
                rebase()
                reportStatus()
            } else if (lower === 'g' || lower === 'r' || lower === 's') {
                event.preventDefault(); event.stopImmediatePropagation()
                commitIfMoved()
                session.mode = lower === 'g' ? 'translate' : lower === 'r' ? 'rotate' : 'scale'
                session.axis = null
                rebase()
                reportStatus()
            } else if (session.axis && (/^[0-9.-]$/.test(event.key) || event.key === 'Backspace')) {
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
