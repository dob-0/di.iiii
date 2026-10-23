import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import { geometryPoints } from '../points/geometryPoints.js'
import { pointBudget } from '../points/surfacePoints.js'
import { asColor } from '../../utils/colorValue.js'

// What a bare Points scatters over, so a placed node is visible before
// anything is wired. Plain data, the same shape a Sphere sends down a wire.
export const BARE_POINTS_SOURCE = Object.freeze({ kind: 'sphere', radius: 0.5 })

const matches = (query) => {
    try { return Boolean(window.matchMedia?.(query)?.matches) } catch { return false }
}

// A phone (coarse pointer) or a visitor who asked their system for less motion
// gets the lighter cap (pointBudget). Read once per mount: neither changes
// while a scene is open often enough to justify a listener.
export const prefersLightPoints = () => (
    typeof window !== 'undefined'
    && (matches('(pointer: coarse)') || matches('(prefers-reduced-motion: reduce)'))
)

// The Points node's body: one GPU points object. The cloud is sampled on the
// CPU from the Source wire (src/project/points/geometryPoints.js, tested
// without a GPU) and rebuilt only when the wire's description or the count
// changes, never per frame. Size is in scene units and shrinks with distance.
export default function PointCloud({ source, count, size, color }) {
    const light = useMemo(() => prefersLightPoints(), [])
    const budget = pointBudget(count, { light })
    const shape = source || BARE_POINTS_SOURCE
    // The descriptor arrives as a new object on every evaluation; its text is
    // the honest identity (descriptors are small: at most 256 pieces).
    const key = JSON.stringify(shape)
    const geometry = useMemo(() => {
        const cloud = geometryPoints(JSON.parse(key), budget)
        const built = new BufferGeometry()
        built.setAttribute('position', new BufferAttribute(cloud.positions, 3))
        built.computeBoundingSphere()
        return built
    }, [key, budget])
    useEffect(() => () => geometry.dispose(), [geometry])
    const pointSize = Math.min(1, Math.max(0.001, Math.abs(Number(size) || 0.02)))
    return (
        <points geometry={geometry}>
            <pointsMaterial color={asColor(color, '#5fa8ff')} size={pointSize} sizeAttenuation />
        </points>
    )
}
