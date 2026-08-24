import React, { useEffect, useState } from 'react'
import * as THREE from 'three'
import { useAssetUrl } from '../hooks/useAssetUrl.js'
import { asColor } from '../utils/colorValue.js'

// Standard material shared by the solid primitives (box, sphere, cone,
// cylinder). Defaults mirror bare meshStandardMaterial (roughness 1,
// metalness 0, no emission) so documents authored before these appearance
// fields existed render exactly as they always did. `color` keeps acting as
// a tint when a texture is set — pick white to show the image unmodified.
export default function PrimitiveMaterial({ color, wireframe = false, opacity = 1, textureAsset = null, textureLive = null, roughness, metalness, emissive, emissiveIntensity, side }) {
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

    // A live THREE.Texture (a webcam's or video's Frame) wins over anything
    // loaded from a URL — it is already a texture, not a place to fetch one.
    const liveMap = textureLive?.isTexture ? textureLive : null
    return (
        <meshStandardMaterial
            // toggling map on/off needs a shader recompile — remount instead
            key={liveMap ? liveMap.uuid : (map ? map.uuid : 'flat')}
            color={asColor(color)}
            map={liveMap || map}
            wireframe={wireframe}
            transparent={wireframe || opacity < 1}
            opacity={opacity}
            // A mostly-see-through surface must not write depth: with the
            // three.js default it hole-punches particles, grids and other
            // translucents behind it, which reads as broken glass the moment
            // two ghost boxes overlap. Solid-ish translucency (>=0.5) keeps
            // depth so it still occludes what is genuinely behind it.
            depthWrite={!(opacity < 0.5)}
            roughness={Number.isFinite(roughness) ? Math.min(1, Math.max(0, roughness)) : 1}
            metalness={Number.isFinite(metalness) ? Math.min(1, Math.max(0, metalness)) : 0}
            emissive={asColor(emissive, '#000000')}
            emissiveIntensity={Number.isFinite(emissiveIntensity) ? Math.max(0, emissiveIntensity) : 1}
            {...(side !== undefined ? { side } : {})}
        />
    )
}
