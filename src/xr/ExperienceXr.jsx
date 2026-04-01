import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { XROrigin, useXR } from '@react-three/xr'
import { Perf } from 'r3f-perf'
import { useContext } from 'react'
import { SceneContext, UiContext, SceneSettingsContext, ActionsContext, RefsContext } from '../contexts/AppContexts.js'
import SceneBase from '../components/SceneBase.jsx'

const AR_SCENE_POSITION = [0, 0, -1.2]
const DEFAULT_SCENE_POSITION = [0, 0, 0]

export default function ExperienceXr() {
    const { objects, selectedObjectId, selectedObjectIds, clearSelection } = useContext(SceneContext)
    const { setMenu, isPerfVisible, isGridVisible, isGizmoVisible, isPointerDragging, interactionMode } = useContext(UiContext)
    const { backgroundColor, gridSize, gridAppearance, ambientLight, directionalLight } = useContext(SceneSettingsContext)
    const { controlsRef } = useContext(RefsContext)
    const { selectObject } = useContext(ActionsContext)
    const { gl, camera } = useThree()
    const isXrPresenting = useXR((state) => state.session != null)
    const isArMode = useXR((state) => state.mode === 'immersive-ar')

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

            <XROrigin />

            {!isXrPresenting && camera && gl?.domElement && (
                <OrbitControls
                    ref={controlsRef}
                    enabled={!isPointerDragging}
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

            <group position={isArMode ? AR_SCENE_POSITION : DEFAULT_SCENE_POSITION}>
                <SceneBase
                    objects={objects}
                    selectedObjectId={selectedObjectId}
                    selectedObjectIds={selectedObjectIds}
                    isGridVisible={isArMode ? false : isGridVisible}
                    gridSize={gridSize}
                    gridAppearance={gridAppearance}
                    isGizmoVisible={isGizmoVisible}
                    isArMode={isArMode}
                    clearSelection={clearSelection}
                    setMenu={setMenu}
                    selectObject={selectObject}
                    ambientLight={ambientLight}
                    directionalLight={directionalLight}
                />
            </group>
        </>
    )
}
