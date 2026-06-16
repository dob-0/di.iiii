import * as THREE from 'three'
import { SCENE_DATA_VERSION, defaultScene, generateObjectId } from '../shared/sceneSchema.js'

const numberOr = (value, fallback) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
}

const vectorArray = (vector, fallback = [0, 0, 0]) => {
    if (!vector) return [...fallback]
    return [
        numberOr(vector.x, fallback[0]),
        numberOr(vector.y, fallback[1]),
        numberOr(vector.z, fallback[2])
    ]
}

const colorToHex = (value, fallback) => {
    if (!value || !value.isColor) return fallback
    return `#${value.getHexString()}`
}

const extractMaterialColor = (material, fallback = '#ffffff') => {
    if (Array.isArray(material)) {
        for (const candidate of material) {
            if (candidate?.color?.isColor) {
                return colorToHex(candidate.color, fallback)
            }
        }
        return fallback
    }
    if (material?.color?.isColor) {
        return colorToHex(material.color, fallback)
    }
    return fallback
}

const mapMeshObject = (mesh) => {
    const geometry = mesh?.geometry
    if (!geometry?.type) return null

    const materialColor = extractMaterialColor(mesh.material, '#ff0000')
    const base = {
        id: generateObjectId(),
        position: vectorArray(mesh.position, [0, 0, 0]),
        rotation: vectorArray(mesh.rotation, [0, 0, 0]),
        scale: vectorArray(mesh.scale, [1, 1, 1]),
        color: materialColor,
        isVisible: mesh.visible !== false,
        data: mesh.name || null,
        linkUrl: '',
        linkActive: false
    }

    switch (geometry.type) {
    case 'BoxGeometry':
    case 'BoxBufferGeometry':
        return {
            ...base,
            type: 'box',
            boxSize: [
                numberOr(geometry.parameters?.width, 1),
                numberOr(geometry.parameters?.height, 1),
                numberOr(geometry.parameters?.depth, 1)
            ]
        }
    case 'SphereGeometry':
    case 'SphereBufferGeometry':
        return {
            ...base,
            type: 'sphere',
            sphereRadius: numberOr(geometry.parameters?.radius, 0.5)
        }
    case 'ConeGeometry':
    case 'ConeBufferGeometry':
        return {
            ...base,
            type: 'cone',
            coneRadius: numberOr(geometry.parameters?.radius, 0.5),
            coneHeight: numberOr(geometry.parameters?.height, 1.5)
        }
    case 'CylinderGeometry':
    case 'CylinderBufferGeometry':
        return {
            ...base,
            type: 'cylinder',
            cylinderRadiusTop: numberOr(geometry.parameters?.radiusTop, 0.5),
            cylinderRadiusBottom: numberOr(geometry.parameters?.radiusBottom, 0.5),
            cylinderHeight: numberOr(geometry.parameters?.height, 1.5)
        }
    default:
        return null
    }
}

export const importThreeEditorScene = (jsonData) => {
    if (!jsonData || typeof jsonData !== 'object') {
        throw new Error('Invalid JSON payload.')
    }

    const objectLoader = new THREE.ObjectLoader()
    let root
    try {
        root = objectLoader.parse(jsonData)
    } catch {
        throw new Error('Could not parse Three.js scene JSON.')
    }

    const importedObjects = []
    let ambientLight = null
    let directionalLight = null

    root.traverse((node) => {
        if (node.isAmbientLight && !ambientLight) {
            ambientLight = {
                color: colorToHex(node.color, defaultScene.ambientLight.color),
                intensity: numberOr(node.intensity, defaultScene.ambientLight.intensity)
            }
            return
        }

        if (node.isDirectionalLight && !directionalLight) {
            directionalLight = {
                color: colorToHex(node.color, defaultScene.directionalLight.color),
                intensity: numberOr(node.intensity, defaultScene.directionalLight.intensity),
                position: vectorArray(node.position, defaultScene.directionalLight.position)
            }
            return
        }

        if (node.isMesh) {
            const mapped = mapMeshObject(node)
            if (mapped) {
                importedObjects.push(mapped)
            }
        }
    })

    const backgroundColor = root?.background?.isColor
        ? colorToHex(root.background, defaultScene.backgroundColor)
        : defaultScene.backgroundColor

    return {
        version: SCENE_DATA_VERSION,
        objects: importedObjects,
        backgroundColor,
        gridSize: defaultScene.gridSize,
        gridAppearance: defaultScene.gridAppearance,
        isGridVisible: defaultScene.isGridVisible,
        isGizmoVisible: defaultScene.isGizmoVisible,
        isPerfVisible: defaultScene.isPerfVisible,
        ambientLight: ambientLight || defaultScene.ambientLight,
        directionalLight: directionalLight || defaultScene.directionalLight,
        transformSnaps: defaultScene.transformSnaps,
        default3DView: defaultScene.default3DView,
        savedView: defaultScene.savedView,
        sceneVersion: 0,
        assets: [],
        assetsBaseUrl: ''
    }
}

export default importThreeEditorScene