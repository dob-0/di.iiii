import { useMemo, useState } from 'react'

export function useSceneSettings({ defaultScene, defaultGridAppearance, perspectiveCameraSettings }) {
    const [cameraPosition, setCameraPosition] = useState(defaultScene.savedView.position)
    const [cameraTarget, setCameraTarget] = useState(defaultScene.savedView.target)
    const [cameraSettings, setCameraSettings] = useState(perspectiveCameraSettings)
    const [backgroundColor, setBackgroundColor] = useState(defaultScene.backgroundColor)
    const [gridSize, setGridSize] = useState(defaultScene.gridSize)
    const [ambientLight, setAmbientLight] = useState(defaultScene.ambientLight)
    const [directionalLight, setDirectionalLight] = useState(defaultScene.directionalLight)
    const [default3DView, setDefault3DView] = useState(defaultScene.default3DView)
    const [transformSnaps, setTransformSnaps] = useState(defaultScene.transformSnaps)
    const [gridAppearance, setGridAppearance] = useState(defaultGridAppearance)

    return useMemo(() => ({
        cameraPosition,
        setCameraPosition,
        cameraTarget,
        setCameraTarget,
        cameraSettings,
        setCameraSettings,
        backgroundColor,
        setBackgroundColor,
        gridSize,
        setGridSize,
        ambientLight,
        setAmbientLight,
        directionalLight,
        setDirectionalLight,
        default3DView,
        setDefault3DView,
        transformSnaps,
        setTransformSnaps,
        gridAppearance,
        setGridAppearance
    }), [
        cameraPosition,
        cameraTarget,
        cameraSettings,
        backgroundColor,
        gridSize,
        ambientLight,
        directionalLight,
        default3DView,
        transformSnaps,
        gridAppearance
    ])
}

export default useSceneSettings
