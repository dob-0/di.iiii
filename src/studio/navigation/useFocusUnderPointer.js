// Focus on the thing under the pointer, without selecting it: press F with nothing
// selected and the pointer over a thing — the view flies to it and turns around it
// from then on (navigation/focus.js says where). With a selection F still frames
// the selection, and with the pointer over nothing it still frames the whole room
// (StudioEditor's own F). Double-click is not used: it opens Quick Insert.
import { useEffect, useRef } from 'react'
import { Box3 } from 'three'
import { clientToNdc, pickHit } from './autoDepth.js'
import { focusPose } from './focus.js'
import { entityRoots } from './useCameraNavigation.js'

const isTyping = (target) => {
    const tag = target?.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true
}

export function useFocusUnderPointer({ controlsRef, getScene, selectedEntityIds = null, active = true }) {
    const selectionRef = useRef(selectedEntityIds)
    useEffect(() => { selectionRef.current = selectedEntityIds }, [selectedEntityIds])
    useEffect(() => {
        const cc = controlsRef.current
        if (!active || !cc) return undefined
        const element = cc._domElement
        const doc = element?.ownerDocument
        if (!element || !doc) return undefined

        // Where the pointer last was, if it is over the viewport.
        const pointer = { x: 0, y: 0, over: false }
        const onMove = (event) => {
            pointer.x = event.clientX
            pointer.y = event.clientY
            pointer.over = event.target === element || element.contains(event.target)
        }
        const onKey = (event) => {
            if (event.key !== 'f' && event.key !== 'F') return
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.repeat) return
            if (isTyping(event.target) || event.target?.closest?.('[role="dialog"]')) return
            if (selectionRef.current?.length || !pointer.over) return
            const scene = getScene?.()
            const ndc = clientToNdc(pointer.x, pointer.y, element.getBoundingClientRect())
            if (!scene || !ndc) return
            const camera = cc.camera || cc._camera
            const hit = pickHit({ camera, ndc, objects: entityRoots(scene) })
            if (!hit) return // empty space: the editor's F frames the whole room
            event.preventDefault()
            event.stopImmediatePropagation() // the editor's F would frame the whole room
            const box = hit.root ? new Box3().setFromObject(hit.root, false) : null
            const pose = focusPose({
                camera: { position: camera.position, fov: camera.fov, aspect: camera.aspect },
                hit: hit.point,
                box,
            })
            cc.setLookAt(pose.position.x, pose.position.y, pose.position.z, pose.target.x, pose.target.y, pose.target.z, true)
        }
        doc.addEventListener('pointermove', onMove, { passive: true })
        doc.addEventListener('keydown', onKey, { capture: true })
        return () => {
            doc.removeEventListener('pointermove', onMove)
            doc.removeEventListener('keydown', onKey, { capture: true })
        }
    }, [active, controlsRef, getScene])
}
