import JSZip from 'jszip'
import {
    normalizeProjectDocument,
    normalizeEntity
} from '../../shared/projectSchema.js'

const coerceAssetId = (value) => {
    const text = String(value || '').trim()
    return /^[a-f0-9-]{8,64}$/i.test(text) ? text : null
}

const mapLegacyObjectToEntity = (object, warnings = []) => {
    if (!object?.type) {
        warnings.push('Skipped an object without a type.')
        return null
    }

    const base = {
        id: object.id,
        name: object.name || object.type,
        components: {
            transform: {
                position: object.position || [0, 0, 0],
                rotation: object.rotation || [0, 0, 0],
                scale: object.scale || [1, 1, 1]
            },
            appearance: {
                color: object.color || '#5fa8ff',
                opacity: typeof object.opacity === 'number' ? object.opacity : 1
            }
        }
    }

    switch (object.type) {
        case 'box':
            return normalizeEntity({
                ...base,
                type: 'box',
                components: {
                    ...base.components,
                    primitive: { size: object.boxSize || [1, 1, 1] }
                }
            })
        case 'sphere':
            return normalizeEntity({
                ...base,
                type: 'sphere',
                components: {
                    ...base.components,
                    primitive: { radius: object.sphereRadius || 0.5 }
                }
            })
        case 'cone':
            return normalizeEntity({
                ...base,
                type: 'cone',
                components: {
                    ...base.components,
                    primitive: { radius: object.coneRadius || 0.55, height: object.coneHeight || 1.4 }
                }
            })
        case 'cylinder':
            return normalizeEntity({
                ...base,
                type: 'cylinder',
                components: {
                    ...base.components,
                    primitive: {
                        radiusTop: object.cylinderRadiusTop || object.cylinderRadius || 0.45,
                        radiusBottom: object.cylinderRadiusBottom || object.cylinderRadius || 0.45,
                        height: object.cylinderHeight || 1.2
                    }
                }
            })
        case 'text-2d':
        case 'text-3d':
            return normalizeEntity({
                ...base,
                type: 'text',
                components: {
                    ...base.components,
                    text: {
                        value: object.data || 'Imported Text',
                        variant: object.type === 'text-3d' ? '3d' : '2d',
                        fontFamily: object.fontFamily || 'Inter, sans-serif',
                        fontWeight: object.fontWeight || '600',
                        fontStyle: object.fontStyle || 'normal',
                        fontSize3D: object.fontSize3D || 0.45,
                        depth3D: object.depth3D || 0.08
                    }
                }
            })
        case 'image':
        case 'video':
        case 'audio':
        case 'model':
            return normalizeEntity({
                ...base,
                type: object.type,
                components: {
                    ...base.components,
                    media: {
                        assetId: coerceAssetId(object.assetRef?.id || object.asset?.id),
                        autoplay: object.audioAutoplay ?? object.videoAutoplay ?? object.autoplay ?? (object.type !== 'image'),
                        loop: object.audioLoop ?? object.videoLoop ?? true,
                        muted: object.type === 'video' ? true : false,
                        volume: object.audioVolume ?? 0.8,
                        distance: object.audioDistance ?? 8
                    }
                }
            })
        default:
            warnings.push(`Skipped unsupported legacy object type: ${object.type}`)
            return null
    }
}

const parseLegacySceneFile = async (file) => {
    const isZip = file.name?.toLowerCase().endsWith('.zip') || file.type?.includes('zip')
    if (isZip) {
        const zip = await JSZip.loadAsync(await file.arrayBuffer())
        const sceneEntry = zip.file('scene.json')
        if (!sceneEntry) {
            throw new Error('Legacy archive is missing scene.json')
        }
        const scene = JSON.parse(await sceneEntry.async('string'))
        const assetFiles = new Map()
        const assetsManifest = Array.isArray(scene.assets) ? scene.assets : []
        for (const asset of assetsManifest) {
            if (!asset?.archivePath) continue
            const entry = zip.file(asset.archivePath)
            if (!entry) continue
            const blob = await entry.async('blob')
            assetFiles.set(asset.id, new File([blob], asset.name || asset.id, { type: asset.mimeType || blob.type }))
        }
        return { scene, assetFiles }
    }

    const text = await file.text()
    return {
        scene: JSON.parse(text),
        assetFiles: new Map()
    }
}

export async function importLegacySceneFile(file) {
    const warnings = []
    const { scene, assetFiles } = await parseLegacySceneFile(file)
    const entities = Array.isArray(scene?.objects)
        ? scene.objects.map((object) => mapLegacyObjectToEntity(object, warnings)).filter(Boolean)
        : []
    const document = normalizeProjectDocument({
        projectMeta: {
            title: file.name.replace(/\.[^.]+$/, '') || 'Imported Legacy Scene',
            source: 'legacy-import'
        },
        entities,
        worldState: {
            backgroundColor: scene?.backgroundColor,
            gridVisible: scene?.isGridVisible,
            gridSize: scene?.gridSize,
            ambientLight: scene?.ambientLight,
            directionalLight: scene?.directionalLight,
            savedView: scene?.savedView || scene?.default3DView
        },
        assets: Array.from(assetFiles.entries()).map(([assetId, assetFile]) => ({
            id: coerceAssetId(assetId) || undefined,
            name: assetFile.name,
            mimeType: assetFile.type,
            size: assetFile.size,
            source: 'import'
        }))
    })

    return {
        document,
        assetFiles,
        warnings
    }
}
