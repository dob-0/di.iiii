import React, { useEffect, useState } from 'react'
import * as THREE from 'three'
import { useAssetUrl } from '../hooks/useAssetUrl.js'

// Standard material shared by the solid primitives (box, sphere, cone,
// cylinder). Defaults mirror bare meshStandardMaterial (roughness 1,
// metalness 0, no emission) so documents authored before these appearance
// fields existed render exactly as they always did. `color` keeps acting as
// a tint when a texture is set — pick white to show the image unmodified.
export default function PrimitiveMaterial({ color, wireframe = false, opacity = 1, textureAsset = null, roughness, metalness, emissive, emissiveIntensity }) {
    const assetUrl = useAssetUrl(textureAsset, { preferRemoteSource: true })
    const sourceUrl = textureAsset ? (assetUrl || textureAsset.url || null) : null
    const [map, setMap] = useState(null)

    useEffect(() => {
        const resolved = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''
        if (!resolved || resolved === 'blob:null') {
            setMap(null)
            return undefined
        }
        let cancelled = false
        let loaded = null
        const loader = new THREE.TextureLoader()
        loader.setCrossOrigin('anonymous')
        loader.load(
            resolved,
            (texture) => {
                if (cancelled) {
                    texture.dispose()
                    return
                }
                texture.colorSpace = THREE.SRGBColorSpace
                loaded = texture
                setMap(texture)
            },
            undefined,
            () => { if (!cancelled) setMap(null) }
        )
        return () => {
            cancelled = true
            loaded?.dispose()
            setMap(null)
        }
    }, [sourceUrl])

    return (
        <meshStandardMaterial
            // toggling map on/off needs a shader recompile — remount instead
            key={map ? map.uuid : 'flat'}
            color={color}
            map={map}
            wireframe={wireframe}
            transparent={wireframe || opacity < 1}
            opacity={opacity}
            roughness={Number.isFinite(roughness) ? Math.min(1, Math.max(0, roughness)) : 1}
            metalness={Number.isFinite(metalness) ? Math.min(1, Math.max(0, metalness)) : 0}
            emissive={emissive || '#000000'}
            emissiveIntensity={Number.isFinite(emissiveIntensity) ? Math.max(0, emissiveIntensity) : 1}
        />
    )
}
