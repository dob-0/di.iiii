import React, { useState, useEffect } from 'react'
import { Html, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { useAssetUrl } from '../hooks/useAssetUrl.js'

const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

export default function ImageObject({ assetRef, data, opacity = 1, linkActive }) {
    const assetUrl = useAssetUrl(assetRef)
    const isImageType = !assetRef?.mimeType || assetRef.mimeType.startsWith('image/')
    const sourceUrl = (isImageType ? assetUrl : null) || data || TRANSPARENT_PIXEL
    const texture = useTexture(sourceUrl)
    const [size, setSize] = useState([1, 1])
    
    useEffect(() => {
        if (!texture) return
        texture.colorSpace = THREE.SRGBColorSpace
        texture.needsUpdate = true
        if (texture?.image?.naturalWidth && texture.image.naturalHeight) {
            const { naturalWidth, naturalHeight } = texture.image
            const aspect = naturalWidth / naturalHeight
            setSize([Math.max(aspect * 3, 0.5), 3])
        }
    }, [texture])

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
