import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { XR } from '@react-three/xr'
import * as THREE from 'three'
import Experience from '../Experience.jsx'

export default function SceneCanvas({
    cameraSettings,
    cameraPosition,
    renderSettings,
    rendererRef,
    isGizmoVisible,
    selectedObjectIds,
    isPointerDragging,
    clearSelection,
    xrStore
}) {
    const handlePointerMissed = (event) => {
        if (isGizmoVisible && selectedObjectIds.length > 0) {
            return
        }
        if (isPointerDragging) return
        if (typeof event?.button === 'number' && event.button !== 0) {
            return
        }
        clearSelection()
    }

    const cameraProps = { ...cameraSettings, position: cameraPosition }

    return (
        <Canvas
            orthographic={cameraSettings?.orthographic}
            camera={cameraProps}
            dpr={renderSettings.dpr}
            shadows={renderSettings.shadows}
            gl={{
                antialias: renderSettings.antialias,
                powerPreference: renderSettings.powerPreference
            }}
            onCreated={({ gl }) => {
                if (rendererRef) {
                    rendererRef.current = gl
                }
                // Avoid Three warnings about resizing while an XR session is presenting.
                const originalSetSize = gl.setSize.bind(gl)
                const originalSetPixelRatio = gl.setPixelRatio.bind(gl)
                gl.setSize = (w, h, updateStyle) => {
                    if (gl.xr?.isPresenting) return
                    originalSetSize(w, h, updateStyle)
                }
                gl.setPixelRatio = (v) => {
                    if (gl.xr?.isPresenting) return
                    originalSetPixelRatio(v)
                }

                gl.outputColorSpace = THREE.SRGBColorSpace
                gl.toneMapping = renderSettings.toneMapping === 'None'
                    ? THREE.NoToneMapping
                    : THREE.ACESFilmicToneMapping
                gl.toneMappingExposure = renderSettings.toneMappingExposure ?? 1
                gl.shadowMap.enabled = !!renderSettings.shadows
                gl.shadowMap.type = renderSettings.shadowType ?? THREE.PCFSoftShadowMap
            }}
            onContextMenu={(event) => event.preventDefault()}
            onPointerMissed={handlePointerMissed}
        >
            <XR store={xrStore}>
                <Suspense fallback={null}>
                    <Experience />
                </Suspense>
            </XR>
        </Canvas>
    )
}
