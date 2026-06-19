import { useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { Euler, Quaternion, Vector3 } from 'three'

const AXIS_VEC = {
    x: new Vector3(1, 0, 0),
    y: new Vector3(0, 1, 0),
    z: new Vector3(0, 0, 1)
}
const AXIS_COLOR = { x: '#ff5a6a', y: '#7dd35f', z: '#5a8bff' }
const AXIS_LABEL = { x: 'X', y: 'Y', z: 'Z' }
const LINE_LEN = 1000

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
 * Selecting G/R/S arms the operation immediately with no effect on the
 * selection; X/Y/Z constrain to a global axis (press again → local, again →
 * free); type a number for an exact value; Enter / Space confirm; Esc /
 * right-click cancel. There is no mouse-driven preview — the transform only
 * changes once a number is typed.
 */
export default function ModalTransform({ op, selectedEntities, primaryId, controlsRef, onPreview, onCommit, onCancel, onStatus }) {
    const { camera } = useThree()
    const sessionRef = useRef(null)
    const [hud, setHud] = useState(null)
    const cbRef = useRef({})
    cbRef.current = { onPreview, onCommit, onCancel, onStatus }

    useEffect(() => {
        if (!op || !selectedEntities?.length) return undefined

        const controls = controlsRef?.current
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
            numeric: '',
            pivot,
            entities,
            primaryQuat,
            preview: null,
            active: false
        }
        sessionRef.current = session

        const axisUnit = (axis) => {
            const base = AXIS_VEC[axis].clone()
            if (session.space === 'local') base.applyQuaternion(primaryQuat).normalize()
            return base
        }

        const compute = () => {
            const map = {}
            const lines = []

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
            const numTag = session.numeric !== '' ? `  ⌨ ${session.numeric}` : ''

            if (session.mode === 'translate') {
                const axis = session.axis || 'x'
                const delta = axisUnit(axis).multiplyScalar(numericVal)
                if (session.axis) pushAxisLine(axis)
                for (const e of session.entities) {
                    map[e.id] = {
                        position: [e.pos[0] + delta.x, e.pos[1] + delta.y, e.pos[2] + delta.z],
                        rotation: e.rot,
                        scale: e.scale
                    }
                }
                text = `Move ${session.axis ? AXIS_LABEL[axis] : ''}${spaceTag}: ${fmt(numericVal)}` + numTag
            } else if (session.mode === 'rotate') {
                const axisVec = session.axis ? axisUnit(session.axis) : axisOut
                const angle = (numericVal * Math.PI) / 180
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
                text = `Rotate${axisLabel}: ${fmt(numericVal)}°` + numTag
            } else { // scale
                const factor = session.numeric === '' ? 1 : numericVal
                const axisActive = (ax) => (session.axis ? ax === session.axis : true)
                const fx = axisActive('x') ? factor : 1
                const fy = axisActive('y') ? factor : 1
                const fz = axisActive('z') ? factor : 1
                if (session.axis) pushAxisLine(session.axis)
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
                const axisLabel = session.axis ? ` ${AXIS_LABEL[session.axis]}` : ''
                text = `Scale${axisLabel}: ${fmt(factor)}` + numTag
            }

            return { map, hud: { text, lines, pivot: [pivot.x, pivot.y, pivot.z] } }
        }

        const preview = () => {
            if (!session.active) return
            const result = compute()
            session.preview = result.map
            cbRef.current.onPreview?.(result.map)
            cbRef.current.onStatus?.({ text: result.hud.text, active: true })
            setHud(result.hud)
        }

        const activate = () => {
            if (session.active) return
            session.active = true
            if (controls) controls.enabled = false
            preview()
        }

        const finish = (commit) => {
            if (controls) controls.enabled = true
            const wasChanged = session.numeric !== ''
            sessionRef.current = null
            setHud(null)
            cbRef.current.onStatus?.(null)
            if (commit && wasChanged && session.preview) {
                cbRef.current.onCommit?.(
                    Object.entries(session.preview).map(([id, transform]) => ({ id, transform }))
                )
            } else {
                cbRef.current.onCancel?.()
            }
        }

        const cycleAxis = (axis) => {
            if (session.axis !== axis) {
                session.axis = axis
                session.space = 'global'
            } else if (session.space === 'global') {
                session.space = 'local'
            } else {
                session.axis = null
                session.space = 'global'
            }
        }

        const handleKeyDown = (event) => {
            const key = event.key
            const lower = key?.toLowerCase?.()

            if (!session.active) activate()

            if (lower === 'x' || lower === 'y' || lower === 'z') {
                event.preventDefault(); event.stopImmediatePropagation()
                cycleAxis(lower)
                preview()
            } else if (lower === 'g' || lower === 'r' || lower === 's') {
                event.preventDefault(); event.stopImmediatePropagation()
                session.mode = lower === 'g' ? 'translate' : lower === 'r' ? 'rotate' : 'scale'
                session.numeric = ''
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
            }
        }
        const handlePointerDown = (event) => {
            event.preventDefault(); event.stopImmediatePropagation()
            finish(event.button !== 2)
        }
        const handleContextMenu = (event) => {
            event.preventDefault()
            finish(false)
        }

        activate()

        window.addEventListener('keydown', handleKeyDown, true)
        window.addEventListener('pointerdown', handlePointerDown, true)
        window.addEventListener('contextmenu', handleContextMenu)
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true)
            window.removeEventListener('pointerdown', handlePointerDown, true)
            window.removeEventListener('contextmenu', handleContextMenu)
            if (controls) controls.enabled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [op?.seq])

    return (
        <>
            {hud?.lines?.length > 0 && (
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
            )}
        </>
    )
}
