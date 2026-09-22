import { useCallback, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { dressForShadows, undressShadows } from './shadowCasting.js'

// The scene-side half of `renderSettings.shadowCasting`, shared by the two
// surfaces that render the same document — the arrival view (StudioViewport)
// and walk mode (LiveProjectScene) — the same way RenderSettingsEffect is.
//
// It re-dresses the scene every so often instead of once, because the things
// that most need a shadow arrive late: a model's meshes come from a file
// seconds after React rendered the entity, and a scanned venue can take longer
// still. Twice a second, over a few hundred objects, costs nothing next to the
// shadow pass itself.
const REDRESS_EVERY_FRAMES = 30

export default function ShadowCasting({ enabled = false, mapSize = 1024 }) {
    const scene = useThree((state) => state.scene)
    const frames = useRef(0)

    const dress = useCallback(() => {
        if (!enabled || !scene) return
        dressForShadows(scene, mapSize)
    }, [enabled, mapSize, scene])

    // Dress while it is on, and put the scene back the moment it goes off or
    // this surface goes away. The cleanup is the switch's other half: the flags
    // outlive the setting otherwise, and shadows kept rendering until a reload.
    useEffect(() => {
        if (!enabled || !scene) return undefined
        dress()
        return () => { undressShadows(scene) }
    }, [dress, enabled, scene])

    useFrame(() => {
        if (!enabled) return
        frames.current += 1
        if (frames.current % REDRESS_EVERY_FRAMES === 0) dress()
    })

    return null
}
