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
                pos: [...(t.position || [0, 0, 0])],
                rot: [...(t.rotation || [0, 0, 0])],
                scale: [...(t.scale || [1, 1, 1])]
            }
        })

        const n = entities.length
        const pivot = entities.reduce(
            (acc, e) => [acc[0] + e.pos[0] / n, acc[1] + e.pos[1] / n, acc[2] + e.pos[2] / n],
            [0, 0, 0]
        )

        const session = { mode: op.mode, axis: op.axis || null, entities, moved: false }
        sessionRef.current = session

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
            const hint = session.axis ? ' · move mouse · ENTER' : ' · pick X / Y / Z / A'
            cbRef.current.onStatus?.({
                text: `${MODE_LABEL[session.mode] || session.mode}${axisLabel}${hint}`
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

        const finish = () => {
            commitIfMoved()
            if (controls) controls.enabled = true
            setHudLines([])
            cbRef.current.onStatus?.(null)
            sessionRef.current = null
            cbRef.current.onCancel?.()
        }

        const handlePointerMove = (event) => {
            if (!session.axis) return
            const indices = session.axis === 'all' ? ALL_INDICES : [AXIS_INDEX[session.axis]]
            const sensitivity = event.shiftKey ? 0.002 : 0.02
            const delta = ((event.movementX || 0) + (event.movementY || 0)) * sensitivity
            if (delta === 0) return
            for (const e of session.entities) {
                for (const idx of indices) {
                    if (session.mode === 'translate') {
                        e.pos[idx] += delta
                    } else if (session.mode === 'scale') {
                        e.scale[idx] = Math.max(0.01, e.scale[idx] + delta)
                    } else if (session.mode === 'rotate') {
                        e.rot[idx] += delta
                    }
                }
            }
            session.moved = true
            cbRef.current.onPreview?.(buildPreviewMap())
        }

        const handleKeyDown = (event) => {
            const lower = event.key?.toLowerCase?.()
            if (lower === 'x' || lower === 'y' || lower === 'z' || lower === 'a') {
                event.preventDefault(); event.stopImmediatePropagation()
                const next = lower === 'a' ? 'all' : lower
                session.axis = session.axis === next ? null : next
                reportStatus()
            } else if (lower === 'g' || lower === 'r' || lower === 's') {
                event.preventDefault(); event.stopImmediatePropagation()
                commitIfMoved()
                session.mode = lower === 'g' ? 'translate' : lower === 'r' ? 'rotate' : 'scale'
                session.axis = null
                reportStatus()
            } else if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
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
