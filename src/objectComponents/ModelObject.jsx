import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { MODEL_FORMATS, detectModelFormatFromMeta, detectModelFormatFromName } from '../utils/modelFormats.js'
import { deleteAsset, getAssetBlob } from '../storage/assetStore.js'
import { getAssetSourceUrl, streamRemoteAsset } from '../services/assetSources.js'
import { isHtmlLikeMimeType } from '../utils/assetContentType.js'

// Compressed GLBs (Draco / Meshopt — the default export of most DCC tools and
// asset stores) need their decoders registered or the load fails silently to
// an invisible model. Decoder wasm ships in public/draco/.
let sharedDracoLoader = null
const getDracoLoader = () => {
    if (!sharedDracoLoader) {
        sharedDracoLoader = new DRACOLoader()
        sharedDracoLoader.setDecoderPath('/draco/')
    }
    return sharedDracoLoader
}

export default function ModelObject({
    assetRef,
    data,
    modelColor = '#ffffff',
    applyModelColor = false,
    opacity = 1,
    materialsAssetRef = null,
    modelFormat = null,
    playAnimations = true,
    animationSpeed = 1
}) {
    const [loaded, setLoaded] = useState(null)
    const loadedScene = loaded?.scene || null

    const effectiveFormat = useMemo(() => {
        if (modelFormat) return modelFormat
        const inferred = detectModelFormatFromMeta(assetRef)
        if (inferred) return inferred
        if (typeof data === 'string') {
            return detectModelFormatFromName(data) || MODEL_FORMATS.GLTF
        }
        return MODEL_FORMATS.GLTF
    }, [modelFormat, assetRef, data])

    useEffect(() => {
        let disposed = false

        const resolveAssetSource = async (ref, fallbackUrl) => {
            if (ref?.id) {
                try {
                    const blob = await getAssetBlob(ref.id)
                    if (blob) {
                        if (isHtmlLikeMimeType(blob.type)) {
                            try {
                                await deleteAsset(ref.id)
                            } catch {
                                // ignore cache cleanup errors and continue to remote recovery
                            }
                        } else {
                            return { blob, type: 'blob' }
                        }
                    }
                } catch {
                    // ignore
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
                const response = await fetch(source.url, { cache: 'no-store' })
                if (!response.ok) throw new Error(`Failed to fetch ${source.url}`)
                const contentType = response.headers.get('content-type') || ''
                if (isHtmlLikeMimeType(contentType)) {
                    throw new Error(`URL returned HTML instead of model asset: ${source.url}`)
                }
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
                const response = await fetch(source.url, { cache: 'no-store' })
                if (!response.ok) throw new Error(`Failed to fetch ${source.url}`)
                const contentType = response.headers.get('content-type') || ''
                if (isHtmlLikeMimeType(contentType)) {
                    throw new Error(`URL returned HTML instead of model asset: ${source.url}`)
                }
                return response.text()
            }
            return null
        }

        const handleScene = (scene, animations = []) => {
            if (disposed) return
            setLoaded(scene ? { scene, animations } : null)
        }

        const handleError = (error) => {
            if (disposed) return
            console.warn('[ModelObject] failed to load model:', assetRef?.name || data, error?.message || error)
            setLoaded(null)
        }

        const loadModel = async () => {
            const assetSource = await resolveAssetSource(assetRef, data)
            if (!assetSource) {
                setLoaded(null)
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

                if (effectiveFormat === MODEL_FORMATS.FBX) {
                    const arrayBuffer = await readArrayBuffer(assetSource)
                    if (!arrayBuffer) throw new Error('FBX source missing array buffer.')
                    const group = new FBXLoader().parse(arrayBuffer, '')
                    handleScene(group, group?.animations || [])
                    return
                }

                // default to GLTF/GLB
                const arrayBuffer = await readArrayBuffer(assetSource)
                if (!arrayBuffer) throw new Error('GLTF source missing array buffer.')
                const loader = new GLTFLoader()
                loader.setDRACOLoader(getDracoLoader())
                loader.setMeshoptDecoder(MeshoptDecoder)
                loader.parse(
                    arrayBuffer,
                    '',
                    (gltf) => {
                        const scene = gltf?.scene || gltf?.scenes?.[0] || null
                        handleScene(scene, gltf?.animations || [])
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
    }, [assetRef, materialsAssetRef, data, effectiveFormat])

    const renderedScene = useMemo(() => {
        if (!loadedScene) return null
        // SkeletonUtils.clone keeps SkinnedMesh↔bone bindings intact; a plain
        // deep clone renders rigged models frozen in their bind pose.
        const clone = cloneSkeleton(loadedScene)
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

    // Embedded animation clips (glTF/FBX) play on the rendered clone; speed 0
    // or the Play animations toggle freezes them without reloading the model.
    const mixerRef = useRef(null)
    useEffect(() => {
        mixerRef.current = null
        const animations = loaded?.animations || []
        if (!renderedScene || !animations.length || playAnimations === false) return undefined
        const mixer = new THREE.AnimationMixer(renderedScene)
        animations.forEach((clip) => mixer.clipAction(clip).play())
        mixerRef.current = mixer
        return () => {
            mixer.stopAllAction()
            mixerRef.current = null
        }
    }, [renderedScene, loaded, playAnimations])

    useFrame((_, delta) => {
        const speed = Number.isFinite(animationSpeed) ? animationSpeed : 1
        mixerRef.current?.update(delta * speed)
    })

    if (!renderedScene) return null

    return <primitive object={renderedScene} />
}
