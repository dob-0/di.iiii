import { useCallback, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, TransformControls } from '@react-three/drei'
import GraphRoomNodes from '../../raw/components/GraphRoomNodes.jsx'
import { registerEntityObject } from '../utils/entityObjectRegistry.js'
import { GIZMO_SNAP, useSnapModifier } from '../utils/gizmoSnap.js'

// What Nodes made, in Studio's room (owner's decision 2026-10-02, "edit inside
// the Geo"). The bodies are Nodes' own (GraphRoomNodes → NodeVisual); this adds
// only what Studio's room adds to any object: the orange outline, the name
// pill, and the gizmo — the same TransformControls, snap and orbit hand-off
// SelectableEntity uses for an object.
//
// `graphRoom` comes from StudioEditor:
//   { scopeId, editable, selectedNodeId, onSelectNode, onCommitTransform }
// With no Geo open it is the top room and read-only (editable false): Studio
// shows the Geos and what stands in them, and its own objects stay the only
// things it edits. With a Geo open it is that Geo's inside, and editable.

function SelectedNodeChrome({ object, label, gizmoActive, gizmoMode, gizmoAxis, orbitRef, onCommit }) {
    const { scene } = useThree()
    const tcRef = useRef(null)
    const helperRef = useRef(null)
    const draggingRef = useRef(false)
    const snapping = useSnapModifier()
    const [pillAt, setPillAt] = useState(null)

    useEffect(() => {
        if (!object) return undefined
        const helper = new THREE.BoxHelper(object, 0xffa500)
        helper.material.depthTest = false
        helper.material.transparent = true
        helper.material.opacity = 0.95
        helper.renderOrder = 999
        helperRef.current = helper
        scene.add(helper)
        return () => {
            scene.remove(helper)
            helper.geometry?.dispose?.()
            helper.material?.dispose?.()
            helperRef.current = null
        }
    }, [object, scene])

    // The outline and the pill follow the object every frame: a node's values
    // can be wired to a clock, so it may move with nobody touching it.
    const box = useRef(new THREE.Box3())
    useFrame(() => {
        if (!object) return
        helperRef.current?.setFromObject(object)
        box.current.setFromObject(object)
        if (box.current.isEmpty()) return
        const top = [
            (box.current.min.x + box.current.max.x) / 2,
            box.current.max.y + 0.25,
            (box.current.min.z + box.current.max.z) / 2
        ]
        if (!pillAt || Math.abs(pillAt[0] - top[0]) + Math.abs(pillAt[1] - top[1]) + Math.abs(pillAt[2] - top[2]) > 1e-3) {
            setPillAt(top)
        }
    })

    useEffect(() => {
        const tc = tcRef.current
        if (!tc || !object || !gizmoActive) return undefined
        tc.attach(object)
        tc.setSpace('local')
        const orbit = orbitRef?.current
        const handleDraggingChanged = (event) => {
            draggingRef.current = event.value
            if (orbitRef?.current) orbitRef.current.enabled = !event.value
            if (!event.value) {
                onCommit?.({
                    position: object.position.toArray(),
                    rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
                    scale: object.scale.toArray()
                })
            }
        }
        tc.addEventListener('dragging-changed', handleDraggingChanged)
        return () => {
            tc.removeEventListener('dragging-changed', handleDraggingChanged)
            tc.detach()
            if (orbit) orbit.enabled = true
        }
    }, [object, gizmoActive, orbitRef, onCommit])

    return (
        <>
            {pillAt ? (
                <Html position={pillAt} center zIndexRange={[900, 0]}>
                    <span className="studio-selection-pill">{label}</span>
                </Html>
            ) : null}
            {gizmoActive && object ? (
                <TransformControls
                    ref={tcRef}
                    mode={gizmoMode}
                    showX={!gizmoAxis || gizmoAxis === 'x'}
                    showY={!gizmoAxis || gizmoAxis === 'y'}
                    showZ={!gizmoAxis || gizmoAxis === 'z'}
                    translationSnap={snapping ? GIZMO_SNAP.translation : null}
                    rotationSnap={snapping ? GIZMO_SNAP.rotation : null}
                    scaleSnap={snapping ? GIZMO_SNAP.scale : null}
                />
            ) : null}
        </>
    )
}

export default function StudioGraphNodes({
    document,
    graphRoom,
    editMode = 'navigate',
    gizmoMode = 'translate',
    gizmoAxis = null,
    gizmoVisible = true,
    orbitRef = null
}) {
    const groupsRef = useRef(new Map())
    const [selectedObject, setSelectedObject] = useState(null)
    const editable = Boolean(graphRoom?.editable)
    const selectedNodeId = editable ? (graphRoom?.selectedNodeId || null) : null

    const registerGroup = useCallback((nodeId, object) => {
        if (object) groupsRef.current.set(nodeId, object)
        else groupsRef.current.delete(nodeId)
    }, [])

    // Refs are set by the time effects run, so the selected node's group is
    // read here rather than from the ref callback (a state update from inside
    // a ref callback would re-render every frame).
    useEffect(() => {
        setSelectedObject(selectedNodeId ? (groupsRef.current.get(selectedNodeId) || null) : null)
    }, [selectedNodeId, document.nodes])

    // View Selected / View All frame a node the way they frame an object.
    useEffect(() => {
        if (!selectedNodeId || !selectedObject) return undefined
        return registerEntityObject(selectedNodeId, selectedObject)
    }, [selectedNodeId, selectedObject])

    const onCommitTransform = graphRoom?.onCommitTransform
    const handleCommit = useCallback((transform) => {
        if (selectedNodeId) onCommitTransform?.(selectedNodeId, transform)
    }, [selectedNodeId, onCommitTransform])

    if (!graphRoom) return null
    const selectedNode = selectedNodeId ? (document.nodes || []).find((node) => node.id === selectedNodeId) : null

    return (
        <>
            <GraphRoomNodes
                document={document}
                scopeId={graphRoom.scopeId || null}
                selectedNodeId={selectedNodeId}
                onSelectNode={editable ? graphRoom.onSelectNode : null}
                registerGroup={editable ? registerGroup : null}
            />
            {editable && selectedNode && selectedObject ? (
                <SelectedNodeChrome
                    object={selectedObject}
                    label={selectedNode.label}
                    gizmoActive={editMode === 'edit' && gizmoVisible}
                    gizmoMode={gizmoMode}
                    gizmoAxis={gizmoAxis}
                    orbitRef={orbitRef}
                    onCommit={handleCommit}
                />
            ) : null}
        </>
    )
}
