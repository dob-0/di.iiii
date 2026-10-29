// Blender's Select Box tool in Studio (owner 2026-10-12: "in edit mode we need a select mode
// where you can select many fixtures at once like in Blender").
//
// With the tool on (the Tools row's "Select", in Edit), or for ONE drag after B from any mode:
// a left drag draws a dashed rectangle; on release every pickable object (shown, not locked)
// whose ORIGIN projects inside is selected — Blender's object-mode box tests the origin too.
// Shift+drag adds, Ctrl+drag removes. A drag that grabs the gizmo stays a gizmo move; a plain
// click stays a click (R3F's onClick picks, as before). While the tool is on, the left button
// never orbits; the middle button is the navigation's own (Blender: orbit, Shift pans, Ctrl zooms —
// chosen per gesture by useCameraNavigation.js, never overwritten here; owner 2026-10-13: "in Select
// Shift+move does not work" was this file forcing orbit on every middle press), the wheel zooms.
// Pure parts: ../utils/selectionTools.js.
import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CC_ACTION } from '../navigation/mappings.js'
import { isTypingTarget } from '../utils/editKeys.js'
import { letterKeyIsOff } from '../utils/studioKeyPrefs.js'
import { boxModeFor, isPickableEntity, mergeSelection, normalizeRect, pickInRect } from '../utils/selectionTools.js'
import { pullInProgress } from '../navigation/pullToMove.js'

const DRAG_START_PX = 4

// The authored origin of every entity in world space (parent groups composed), from the
// document — the same place the outliner and the Inspector call its position.
function worldOrigins(entities = []) {
    const byId = new Map((entities || []).map((entity) => [entity.id, entity]))
    const cache = new Map()
    const local = (entity) => {
        const t = entity.components?.transform || {}
        const m = new THREE.Matrix4()
        m.compose(
            new THREE.Vector3(...(t.position || [0, 0, 0])),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...(t.rotation || [0, 0, 0]))),
            new THREE.Vector3(...(t.scale || [1, 1, 1]))
        )
        return m
    }
    const world = (entity, depth = 0) => {
        if (cache.has(entity.id)) return cache.get(entity.id)
        const parent = entity.parentId ? byId.get(entity.parentId) : null
        const m = parent && depth < 32 ? world(parent, depth + 1).clone().multiply(local(entity)) : local(entity)
        cache.set(entity.id, m)
        return m
    }
    return (entities || []).map((entity) => ({ id: entity.id, entity, origin: new THREE.Vector3().setFromMatrixPosition(world(entity)) }))
}

export default function BoxSelect({ active = false, entities = [], selectedEntityIds = [], onSelectEntities, controlsRef }) {
    const { camera, gl } = useThree()
    const live = useRef({})
    useEffect(() => { live.current = { active, entities, selectedEntityIds, onSelectEntities, camera } })

    // The crosshair says the tool is on.
    useEffect(() => {
        const canvas = gl.domElement
        // Read by the measurement script and by anyone inspecting the page.
        canvas.dataset.boxSelect = active ? 'on' : 'off'
        if (!active) return undefined
        canvas.style.cursor = 'crosshair'
        return () => { canvas.style.cursor = '' }
    }, [active, gl])

    useEffect(() => {
        const canvas = gl.domElement
        const host = canvas.parentElement || canvas
        let armed = false // B: one box from any mode
        let start = null
        let dragging = false
        let box = null
        let restore = null
        let swallowClickUntil = 0

        const cc = () => controlsRef?.current || null
        const setButtons = (patch) => {
            const controls = cc()
            if (!controls?.mouseButtons) return
            const before = {}
            for (const key of Object.keys(patch)) before[key] = controls.mouseButtons[key]
            Object.assign(controls.mouseButtons, patch)
            const previous = restore
            restore = () => { previous?.(); Object.assign(controls.mouseButtons, before) }
        }
        const restoreButtons = () => { const fn = restore; restore = null; fn?.() }
        const removeBox = () => { box?.remove(); box = null }
        const end = () => {
            start = null
            dragging = false
            removeBox()
            restoreButtons()
            if (!live.current.active) canvas.style.cursor = ''
        }

        // Bubble phase on the canvas's host: runs after useCameraNavigation's capture handler
        // (which writes this gesture's binding) and after TransformControls' own pointerdown.
        // camera-controls reads mouseButtons on every pointermove, so NONE here holds the orbit.
        const onPointerDown = (event) => {
            if (event.pointerType === 'touch') return
            const { active: on } = live.current
            if (event.button !== 0 || event.altKey) return
            if (!on && !armed) return
            // Edit (View | Edit): the press already started a pull on the selected thing (pullToMove.js), so it draws no box.
            if (pullInProgress()) return
            start = { x: event.clientX, y: event.clientY, mode: boxModeFor(event) }
            dragging = false
            setButtons({ left: CC_ACTION.NONE })
        }

        const onPointerMove = (event) => {
            if (!start) return
            if (!dragging) {
                if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_START_PX) return
                // The gizmo took this drag (it switches the camera controls off while it drags).
                if (cc() && cc().enabled === false) { end(); armed = false; return }
                dragging = true
                box = window.document.createElement('div')
                box.className = 'studio-box-select'
                box.setAttribute('data-testid', 'studio-box-select')
                window.document.body.appendChild(box)
            }
            const r = normalizeRect(start, { x: event.clientX, y: event.clientY })
            Object.assign(box.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.right - r.left}px`, height: `${r.bottom - r.top}px` })
        }

        const onPointerUp = (event) => {
            if (!start) { restoreButtons(); return }
            if (dragging) {
                const { entities: list, selectedEntityIds: current, onSelectEntities: select, camera: cam } = live.current
                const rect = normalizeRect(start, { x: event.clientX, y: event.clientY })
                const bounds = canvas.getBoundingClientRect()
                const points = worldOrigins(list)
                    .filter(({ entity }) => isPickableEntity(entity))
                    .map(({ id, origin }) => {
                        const v = origin.clone().project(cam)
                        return {
                            id,
                            x: bounds.left + (v.x + 1) / 2 * bounds.width,
                            y: bounds.top + (1 - v.y) / 2 * bounds.height,
                            inFront: v.z > -1 && v.z < 1
                        }
                    })
                const hits = pickInRect(points, rect)
                select?.(mergeSelection(current, hits, start.mode))
                // The click that follows this release is the box's, not a pick or a miss.
                swallowClickUntil = performance.now() + 400
            }
            // B arms ONE box: a drag draws it, and a click without a drag ends it too (as
            // Blender's does). Left armed, the next left drag — minutes later, in
            // Navigate — drew a box instead of orbiting (N581, 2026-10-15).
            armed = false
            end()
        }

        const onClickCapture = (event) => {
            if (performance.now() > swallowClickUntil) return
            swallowClickUntil = 0
            event.stopPropagation()
            event.preventDefault()
        }

        const onKeyDown = (event) => {
            if (isTypingTarget(event.target)) return
            if (event.key === 'Escape' && (start || armed)) {
                armed = false
                end()
                return
            }
            const isB = event.code === 'KeyB' || String(event.key).toLowerCase() === 'b'
            if (isB && !letterKeyIsOff(event) && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
                armed = true
                canvas.style.cursor = 'crosshair'
            }
        }

        host.addEventListener('pointerdown', onPointerDown)
        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('click', onClickCapture, true)
        window.addEventListener('keydown', onKeyDown)
        return () => {
            host.removeEventListener('pointerdown', onPointerDown)
            window.removeEventListener('pointermove', onPointerMove)
            window.removeEventListener('pointerup', onPointerUp)
            window.removeEventListener('click', onClickCapture, true)
            window.removeEventListener('keydown', onKeyDown)
            end()
        }
    }, [gl, controlsRef])

    return null
}
