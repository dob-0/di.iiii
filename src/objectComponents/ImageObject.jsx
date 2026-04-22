import React, { useEffect, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useAssetUrl } from '../hooks/useAssetUrl.js'

export default function ImageObject({ assetRef, data, opacity = 1, linkActive }) {
    const assetUrl = useAssetUrl(assetRef, { preferRemoteSource: true })
    const isImageType = !assetRef?.mimeType || assetRef.mimeType.startsWith('image/')
    const sourceUrl = (isImageType ? assetUrl : null) || data || null
    const textureRef = useRef(null)
    const [texture, setTexture] = useState(null)
    const [size, setSize] = useState([1, 1])

    useEffect(() => {
        const resolvedSrc = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''
        if (!resolvedSrc || resolvedSrc === 'blob:null') {
            return () => {}
        }

        let isCancelled = false
        const loader = new THREE.TextureLoader()
        loader.setCrossOrigin('anonymous')

        loader.load(
            resolvedSrc,
            (loadedTexture) => {
                if (isCancelled) {
                    loadedTexture.dispose()
                    return
                }

                loadedTexture.colorSpace = THREE.SRGBColorSpace
                loadedTexture.needsUpdate = true

                const image = loadedTexture.image
                const width = image?.naturalWidth || image?.videoWidth || image?.width || 1
                const height = image?.naturalHeight || image?.videoHeight || image?.height || 1
                const aspect = width / Math.max(height, 1)
                setSize([Math.max(aspect * 3, 0.5), 3])

                const previousTexture = textureRef.current
                textureRef.current = loadedTexture
                setTexture(loadedTexture)

                if (previousTexture && previousTexture !== loadedTexture) {
                    previousTexture.dispose()
                }
            },
            undefined,
            (error) => {
                if (!isCancelled) {
                    console.warn('Failed to load image texture', resolvedSrc, error)
                }
            }
        )

        return () => {
            isCancelled = true
        }
    }, [sourceUrl])

    useEffect(() => {
        return () => {
            if (textureRef.current) {
                textureRef.current.dispose()
                textureRef.current = null
            }
        }
    }, [])

    if (!texture) {
        return null
    }

    return (
        <mesh position-y={0.01} rotation-x={-Math.PI / 2}>
            <planeGeometry args={size} />
            <meshBasicMaterial map={texture} transparent={true} toneMapped={false} opacity={opacity} />
            {linkActive && (
                <Html position={[0, 0.05, 0]} center>
                    <span className="link-label">🔗</span>
                </Html>
            )}
        </mesh>
    )
}
