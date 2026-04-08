import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { Perf } from 'r3f-perf'
import { useContext } from 'react'
import { SceneContext, UiContext, SceneSettingsContext, ActionsContext, RefsContext } from './contexts/AppContexts.js'
import SceneBase from './components/SceneBase.jsx'

export default function Experience() {
    const { objects, selectedObjectId, selectedObjectIds, clearSelection } = useContext(SceneContext)
    const { setMenu, isPerfVisible, isGridVisible, isGizmoVisible, isPointerDragging, interactionMode } = useContext(UiContext)
    const { backgroundColor, gridSize, gridAppearance, ambientLight, directionalLight, presentationMode } = useContext(SceneSettingsContext)
    const { controlsRef } = useContext(RefsContext)
    const { selectObject } = useContext(ActionsContext)
    const { gl, camera } = useThree()
    const controlsEnabled = !isPointerDragging && presentationMode !== 'fixed-camera'

    const orbitMouseButtons = interactionMode === 'edit'
        ? {
            LEFT: null,
            MIDDLE: THREE.MOUSE.ROTATE,
            RIGHT: THREE.MOUSE.PAN
        }
        : {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        }

    const orbitTouches = interactionMode === 'edit'
        ? {
            ONE: THREE.TOUCH.PAN,
            TWO: THREE.TOUCH.DOLLY_ROTATE
        }
        : {
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN
        }

    return (
        <>
            {isPerfVisible && <Perf position="top-left" />}

            {camera && gl?.domElement && (
                <OrbitControls
                    ref={controlsRef}
                    enabled={controlsEnabled}
                    enableDamping
                    dampingFactor={0.08}
                    enableRotate
                    enablePan
                    enableZoom
                    zoomToCursor
                    screenSpacePanning
                    rotateSpeed={0.85}
                    panSpeed={0.9}
                    zoomSpeed={0.9}
                    minDistance={0.35}
                    maxDistance={250}
                    mouseButtons={orbitMouseButtons}
                    touches={orbitTouches}
                />
            )}

            <color args={[backgroundColor]} attach="background" />

            <SceneBase
                objects={objects}
                selectedObjectId={selectedObjectId}
                selectedObjectIds={selectedObjectIds}
                isGridVisible={isGridVisible}
                gridSize={gridSize}
                gridAppearance={gridAppearance}
                isGizmoVisible={isGizmoVisible}
                isArMode={false}
                clearSelection={clearSelection}
                setMenu={setMenu}
                selectObject={selectObject}
                ambientLight={ambientLight}
                directionalLight={directionalLight}
            />
        </>
    )
}
