import MultiSelectionControls from '../MultiSelectionControls.jsx'
import SelectableObject from '../SelectableObject.jsx'
import { Grid, Plane } from '@react-three/drei'

export default function SceneBase({
    objects,
    selectedObjectId,
    selectedObjectIds,
    isGridVisible,
    gridSize,
    gridAppearance,
    isGizmoVisible,
    isArMode,
    clearSelection,
    setMenu,
    selectObject,
    ambientLight,
    directionalLight
}) {
    const hasMultiSelection = selectedObjectIds.length > 1

    return (
        <group>
            {isGridVisible && (
                <Grid
                    args={[gridSize, gridSize]}
                    infiniteGrid={false}
                    position={[0, -(gridAppearance?.offset ?? 0.015), 0]}
                    cellSize={gridAppearance?.cellSize ?? 0.75}
                    cellThickness={gridAppearance?.cellThickness ?? 0.35}
                    sectionSize={gridAppearance?.sectionSize ?? 6}
                    sectionThickness={gridAppearance?.sectionThickness ?? 0.6}
                    fadeDistance={(gridAppearance?.fadeStrength ?? 0) > 0 ? (gridAppearance?.fadeDistance ?? 20) : 0}
                    fadeStrength={gridAppearance?.fadeStrength ?? 0}
                    sectionColor="#6a6a6a"
                    color="#909090"
                />
            )}

            <Plane
                args={[gridSize, gridSize]}
                position={[0, gridAppearance?.offset ?? 0.01, 0]}
                rotation-x={-Math.PI / 2}
                material-transparent
                material-opacity={0}
                material-color="#000000"
                onPointerDown={(event) => {
                    if (event.button === 0 && (!isGizmoVisible || selectedObjectIds.length === 0)) {
                        clearSelection()
                    }
                }}
                onDoubleClick={(event) => {
                    if (isArMode) return
                    event.stopPropagation()
                    setMenu({
                        visible: true,
                        x: event.clientX,
                        y: event.clientY,
                        position3D: event.point
                    })
                }}
            />

            {objects.map((obj) => {
                const isSelected = selectedObjectIds.includes(obj.id)
                const isPrimarySelected = selectedObjectId === obj.id
                return (
                    <SelectableObject
                        key={obj.id}
                        obj={obj}
                        isSelected={isSelected}
                        isPrimarySelected={isPrimarySelected}
                        isMultiSelected={isSelected}
                        isMultiSelectMode={hasMultiSelection}
                        onSelect={selectObject}
                    />
                )
            })}

            <MultiSelectionControls />

            <ambientLight color={ambientLight.color} intensity={ambientLight.intensity} />
            <directionalLight
                position={directionalLight.position}
                color={directionalLight.color}
                intensity={directionalLight.intensity}
            />
        </group>
    )
}
