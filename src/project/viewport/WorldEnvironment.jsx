import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js'
import { useAssetUrl } from '../../hooks/useAssetUrl.js'

const isExr = (name = '', url = '') => /\.exr(\?|$)/i.test(name) || /\.exr(\?|$)/i.test(url)

// Image-based lighting from an imported .hdr/.exr: the equirect texture
// becomes scene.environment so every standard material picks up reflections
// and diffuse light. Shared by the editor viewport and the public viewer.
export default function WorldEnvironment({ environmentAsset = null, intensity = 1 }) {
    const scene = useThree((state) => state.scene)
    const assetUrl = useAssetUrl(environmentAsset, { preferRemoteSource: true })
    const sourceUrl = environmentAsset ? (assetUrl || environmentAsset.url || null) : null
    const [texture, setTexture] = useState(null)

    useEffect(() => {
        const resolved = typeof sourceUrl === 'string' ? sourceUrl.trim() : ''
        if (!resolved || resolved === 'blob:null') {
            setTexture(null)
            return undefined
        }
        let cancelled = false
        let loaded = null
        const loader = isExr(environmentAsset?.name, resolved) ? new EXRLoader() : new RGBELoader()
        loader.load(
            resolved,
            (tex) => {
                if (cancelled) {
                    tex.dispose()
                    return
                }
                tex.mapping = THREE.EquirectangularReflectionMapping
                loaded = tex
                setTexture(tex)
            },
            undefined,
            (error) => {
                console.warn('[WorldEnvironment] failed to load environment map:', environmentAsset?.name, error?.message || error)
                if (!cancelled) setTexture(null)
            }
        )
        return () => {
            cancelled = true
            loaded?.dispose()
            setTexture(null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sourceUrl])

    useEffect(() => {
        if (!texture) return undefined
        const previous = scene.environment
        const previousIntensity = scene.environmentIntensity
        scene.environment = texture
        scene.environmentIntensity = Number.isFinite(intensity) ? Math.max(0, intensity) : 1
        return () => {
            scene.environment = previous
            scene.environmentIntensity = previousIntensity
        }
    }, [scene, texture, intensity])

    return null
}
