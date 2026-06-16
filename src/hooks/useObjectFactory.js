import { useCallback } from 'react'
import { generateObjectId } from '../state/sceneStore.js'
import { MODEL_FORMATS, detectModelFormatFromMeta } from '../utils/modelFormats.js'

export function useObjectFactory({ menuPosition3D, setMenu, setObjects, applySelection, socketEmit }) {
    const handleAddObject = useCallback((type, overrides = {}) => {
        const basePosition = overrides.position ?? menuPosition3D ?? { x: 0, y: 0, z: 0 }
        let payloadData = overrides.data ?? null
        let assetRef = overrides.assetRef ?? null
        setMenu(prev => ({ ...prev, visible: false }))

        if (type === 'text-3d' || type === 'text-2d') {
            payloadData = prompt('Enter your text:')
            if (!payloadData) return
        }

        const normalizedPosition = Array.isArray(basePosition)
            ? basePosition
            : [
                Math.round(basePosition.x ?? 0),
                Math.round(basePosition.y ?? 0),
                Math.round(basePosition.z ?? 0)
            ]

        const newObject = {
            id: generateObjectId(),
            type,
            data: payloadData,
            assetRef,
            position: [normalizedPosition[0], normalizedPosition[1] ?? 0, normalizedPosition[2]],
            rotation: overrides.rotation ?? [0, 0, 0],
            scale: overrides.scale ?? [1, 1, 1],
            color: (() => {
                if (overrides.color) return overrides.color
                if (type.includes('text')) return '#000000'
                if (type === 'audio') return '#800080'
                if (type === 'box') return '#0000ff'
                return '#ff0000'
            })(),
            isVisible: true,
            fontWeight: 'normal',
            fontStyle: 'normal',
            linkUrl: overrides.linkUrl ?? '',
            linkActive: overrides.linkActive ?? false
        }

        if (type === 'text-2d') {
            newObject.fontFamily = 'Arial'
        }
        if (type === 'text-3d') {
            newObject.fontSize3D = 0.5
            newObject.depth3D = 0.2
            newObject.bevelEnabled3D = true
            newObject.bevelThickness3D = 0.02
            newObject.bevelSize3D = 0.01
            newObject.font3D = 'helvetiker_regular'
        }
        if (type === 'box') {
            newObject.boxSize = overrides.boxSize || [1, 1, 1]
        }
        if (type === 'sphere') {
            newObject.sphereRadius = overrides.sphereRadius || 0.5
        }
        if (type === 'cone') {
            newObject.coneRadius = overrides.coneRadius || 0.5
            newObject.coneHeight = overrides.coneHeight || 1.5
        }
        if (type === 'cylinder') {
            newObject.cylinderRadiusTop = overrides.cylinderRadiusTop || 0.5
            newObject.cylinderRadiusBottom = overrides.cylinderRadiusBottom || 0.5
            newObject.cylinderHeight = overrides.cylinderHeight || 1.5
        }
        if (type === 'audio') {
            newObject.audioVolume = overrides.audioVolume ?? 0.8
            newObject.audioDistance = overrides.audioDistance ?? 8
            newObject.audioLoop = overrides.audioLoop ?? true
            newObject.audioAutoplay = overrides.audioAutoplay ?? true
            newObject.audioPaused = overrides.audioPaused ?? false
        }
        if (type === 'model') {
            newObject.opacity = overrides.opacity ?? 1
            newObject.applyModelColor = overrides.applyModelColor ?? false
            newObject.modelColor = overrides.modelColor ?? '#ffffff'
            newObject.modelFormat = overrides.modelFormat || detectModelFormatFromMeta(assetRef) || MODEL_FORMATS.GLTF
            newObject.materialsAssetRef = overrides.materialsAssetRef || null
        }
        if (['image', 'video'].includes(type)) {
            newObject.opacity = overrides.opacity ?? 1
        }
        if (['video', 'audio'].includes(type)) {
            newObject.mediaVariants = overrides.mediaVariants || null
            newObject.selectedVariant = overrides.selectedVariant || null
        }

        setObjects(prevObjects => [...prevObjects, newObject])
        applySelection([newObject.id])
        
        // Forward add events only when live scene emitters are explicitly enabled.
        if (socketEmit?.objectAdded) {
            socketEmit.objectAdded(newObject)
        }
    }, [applySelection, menuPosition3D, setMenu, setObjects, socketEmit])

    return { handleAddObject }
}

export default useObjectFactory
