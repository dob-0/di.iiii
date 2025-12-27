import React, { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { MODEL_FORMATS, detectModelFormatFromMeta, detectModelFormatFromName } from '../utils/modelFormats.js'
import { getAssetBlob } from '../storage/assetStore.js'
import { getAssetSourceUrl, streamRemoteAsset } from '../services/assetSources.js'

export default function ModelObject({
    assetRef,
    data,
    modelColor = '#ffffff',
    applyModelColor = false,
    opacity = 1,
    materialsAssetRef = null,
    modelFormat = null
}) {
    const [loadedScene, setLoadedScene] = useState(null)

    const effectiveFormat = useMemo(() => {
        if (modelFormat) return modelFormat
        const inferred = detectModelFormatFromMeta(assetRef)
        if (inferred) return inferred
        if (typeof data === 'string') {
            return detectModelFormatFromName(data) || MODEL_FORMATS.GLTF
        }
        return MODEL_FORMATS.GLTF
    }, [modelFormat, assetRef?.name, assetRef?.mimeType, data])

    useEffect(() => {
        let disposed = false

        const resolveAssetSource = async (ref, fallbackUrl) => {
            if (ref?.id) {
                try {
                    const blob = await getAssetBlob(ref.id)
                    if (blob) {
                        return { blob, type: 'blob' }
                    }
                } catch (error) {
                    console.error(`Failed to read asset blob ${ref.id}`, error)
                }
                try {
                    const streamed = await streamRemoteAsset(ref.id)
                    if (streamed) {
                        return { blob: streamed, type: 'blob' }
                    }
                } catch {
                    // fall through to URL lookup
                }
                const remoteUrl = getAssetSourceUrl(ref.id)
                if (remoteUrl) {
                    return { url: remoteUrl, type: 'url' }
                }
            }
            if (typeof fallbackUrl === 'string') {
                return { url: fallbackUrl, type: 'url' }
            }
            return null
        }

        const readArrayBuffer = async (source) => {
            if (!source) return null
            if (source.blob) {
                return source.blob.arrayBuffer()
            }
            if (source.url) {
                const response = await fetch(source.url)
                if (!response.ok) throw new Error(`Failed to fetch ${source.url}`)
                return response.arrayBuffer()
            }
            return null
        }

        const readText = async (source) => {
            if (!source) return null
            if (source.blob) {
                return source.blob.text()
            }
            if (source.url) {
                const response = await fetch(source.url)
                if (!response.ok) throw new Error(`Failed to fetch ${source.url}`)
                return response.text()
            }
            return null
        }

        const handleScene = (scene) => {
            if (disposed) return
            setLoadedScene(scene)
        }

        const handleError = (error) => {
            if (disposed) return
            console.error('Failed to load model', error)
            setLoadedScene(null)
        }

        const loadModel = async () => {
            const assetSource = await resolveAssetSource(assetRef, data)
            if (!assetSource) {
                setLoadedScene(null)
                return
            }
            const materialSource = await resolveAssetSource(materialsAssetRef, null)
            try {
                if (effectiveFormat === MODEL_FORMATS.OBJ) {
                    const objText = await readText(assetSource)
                    if (!objText) throw new Error('OBJ source missing text data.')
                    let materials = null
                    if (materialSource) {
                        const mtlText = await readText(materialSource)
                        if (mtlText) {
                            materials = new MTLLoader().parse(mtlText)
                            materials?.preload?.()
                        }
                    }
                    const loader = new OBJLoader()
                    if (materials) loader.setMaterials(materials)
                    const scene = loader.parse(objText)
                    handleScene(scene)
                    return
                }

                if (effectiveFormat === MODEL_FORMATS.STL) {
                    const arrayBuffer = await readArrayBuffer(assetSource)
                    if (!arrayBuffer) throw new Error('STL source missing array buffer.')
                    const geometry = new STLLoader().parse(arrayBuffer)
                    geometry.computeVertexNormals?.()
                    const material = new THREE.MeshStandardMaterial({ color: 0xffffff })
                    const mesh = new THREE.Mesh(geometry, material)
                    mesh.castShadow = true
                    mesh.receiveShadow = true
                    const group = new THREE.Group()
                    group.add(mesh)
                    handleScene(group)
                    return
                }

                // default to GLTF/GLB
                const arrayBuffer = await readArrayBuffer(assetSource)
                if (!arrayBuffer) throw new Error('GLTF source missing array buffer.')
                const loader = new GLTFLoader()
                loader.parse(
                    arrayBuffer,
                    '',
                    (gltf) => {
                        const scene = gltf?.scene || gltf?.scenes?.[0] || null
                        handleScene(scene)
                    },
                    handleError
                )
            } catch (error) {
                handleError(error)
            }
        }

        loadModel()

        return () => {
            disposed = true
        }
    }, [assetRef?.id, materialsAssetRef?.id, data, effectiveFormat])

    const renderedScene = useMemo(() => {
        if (!loadedScene) return null
        const clone = loadedScene.clone(true)
        clone.traverse((child) => {
            if (!child.isMesh) return
            let nextMaterial
            if (applyModelColor) {
                nextMaterial = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(modelColor)
                })
            } else if (Array.isArray(child.material)) {
                nextMaterial = child.material.map((mat) => mat?.clone?.() || mat)
            } else {
                nextMaterial = child.material?.clone?.() || child.material
            }

            const applyCommonProps = (material) => {
                if (!material) return
                material.transparent = opacity < 1 || material.transparent
                material.opacity = opacity
                material.needsUpdate = true
            }

            if (Array.isArray(nextMaterial)) {
                nextMaterial.forEach(applyCommonProps)
            } else {
                applyCommonProps(nextMaterial)
            }

            child.material = nextMaterial
            child.frustumCulled = false
            child.castShadow = true
            child.receiveShadow = true
        })
        return clone
    }, [loadedScene, applyModelColor, modelColor, opacity])

    if (!renderedScene) return null

    return <primitive object={renderedScene} />
}
